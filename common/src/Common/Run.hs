-- | A Run: one timed attempt at a single Puzzle, from the first keystroke
-- until the Solution passes, not counting Pauses. Pure, so the browser
-- wiring only feeds it events.
module Common.Run
  ( Run (..)
  , Phase (..)
  , Event (..)
  , Outcome (..)
  , TestResult (..)
  , Key (..)
  , newRun
  , step
  , menuOpen
  , elapsed
  , wordsPerMinute
  , RunRecord (..)
  , runRecord
  , recordOnStep
  , recordText
  , failedTests
  , checkRequest
  , parseReply
  ) where

import Control.Applicative ((<|>))
import Data.Aeson (FromJSON (..), ToJSON (..), Value, object, withObject, (.:), (.=))
import Data.Aeson qualified as Aeson
import Data.Aeson.Types (Parser, parseMaybe)
import Data.ByteString.Lazy qualified as LBS
import Data.Text (Text)
import Data.Text.Encoding qualified as T
import Data.Maybe (fromMaybe)
import Data.Time (NominalDiffTime, UTCTime, diffUTCTime)

import Common.Puzzle

data Phase
  = NotStarted
  | Typing
  | Checking
  | Checked
    -- ^ The last check failed; 'outcome' says why.
  | Paused
    -- ^ Esc during the Run: the clock is stopped until Esc again.
  | Skipped
    -- ^ Esc before the first keystroke: the Run never started.
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
  , code :: Text
    -- ^ The Solution as last edited; once passed, the passing one.
  , wordsTyped :: Int
    -- ^ Spaces and Enters pressed straight after a character.
  , backspaces :: Int
  , lastKey :: Maybe Key
  , pausedSince :: Maybe UTCTime
    -- ^ When the Pause under way began.
  , pausedFor :: NominalDiffTime
    -- ^ The time spent in Pauses that have ended.
  , resumeTo :: Phase
    -- ^ While Paused: the phase Esc carries on in.
  }
  deriving stock (Eq, Show)

-- | The key presses a Run counts; the editor reports no others.
data Key = Character | Space | Enter | Backspace
  deriving stock (Eq, Show)

data Event
  = Edited UTCTime Text
  | Pressed Key
  | CheckStarted Int
  | CheckFinished UTCTime Int Outcome
  | Escaped UTCTime
    -- ^ Esc: skips a Run not started, pauses one under way, or carries on
    -- from a Pause.
  | NewRunStarted
    -- ^ A menu button: a fresh Run, on the same Puzzle or another. A Run
    -- dropped this way never passed, so it leaves no record.
  deriving stock (Eq, Show)

newRun :: Run
newRun = Run
  { phase = NotStarted
  , outcome = Nothing
  , startedAt = Nothing
  , finishedAt = Nothing
  , awaiting = Nothing
  , code = ""
  , wordsTyped = 0
  , backspaces = 0
  , lastKey = Nothing
  , pausedSince = Nothing
  , pausedFor = 0
  , resumeTo = Typing
  }

step :: Event -> Run -> Run
step e r = case (e, r.phase) of
  (NewRunStarted, _) -> newRun
  (_, Passed) -> r
  (_, Skipped) -> r
  (Escaped _, NotStarted) -> r { phase = Skipped }
  (Escaped t, Paused) -> r
    { phase = r.resumeTo
    , pausedSince = Nothing
    , pausedFor = r.pausedFor + maybe 0 (diffUTCTime t) r.pausedSince
    }
  (Escaped t, ph) -> r { phase = Paused, resumeTo = ph, pausedSince = Just t }
  -- The editor is read-only while Paused; nothing typed counts.
  (Edited _ _, Paused) -> r
  (Pressed _, Paused) -> r
  (Edited t c, _) -> r
    { phase = Typing
    , startedAt = r.startedAt <|> Just t
    , awaiting = Nothing
    , code = c
    }
  (Pressed k, _) -> r
    { wordsTyped = r.wordsTyped + (if endsWord k then 1 else 0)
    , backspaces = r.backspaces + (if k == Backspace then 1 else 0)
    , lastKey = Just k
    }
    where endsWord key = (key == Space || key == Enter) && r.lastKey == Just Character
  -- Nothing typed yet, nothing to check: a check left over from a dropped
  -- Run.
  (CheckStarted _, NotStarted) -> r
  -- A check that started before or during a Pause still counts.
  (CheckStarted n, Paused) -> r { resumeTo = Checking, awaiting = Just n }
  (CheckStarted n, _) -> r { phase = Checking, awaiting = Just n }
  (CheckFinished t n o, ph)
    | r.awaiting /= Just n -> r
    -- A pass during a Pause ends the Run when the Pause began.
    | allPassed o -> r
        { phase = Passed
        , outcome = Just o
        , finishedAt = Just (fromMaybe t r.pausedSince)
        , pausedSince = Nothing
        , awaiting = Nothing
        }
    | ph == Paused -> r { resumeTo = Checked, outcome = Just o, awaiting = Nothing }
    | otherwise -> r { phase = Checked, outcome = Just o, awaiting = Nothing }
  where
    allPassed = \case
      Results rs@(_ : _) -> all (.passed) rs
      _ -> False

