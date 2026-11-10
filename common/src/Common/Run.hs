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
  , keyChar
  , keyFromChar
  , Millis
  , KeyPress (..)
  , Press (..)
  , legacyLanguage
  , newRun
  , newRunIn
  , step
  , draftOf
  , scoringLanguage
  , scoredWords
  , scoredBackspaces
  , peekThreshold
  , isPeeked
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
import Data.Aeson (FromJSON (..), ToJSON (..), Value, object, withObject, (.:), (.:?), (.=))
import Data.Aeson qualified as Aeson
import Data.Aeson.Types (Parser, parseMaybe)
import Data.ByteString.Lazy qualified as LBS
import Data.List (group)
import Data.Map.Strict (Map)
import Data.Map.Strict qualified as Map
import Data.Text (Text)
import Data.Text qualified as T
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
  | TimedOut Text
    -- ^ The Language's own message: how long it waited, and why that is
    -- probably a loop.
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
  , shown :: Text
    -- ^ The Language the editor shows now (the shim's registry name). A
    -- Run can switch Language and never resets (Design Contract L3).
  , awaiting :: Map Text Int
    -- ^ Per Language, the check whose outcome counts; any other is stale.
    -- A Language left behind keeps its check: whichever Solution passes
    -- first ends the Run.
  , code :: Text
    -- ^ The Solution as last edited, in 'language'; once passed, the
    -- passing one (see 'draftOf').
  , leftDrafts :: Map Text Text
    -- ^ The last text of every other Language that was shown, so a check
    -- of a Language left behind can still end the Run with its Solution.
  , passedBy :: Maybe Text
    -- ^ The Language whose Solution passed: the Run belongs to it.
  , presses :: [Press]
    -- ^ Every key press the Run kept, newest first, with its time and the
    -- Language it was typed in.
  , hasPeeked :: Bool
    -- ^ The hint was open for 'peekThreshold' or more at some point (Peek).
  , hintOpenSince :: Maybe UTCTime
    -- ^ When the hint tooltip opened, while it is open.
  , pausedSince :: Maybe UTCTime
    -- ^ When the Pause under way began.
  , pausedFor :: NominalDiffTime
    -- ^ The time spent in Pauses that have ended.
  , resumeTo :: Phase
    -- ^ While Paused: the phase Esc carries on in.
  }
  deriving stock (Eq, Show)

-- | The key presses a Run counts; the editor reports no others. A
-- character is what the browser typed, not which key made it (the player's
-- layout is unknown), so @A@ and @a@ differ, and Option/AltGr characters
-- count. Shortcuts (Cmd or Ctrl) and dead keys aren't reported.
data Key = Character Char | Space | Enter | Tab | Backspace
  deriving stock (Eq, Show)

-- | The key as one character, as the editor reports it and the record
-- stores it: itself, or a space, newline, tab or backspace (@\b@).
keyChar :: Key -> Char
keyChar = \case
  Character c -> c
  Space -> ' '
  Enter -> '\n'
  Tab -> '\t'
  Backspace -> '\b'

-- | The inverse of 'keyChar'.
keyFromChar :: Char -> Key
keyFromChar = \case
  ' ' -> Space
  '\n' -> Enter
  '\t' -> Tab
  '\b' -> Backspace
  c -> Character c

-- | One key press a Run kept: when, which key, and the Language it was
-- typed in (key presses count toward the Language they were typed in).
data Press = Press
  { time :: Millis
  , key :: Key
  , typedIn :: Text
  }
  deriving stock (Eq, Show)

-- | The Language every record written before records had a @language@ field
-- was typed in. Old records read as this one and are never rewritten. This
-- is a fact about old data, not a choice: nothing else in the Run or the
-- history names a Language.
legacyLanguage :: Text
legacyLanguage = "javascript"

