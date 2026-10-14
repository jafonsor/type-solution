-- | A Run: one timed attempt at a single Puzzle, from the first keystroke
-- until the Solution passes. Pure, so the browser wiring only feeds it
-- events.
module Common.Run
  ( Run (..)
  , Phase (..)
  , Event (..)
  , Outcome (..)
  , TestResult (..)
  , newRun
  , step
  , elapsed
  , failedTests
  , checkRequest
  , parseReply
  ) where

import Control.Applicative ((<|>))
import Data.Aeson (FromJSON (..), Value, object, withObject, (.:), (.=))
import Data.Aeson qualified as Aeson
import Data.Aeson.Types (Parser, parseMaybe)
import Data.ByteString.Lazy qualified as LBS
import Data.Text (Text)
import Data.Text.Encoding qualified as T
import Data.Time (NominalDiffTime, UTCTime, diffUTCTime)

import Common.Puzzle

data Phase
  = NotStarted
  | Typing
  | Checking
  | Checked
    -- ^ The last check failed; 'outcome' says why.
  | Passed
  deriving stock (Eq, Show)

-- | What one check of the Solution against the Puzzle's tests found.
data Outcome
  = SyntaxError Text
  | Crashed Text
    -- ^ The Solution threw before any test ran, or isn't a function.
  | TimedOut
  | Results [TestResult]
    -- ^ One per test, in the Puzzle's order.
  deriving stock (Eq, Show)

data TestResult = TestResult
  { passed :: Bool
  , got :: Text
    -- ^ What the Solution returned, as JavaScript would write it, or the
    -- error it threw.
  }
  deriving stock (Eq, Show)

data Run = Run
  { phase :: Phase
  , outcome :: Maybe Outcome
    -- ^ The last check's, kept while the player types again.
  , startedAt :: Maybe UTCTime
  , finishedAt :: Maybe UTCTime
  , awaiting :: Maybe Int
    -- ^ The check whose outcome counts; any other is stale.
  }
  deriving stock (Eq, Show)

data Event
  = Edited UTCTime
  | CheckStarted Int
  | CheckFinished UTCTime Int Outcome
  | Restarted
  deriving stock (Eq, Show)

newRun :: Run
newRun = Run
  { phase = NotStarted
  , outcome = Nothing
  , startedAt = Nothing
  , finishedAt = Nothing
  , awaiting = Nothing
  }

step :: Event -> Run -> Run
step Restarted _ = newRun
step _ r | r.phase == Passed = r
step e r = case e of
  Edited t -> r
    { phase = Typing
    , startedAt = r.startedAt <|> Just t
    , awaiting = Nothing
    }
  CheckStarted n -> r { phase = Checking, awaiting = Just n }
  CheckFinished t n o
    | r.awaiting /= Just n -> r
    | allPassed o -> r { phase = Passed, outcome = Just o, finishedAt = Just t, awaiting = Nothing }
    | otherwise -> r { phase = Checked, outcome = Just o, awaiting = Nothing }
  where
    allPassed = \case
      Results rs@(_ : _) -> all (.passed) rs
      _ -> False

-- | The Run's time so far, frozen once it passes.
elapsed :: UTCTime -> Run -> NominalDiffTime
elapsed now r = case r.startedAt of
  Nothing -> 0
  Just s -> diffUTCTime (maybe now id r.finishedAt) s

-- | Each failed test as its call, the expected value and what the Solution
-- returned.
failedTests :: Puzzle -> Outcome -> [(Text, Text, Text)]
failedTests p = \case
  Results rs ->
    [ (callText p t, valueText t.expected, res.got)
    | (t, res) <- zip p.tests rs
    , not res.passed
    ]
  _ -> []

-- * The test-runner worker's protocol: JSON text both ways.

-- | What the worker gets: the Solution's code, the function to call, and the
-- tests as @[{args, expected}]@.
checkRequest :: Puzzle -> Text -> Text
checkRequest p code = T.decodeUtf8 $ LBS.toStrict $ Aeson.encode $ object
  [ "code" .= code
  , "fn" .= p.function
  , "tests" .= [ object [ "args" .= t.args, "expected" .= t.expected ] | t <- p.tests ]
  ]

-- | The worker's reply: @{kind: "results", results: [{pass, got}]}@ or
-- @{kind: "error", message}@. Anything else counts as a crash.
parseReply :: Text -> Outcome
parseReply txt =
  case Aeson.decodeStrict (T.encodeUtf8 txt) >>= parseMaybe reply of
    Just o -> o
    Nothing -> Crashed "The test runner sent an unreadable reply."
  where
    reply :: Value -> Parser Outcome
    reply = withObject "reply" \o -> o .: "kind" >>= \case
      ("results" :: Text) -> Results <$> o .: "results"
      "error" -> Crashed <$> o .: "message"
      _ -> fail "unknown kind"

instance FromJSON TestResult where
  parseJSON = withObject "TestResult" \o ->
    TestResult <$> o .: "pass" <*> o .: "got"