-- | Whether the menu (New random Puzzle, Repeat Puzzle) is open: after a
-- pass, during a Pause and after a skip. The editor is read-only then.
menuOpen :: Run -> Bool
menuOpen r = case r.phase of
  Paused -> True
  Skipped -> True
  Passed -> True
  NotStarted -> False
  Typing -> False
  Checking -> False
  Checked -> False

-- | The Run's time so far, not counting Pauses: frozen while Paused and once
-- it passes.
elapsed :: UTCTime -> Run -> NominalDiffTime
elapsed now r = case r.startedAt of
  Nothing -> 0
  Just s -> diffUTCTime (fromMaybe now (r.finishedAt <|> r.pausedSince)) s - r.pausedFor

-- | Words per minute over the Run's time, once it has passed.
wordsPerMinute :: Run -> Maybe Double
wordsPerMinute r = case r.finishedAt of
  Just f | d > 0 -> Just (fromIntegral r.wordsTyped * 60 / realToFrac d)
    where d = elapsed f r
  _ -> Nothing

-- | What a passed Run leaves behind.
data RunRecord = RunRecord
  { puzzleIdentity :: Text
    -- ^ Which Puzzle: its identity (file name). Records stored before
    -- Puzzles had one hold the function name here; for fizzBuzz they're
    -- the same.
  , finishedAt :: UTCTime
  , duration :: Double
    -- ^ In seconds.
  , wpm :: Double
  , backspaces :: Int
  , solution :: Text
  }
  deriving stock (Eq, Show)

runRecord :: Puzzle -> Run -> Maybe RunRecord
runRecord p r = case (r.phase, r.finishedAt, wordsPerMinute r) of
  (Passed, Just f, Just perMinute) -> Just RunRecord
    { puzzleIdentity = p.identity
    , finishedAt = f
    , duration = realToFrac (elapsed f r)
    , wpm = perMinute
    , backspaces = r.backspaces
    , solution = r.code
    }
  _ -> Nothing

-- | The record a step from the first Run to the second leaves behind: one
-- when that step passed the Run, so each passed Run is kept exactly once.
recordOnStep :: Puzzle -> Run -> Run -> Maybe RunRecord
recordOnStep p old new
  | old.phase /= Passed = runRecord p new
  | otherwise = Nothing

-- | The record as JSON text, for the browser's storage.
recordText :: RunRecord -> Text
recordText = T.decodeUtf8 . LBS.toStrict . Aeson.encode

instance ToJSON RunRecord where
  toJSON rr = object
    [ "puzzle" .= rr.puzzleIdentity
    , "finishedAt" .= rr.finishedAt
    , "seconds" .= rr.duration
    , "wordsPerMinute" .= rr.wpm
    , "backspaces" .= rr.backspaces
    , "solution" .= rr.solution
    ]

-- | Reads what 'toJSON' writes, records stored by earlier versions included.
instance FromJSON RunRecord where
  parseJSON = withObject "RunRecord" \o -> do
    i <- o .: "puzzle"
    f <- o .: "finishedAt"
    d <- o .: "seconds"
    w <- o .: "wordsPerMinute"
    b <- o .: "backspaces"
    s <- o .: "solution"
    pure RunRecord
      { puzzleIdentity = i, finishedAt = f, duration = d, wpm = w, backspaces = b, solution = s }

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
checkRequest p src = T.decodeUtf8 $ LBS.toStrict $ Aeson.encode $ object
  [ "code" .= src
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