-- | A key press's time in milliseconds on the browser's monotonic clock (the
-- keydown event's @timeStamp@). Only differences between two presses mean
-- anything; it's a different clock from the 'UTCTime's other events carry.
type Millis = Double

data Event
  = Edited UTCTime Text
  | CodeSwapped Text Text
    -- ^ The player picked another Language (its name) and the editor now
    -- shows that Language's draft. Not an edit and not typing, so it never
    -- starts the clock, and it does not reset it either (Design Contract
    -- L3). The last outcome was of another Language's code, so it goes. A
    -- check in flight for the Language left stays: if it passes, it ends
    -- the Run.
  | Pressed Millis Key
  | CheckStarted Int Text
    -- ^ A check began, of the draft of this Language (not necessarily the
    -- one shown: a check begins 400 ms after the last edit, switch or not).
  | HintOpened UTCTime
    -- ^ The mouse is over the hint (the @?@ that shows the Reference
    -- Solution).
  | HintClosed UTCTime
  | CheckFinished UTCTime Int Outcome
  | Escaped UTCTime
    -- ^ Esc: skips a Run not started, pauses one under way, or carries on
    -- from a Pause.
  | NewRunStarted
    -- ^ A menu button: a fresh Run, on the same Puzzle or another. A Run
    -- dropped this way never passed, so it leaves no record.
  deriving stock (Eq, Show)

-- | A fresh Run, in 'legacyLanguage' (for tests; the page uses 'newRunIn').
newRun :: Run
newRun = newRunIn legacyLanguage

-- | A fresh Run with this Language shown.
newRunIn :: Text -> Run
newRunIn l = Run
  { phase = NotStarted
  , outcome = Nothing
  , startedAt = Nothing
  , finishedAt = Nothing
  , shown = l
  , awaiting = Map.empty
  , code = ""
  , leftDrafts = Map.empty
  , passedBy = Nothing
  , presses = []
  , hasPeeked = False
  , hintOpenSince = Nothing
  , pausedSince = Nothing
  , pausedFor = 0
  , resumeTo = Typing
  }

step :: Event -> Run -> Run
step e r = case (e, r.phase) of
  -- A new Run keeps the Language shown.
  (NewRunStarted, _) -> newRunIn r.shown
  (_, Passed) -> r
  (_, Skipped) -> r
  (Escaped _, NotStarted) -> r { phase = Skipped }
  (Escaped t, Paused) -> r
    { phase = r.resumeTo
    , pausedSince = Nothing
    , pausedFor = r.pausedFor + maybe 0 (diffUTCTime t) r.pausedSince
    }
  (Escaped t, ph) -> r { phase = Paused, resumeTo = ph, pausedSince = Just t }
  -- The editor is read-only while Paused; nothing typed counts, and the
  -- Language can't be switched.
  (Edited _ _, Paused) -> r
  (Pressed _ _, Paused) -> r
  (CodeSwapped _ _, Paused) -> r
  -- The hint can be looked at at any time before the Run ends, before the
  -- first keystroke and during a Pause included.
  (HintOpened t, _) -> r { hintOpenSince = r.hintOpenSince <|> Just t }
  (HintClosed t, _) -> r { hasPeeked = isPeeked t r, hintOpenSince = Nothing }
  (CodeSwapped l c, NotStarted) -> swapTo l c r
  (CodeSwapped l c, _) -> (swapTo l c r) { phase = Typing, outcome = Nothing }
  (Edited t c, _) -> r
    { phase = Typing
    , startedAt = r.startedAt <|> Just t
    , awaiting = Map.delete r.shown r.awaiting
    , code = c
    }
  (Pressed t k, _) -> r { presses = Press { time = t, key = k, typedIn = r.shown } : r.presses }
  -- Nothing typed yet, nothing to check: a check left over from a dropped
  -- Run.
  (CheckStarted _ _, NotStarted) -> r
  -- A check that started before or during a Pause still counts. Only a
  -- check of the Language shown makes the phase "checking".
  (CheckStarted n l, Paused) -> (note n l r) { resumeTo = if l == r.shown then Checking else r.resumeTo }
  (CheckStarted n l, _) -> (note n l r) { phase = if l == r.shown then Checking else r.phase }
  (CheckFinished t n o, ph) -> case [l | (l, m) <- Map.toList r.awaiting, m == n] of
    [] -> r
    l : _ ->
      let r' = r { awaiting = Map.delete l r.awaiting }
          end = fromMaybe t r.pausedSince
      in if
        -- Whichever Solution passes first ends the Run, in whatever
        -- Language it was typed. A pass during a Pause ends the Run when
        -- the Pause began.
        | allPassed o -> r'
            { phase = Passed
            , outcome = Just o
            , finishedAt = Just end
            , pausedSince = Nothing
            , awaiting = Map.empty
            , passedBy = Just l
            , code = draftOf l r
            , hasPeeked = isPeeked end r
            , hintOpenSince = Nothing
            }
        -- A failure of a Language that is no longer shown tells the player
        -- nothing about the draft in front of them.
        | l /= r.shown -> r'
        | ph == Paused -> r' { resumeTo = Checked, outcome = Just o }
        | otherwise -> r' { phase = Checked, outcome = Just o }
  where
    allPassed = \case
      Results rs@(_ : _) -> all (.passed) rs
      _ -> False
    note n l run' = run' { awaiting = Map.insert l n run'.awaiting }
    -- Shows Language l with its draft c; the one left keeps its text.
    swapTo l c run' = run'
      { shown = l
      , code = c
      , leftDrafts = Map.delete l (Map.insert run'.shown run'.code run'.leftDrafts)
      }

-- | The Solution as last typed in this Language during the Run (empty if
-- never shown).
draftOf :: Text -> Run -> Text
draftOf l r
  | l == r.shown = r.code
  | otherwise = Map.findWithDefault "" l r.leftDrafts

-- | The Language the Run's scores are of: the one whose Solution passed,
-- or the one shown while the Run is still under way. Words per minute and
-- Backspaces are that Solution's; the time is the whole Run's.
scoringLanguage :: Run -> Text
scoringLanguage r = fromMaybe r.shown r.passedBy

-- | Spaces and Enters pressed straight after a character, in the scoring
-- Language ('scoringLanguage'). A key pressed after a switch does not
-- follow a character typed in the other Language.
scoredWords :: Run -> Int
scoredWords r = length
  [ ()
  | (p, before) <- zip r.presses (drop 1 r.presses)
  , p.typedIn == l, p.key == Space || p.key == Enter
  , before.typedIn == l, isCharacter before.key
  ]
  where
    l = scoringLanguage r
    isCharacter = \case
      Character _ -> True
      _ -> False

-- | Backspaces pressed in the scoring Language.
scoredBackspaces :: Run -> Int
scoredBackspaces r = length [() | p <- r.presses, p.typedIn == scoringLanguage r, p.key == Backspace]

-- | How long the hint must be open to count as a Peek: about a second, so a
-- brief accidental mouse-over doesn't.
peekThreshold :: NominalDiffTime
peekThreshold = 1

-- | Whether the Run is peeked as of this time: the hint was open for
-- 'peekThreshold' or more once, or is open that long now.
isPeeked :: UTCTime -> Run -> Bool
isPeeked now r = r.hasPeeked || maybe False (\since -> diffUTCTime now since >= peekThreshold) r.hintOpenSince

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
  Just f | d > 0 -> Just (fromIntegral (scoredWords r) * 60 / realToFrac d)
    where d = elapsed f r
  _ -> Nothing

-- | What a passed Run leaves behind.
data RunRecord = RunRecord
  { puzzleIdentity :: Text
    -- ^ Which Puzzle: its identity (file name). Records stored before
    -- Puzzles had one hold the function name here; for fizzBuzz they're
    -- the same.
  , language :: Text
    -- ^ The Language whose Solution passed (a registry name). A record
    -- stored before records had one reads as 'legacyLanguage'.
  , finishedAt :: UTCTime
  , duration :: Double
    -- ^ In seconds: the whole Run's, switches included.
  , wpm :: Double
    -- ^ The passing Solution's.
  , backspaces :: Int
    -- ^ The passing Solution's.
  , peeked :: Bool
    -- ^ The hint was open for about a second or more during the Run, in
    -- any Language. The Run still counts for the Personal best.
  , solution :: Text
  , keyPresses :: [KeyPress]
    -- ^ In the order pressed, whatever Language each was typed in. Empty in
    -- records stored before Runs kept them, and in old records stripped to
    -- make room in a full storage.
  , keyLanguages :: [(Text, Int)]
    -- ^ Which Language each key press was typed in, as consecutive stretches
    -- (Language, number of presses), in order. Empty when every press was
    -- typed in 'language' (the usual case, and every old record).
  }
  deriving stock (Eq, Show)

-- | One kept key press, as a record stores it.
data KeyPress = KeyPress
  { key :: Key
  , sincePrevious :: Int
    -- ^ Milliseconds since the previous press, rounded; 0 for the Run's
    -- first. A Pause between two presses is included (Hesitation, in
    -- 'Common.History.slowest', ignores gaps that long).
  }
  deriving stock (Eq, Show)

-- | The Run's presses, oldest first, each with the time since the one before.
keyPressesOf :: Run -> [KeyPress]
keyPressesOf r = zipWith gap (Nothing : map (Just . (.time)) ps) ps
  where
    ps = reverse r.presses
    gap prev p = KeyPress
      { key = p.key, sincePrevious = maybe 0 (\t -> max 0 (round (p.time - t))) prev }

-- | The Language of each press as stretches, or none when they were all in
-- the Run's own Language.
keyLanguagesOf :: Run -> [(Text, Int)]
keyLanguagesOf r
  | all (== scoringLanguage r) ls = []
  | otherwise = [(g, length gs) | gs@(g : _) <- group ls]
  where ls = map (.typedIn) (reverse r.presses)

runRecord :: Puzzle -> Run -> Maybe RunRecord
runRecord p r = case (r.phase, r.finishedAt, wordsPerMinute r) of
  (Passed, Just f, Just perMinute) -> Just RunRecord
    { puzzleIdentity = p.identity
    , language = scoringLanguage r
    , finishedAt = f
    , duration = realToFrac (elapsed f r)
    , wpm = perMinute
    , backspaces = scoredBackspaces r
    , peeked = r.hasPeeked
    , solution = r.code
    , keyPresses = keyPressesOf r
    , keyLanguages = keyLanguagesOf r
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

-- | The key presses are two fields, kept compact as storage is small (about
-- 5 MB for every Run): @keys@, a string with one character per press (see
-- 'keyChar'), and @gaps@, the milliseconds since the previous press, one
-- number per press. For example @"keys": "ab\\bc\\n", "gaps": [0, 120, 80, 95, 210]@.
-- When storage is full the shim deletes both from the oldest records; the
-- rest of a record is never dropped.
instance ToJSON RunRecord where
  toJSON rr = object
    ([ "puzzle" .= rr.puzzleIdentity
    , "language" .= rr.language
    , "finishedAt" .= rr.finishedAt
    , "seconds" .= rr.duration
    , "wordsPerMinute" .= rr.wpm
    , "backspaces" .= rr.backspaces
    , "peeked" .= rr.peeked
    , "solution" .= rr.solution
    , "keys" .= T.pack (map (keyChar . (.key)) rr.keyPresses)
    , "gaps" .= map (.sincePrevious) rr.keyPresses
    ] <> [ "keyLanguages" .= rr.keyLanguages | not (null rr.keyLanguages) ])

-- | Reads what 'toJSON' writes, records stored by earlier versions included.
instance FromJSON RunRecord where
  parseJSON = withObject "RunRecord" \o -> do
    i <- o .: "puzzle"
    l <- fromMaybe legacyLanguage <$> o .:? "language"
    f <- o .: "finishedAt"
    d <- o .: "seconds"
    w <- o .: "wordsPerMinute"
    b <- o .: "backspaces"
    pk <- fromMaybe False <$> o .:? "peeked"
    s <- o .: "solution"
    ks <- o .:? "keys"
    gs <- o .:? "gaps"
    kl <- o .:? "keyLanguages" :: Parser (Maybe Value)
    ps <- case (ks, gs) of
      (Nothing, Nothing) -> pure []
      (Just k, Just g)
        | T.length k == length g -> pure (zipWith KeyPress (map keyFromChar (T.unpack k)) g)
      _ -> fail "keys and gaps must both be there, one gap per key"
    -- Stretches that don't add up to the presses are ignored: every press
    -- then counts toward the record's own Language.
    let stretches = case kl >>= parseMaybe parseJSON of
          Just segs | sum (map snd segs) == length ps -> segs
          _ -> []
    pure RunRecord
      { puzzleIdentity = i, language = l, finishedAt = f, duration = d, wpm = w, backspaces = b
      , peeked = pk, solution = s, keyPresses = ps, keyLanguages = stretches }

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

-- | The Language Checker's result (static/editor/src/languages.mjs):
-- @{status: "pass" | "fail", results: [{pass, got}]}@, or
-- @{status: "error", kind: "syntax" | "timeout" | other, message}@, with
-- line, column and range the status line will use later. Anything else
-- counts as a crash.
parseReply :: Text -> Outcome
parseReply txt =
  case Aeson.decodeStrict (T.encodeUtf8 txt) >>= parseMaybe reply of
    Just o -> o
    Nothing -> Crashed "The test runner sent an unreadable reply."
  where
    reply :: Value -> Parser Outcome
    reply = withObject "reply" \o -> o .: "status" >>= \case
      ("pass" :: Text) -> Results <$> o .: "results"
      "fail" -> Results <$> o .: "results"
      "error" -> o .: "kind" >>= \case
        ("syntax" :: Text) -> SyntaxError <$> o .: "message"
        "timeout" -> TimedOut <$> o .: "message"
        _ -> Crashed <$> o .: "message"
      _ -> fail "unknown status"

instance FromJSON TestResult where
  parseJSON = withObject "TestResult" \o ->
    TestResult <$> o .: "pass" <*> o .: "got"
