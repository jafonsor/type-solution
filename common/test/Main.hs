module Main (main) where

import Control.Monad (unless)
import Data.Aeson (Value (..), decode, eitherDecode, encode)
import Data.Aeson.Key qualified as Key
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as LBS
import Data.Either (isLeft)
import Data.List (isInfixOf, sort)
import Data.Maybe (mapMaybe)
import Data.List.NonEmpty qualified as NonEmpty
import Data.Text (Text)
import Data.Text qualified as T
import Data.Text.Encoding qualified as T
import Data.Time (UTCTime (..), addUTCTime, fromGregorian)
import System.Directory (listDirectory)
import System.Exit (exitFailure)
import System.FilePath (dropExtension, takeExtension)
import Test.HUnit

import Common.Bank
import Common.Puzzle
import Common.Run
import Common.Status

main :: IO ()
main = do
  result <- runTestTT suite
  unless (errors result == 0 && failures result == 0) exitFailure

t0 :: UTCTime
t0 = UTCTime (fromGregorian 2026 1 1) 0

at :: Double -> UTCTime
at s = addUTCTime (realToFrac s) t0

run :: [Event] -> Run
run = foldl (flip step) newRun

-- | Every record the Runs leave behind, as the page keeps them: one for each
-- step that passed a Run.
records :: [Event] -> [RunRecord]
records es = mapMaybe (uncurry (recordOnStep fizzBuzz)) (zip runs (drop 1 runs))
  where runs = scanl (flip step) newRun es

-- | A character whose time doesn't matter to the test.
letter :: Key
letter = Character 'x'

-- | A key press at a time in milliseconds.
press :: Double -> Key -> Event
press = Pressed

-- | A Run under way: started at 1 s, with "x" typed.
typing :: [Event]
typing = [Pressed 0 letter, Edited (at 1) "x"]

pass, failWith :: TestResult
pass = TestResult { passed = True, got = "\"x\"" }
failWith = TestResult { passed = False, got = "\"3\"" }

-- | fizzBuzz as it was written in Haskell before Puzzles became files.
fizzBuzz :: Puzzle
fizzBuzz = Puzzle
  { identity = "fizzBuzz"
  , function = "fizzBuzz"
  , signature = "fizzBuzz(n)"
  , prompt = "Return \"Fizz\" for multiples of 3, \"Buzz\" for multiples of 5, \"FizzBuzz\" for both, otherwise the number as a string."
  , reference = "function fizzBuzz(n) {\n  if (n % 15 === 0) return \"FizzBuzz\";\n  if (n % 3 === 0) return \"Fizz\";\n  if (n % 5 === 0) return \"Buzz\";\n  return String(n);\n}\n"
  , tests =
      [ PuzzleTest { args = [Number 3], expected = String "Fizz" }
      , PuzzleTest { args = [Number 10], expected = String "Buzz" }
      , PuzzleTest { args = [Number 30], expected = String "FizzBuzz" }
      , PuzzleTest { args = [Number 7], expected = String "7" }
      ]
  }

-- | A small Puzzle file, and its lines.
sampleFile :: [Text]
sampleFile =
  [ "function = \"double\""
  , "signature = \"double(x)\""
  , "prompt = \"Return x times two.\""
  , "reference = \"function double(x) { return x * 2; }\""
  , "[[tests]]"
  , "args = [2]"
  , "expected = 4"
  , "[[tests]]"
  , "args = [[1, 2.5], {a = \"b\"}, true]"
  , "expected = \"x\""
  ]

parsesTo :: [Text] -> Either String Puzzle
parsesTo = parsePuzzle "double" . T.unlines

failsMentioning :: String -> Either String Puzzle -> Assertion
failsMentioning want = \case
  Left e -> assertBool ("error should mention " <> show want <> ": " <> e) (want `isInfixOf` e)
  Right p -> assertFailure ("expected an error, got " <> show p)

allPass :: Outcome
allPass = Results (map (const pass) fizzBuzz.tests)

suite :: Test
suite = TestList
  [ "a new Run has not started and shows no time" ~: do
      newRun.phase @?= NotStarted
      elapsed (at 5) newRun @?= 0

  , "the first edit starts the clock; later edits don't move it" ~: do
      let r = run [Edited (at 1) "", Edited (at 3) ""]
      r.phase @?= Typing
      elapsed (at 4) r @?= 3

  , "an outcome where every test passes ends the Run and stops the clock" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2.5) 1 allPass]
      r.phase @?= Passed
      elapsed (at 10) r @?= 1.5

  , "a failing outcome is kept to show why" ~: do
      let o = Results [failWith]
          r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 o]
      r.phase @?= Checked
      r.outcome @?= Just o

  , "an outcome for a check that was superseded is ignored" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, CheckStarted 2, CheckFinished (at 2) 1 allPass]
      r.phase @?= Checking
      r.outcome @?= Nothing

  , "editing drops the pending check" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, Edited (at 2) "", CheckFinished (at 3) 1 allPass]
      r.phase @?= Typing
      r.outcome @?= Nothing

  , "the last outcome stays visible while typing again" ~: do
      let o = SyntaxError "Unexpected token"
          r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 o, Edited (at 3) ""]
      r.phase @?= Typing
      r.outcome @?= Just o

  , "a timeout is a failed check" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 TimedOut]
      r.phase @?= Checked
      r.outcome @?= Just TimedOut

  , "no results is not a pass" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 (Results [])]
      r.phase @?= Checked

  , "a passed Run ignores further edits and checks" ~: do
      let r = run [ Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 allPass
                  , Edited (at 3) "", CheckStarted 2, CheckFinished (at 4) 2 (Results [failWith]) ]
      r.phase @?= Passed
      elapsed (at 9) r @?= 1

  , "a new Run after a pass starts from scratch" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 allPass, NewRunStarted]
      r @?= newRun

  , "an outcome arriving after a new Run started is ignored" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, Escaped (at 1.5), NewRunStarted, CheckFinished (at 2) 1 allPass]
      r @?= newRun

  , "a check left over from a dropped Run doesn't start the new one" ~: do
      let r = run [Edited (at 1) "", Escaped (at 1.2), NewRunStarted, CheckStarted 1]
      r @?= newRun

  -- Esc

  , "Esc before the first keystroke skips the Puzzle" ~: do
      let r = run [Escaped (at 1)]
      r.phase @?= Skipped
      statusText r @?= "Skipped."
      elapsed (at 5) r @?= 0

  , "after a skip, Esc and typing do nothing" ~: do
      let r = run [Escaped (at 1), Escaped (at 2), Pressed 0 letter, Edited (at 3) "x", CheckStarted 1]
      r @?= run [Escaped (at 1)]

  , "Esc while typing pauses the Run and stops the clock" ~: do
      let r = run (typing <> [Escaped (at 4)])
      r.phase @?= Paused
      statusText r @?= "Paused. Esc to carry on."
      elapsed (at 4) r @?= 3
      elapsed (at 60) r @?= 3

  , "Esc while a check runs pauses the Run" ~: do
      let r = run (typing <> [CheckStarted 1, Escaped (at 2)])
      r.phase @?= Paused

  , "Esc after a failed check pauses the Run and keeps the feedback" ~: do
      let o = Results [failWith]
          r = run (typing <> [CheckStarted 1, CheckFinished (at 2) 1 o, Escaped (at 3)])
      r.phase @?= Paused
      r.outcome @?= Just o

  , "Esc while paused carries on where the Run was, the clock going on from the same time" ~: do
      let r = run (typing <> [Escaped (at 4), Escaped (at 10)])
      r.phase @?= Typing
      elapsed (at 10) r @?= 3
      elapsed (at 12) r @?= 5
      let c = run (typing <> [CheckStarted 1, Escaped (at 2), Escaped (at 3)])
      c.phase @?= Checking
      let o = SyntaxError "Unexpected token"
          f = run (typing <> [CheckStarted 1, CheckFinished (at 2) 1 o, Escaped (at 3), Escaped (at 4)])
      (f.phase, statusText f) @?= (Checked, "doesn't parse yet")

  , "edits and key presses are ignored while paused" ~: do
      let paused = run (typing <> [Escaped (at 4)])
          r = run (typing <> [Escaped (at 4), Pressed 0 letter, Pressed 0 Space, Edited (at 5) "xy"])
      r @?= paused
      r.code @?= "x"

  , "Esc after a pass does nothing" ~: do
      let done = run (typing <> [CheckStarted 1, CheckFinished (at 3) 1 allPass])
          r = run (typing <> [CheckStarted 1, CheckFinished (at 3) 1 allPass, Escaped (at 4)])
      r @?= done

  , "paused time is left out of the Run's time and words per minute" ~: do
      let keys5 = concat (replicate 5 [Pressed 0 letter, Pressed 0 Space])
          r = run ( [Edited (at 0) "f"] <> keys5
                  <> [Escaped (at 10), Escaped (at 25), Escaped (at 30), Escaped (at 40)]
                  <> [CheckStarted 1, CheckFinished (at 45) 1 allPass] )
      -- 45 s on the clock, 15 + 10 of them paused.
      elapsed (at 99) r @?= 20
      wordsPerMinute r @?= Just 15
      fmap (\rr -> (rr.duration, rr.wpm)) (runRecord fizzBuzz r) @?= Just (20, 15)
      statusText r @?= "Passed in 20.0 s, 15 wpm, 0 backspaces."

  , "a check passing during a Pause ends the Run when the Pause began" ~: do
      let r = run (typing <> [CheckStarted 1, Escaped (at 3), CheckFinished (at 3.5) 1 allPass])
      r.phase @?= Passed
      r.finishedAt @?= Just (at 3)
      elapsed (at 99) r @?= 2
      map (.duration) (records (typing <> [CheckStarted 1, Escaped (at 3), CheckFinished (at 3.5) 1 allPass])) @?= [2]

  , "after an earlier Pause, a pass during a Pause still leaves out all paused time" ~: do
      let r = run (typing <> [Escaped (at 2), Escaped (at 7), CheckStarted 1, Escaped (at 8), CheckFinished (at 9) 1 allPass])
      elapsed (at 99) r @?= 2

  , "a check failing during a Pause shows its feedback and stays paused" ~: do
      let o = Results [pass, failWith]
          r = run (typing <> [CheckStarted 1, Escaped (at 3), CheckFinished (at 3.5) 1 o])
      r.phase @?= Paused
      r.outcome @?= Just o
      statusText r @?= "Paused. Esc to carry on."
      let resumed = step (Escaped (at 4)) r
      (resumed.phase, statusText resumed) @?= (Checked, "1/2 tests pass")

  , "a check that starts during a Pause counts too" ~: do
      let r = run (typing <> [Escaped (at 2), CheckStarted 1, CheckFinished (at 2.5) 1 allPass])
      (r.phase, r.finishedAt) @?= (Passed, Just (at 2))

  , "the menu is open exactly after a pass, during a Pause and after a skip" ~: do
      let toPass = typing <> [CheckStarted 1, CheckFinished (at 2) 1 allPass]
          phases :: [(Phase, Bool)]
          phases =
            [ (newRun.phase, menuOpen newRun)
            , let r = run typing in (r.phase, menuOpen r)
            , let r = run (typing <> [CheckStarted 1]) in (r.phase, menuOpen r)
            , let r = run (typing <> [CheckStarted 1, CheckFinished (at 2) 1 TimedOut]) in (r.phase, menuOpen r)
            , let r = run (typing <> [Escaped (at 2)]) in (r.phase, menuOpen r)
            , let r = run [Escaped (at 1)] in (r.phase, menuOpen r)
            , let r = run toPass in (r.phase, menuOpen r)
            , let r = run (toPass <> [NewRunStarted]) in (r.phase, menuOpen r)
            ]
      phases @?=
        [ (NotStarted, False), (Typing, False), (Checking, False), (Checked, False)
        , (Paused, True), (Skipped, True), (Passed, True), (NotStarted, False) ]

  , "a Run given up from a Pause leaves no record" ~: do
      let es = typing <> [Pressed 0 Space, CheckStarted 1, Escaped (at 3), NewRunStarted, CheckFinished (at 3.5) 1 allPass]
      records es @?= []
      run es @?= newRun

  , "a passed Run leaves exactly one record, and a new Run after it none" ~: do
      let es = typing <> [CheckStarted 1, CheckFinished (at 3) 1 allPass, Escaped (at 4), NewRunStarted]
      map (.duration) (records es) @?= [2]

  -- The status line

  , "the status line says what the Run is doing" ~: do
      statusText newRun @?= "Start typing: the clock starts on your first keystroke."
      statusText (run typing) @?= ""
      statusText (run (typing <> [CheckStarted 1])) @?= "checking…"
      let after o = statusText (run (typing <> [CheckStarted 1, CheckFinished (at 2) 1 o]))
      after (Results [pass, failWith, failWith]) @?= "1/3 tests pass"
      after (SyntaxError "x") @?= "doesn't parse yet"
      after (Crashed "x") @?= "crashed"
      after TimedOut @?= "timed out"

  , "the pass line gives the time, words per minute and backspaces, and no Esc hint" ~: do
      let r = run [ Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space, Pressed 0 Backspace
                  , CheckStarted 1, CheckFinished (at 12.34) 1 allPass ]
      statusText r @?= "Passed in 12.3 s, 5 wpm, 1 backspace."
      let r2 = run [ Edited (at 0) "f", Pressed 0 Backspace, Pressed 0 Backspace, CheckStarted 1, CheckFinished (at 6) 1 allPass ]
      statusText r2 @?= "Passed in 6.0 s, 0 wpm, 2 backspaces."

  , "times read in seconds to a tenth" ~: do
      secondsText 0 @?= "0.0 s"
      secondsText 1 @?= "1.0 s"
      secondsText 75.25 @?= "75.2 s"

  , "a space or Enter straight after a character ends a word" ~: do
      let r = run (map (Pressed 0) [letter, Space, Space, letter, letter, Enter, Enter, letter])
      r.wordsTyped @?= 2

  , "a space after a backspace doesn't end a word" ~: do
      let r = run (map (Pressed 0) [letter, Backspace, Space])
      r.wordsTyped @?= 0

  , "backspaces are counted" ~: do
      let r = run (map (Pressed 0) [letter, Backspace, Backspace, letter])
      r.backspaces @?= 2

  , "key presses after passing don't count" ~: do
      let r = run [ Pressed 0 letter, Edited (at 1) "x", CheckStarted 1, CheckFinished (at 2) 1 allPass
                  , Pressed 0 Space, Pressed 0 Backspace ]
      (r.wordsTyped, r.backspaces) @?= (0, 0)

  , "the Run keeps every key press, in order, with the milliseconds since the one before" ~: do
      let es = [ press 1000.4 (Character 'f'), Edited (at 1) "f", press 1120.4 (Character 'n')
               , press 1200 Backspace, press 1295.6 (Character 'u'), press 1400 Space
               , press 1450 Enter, press 1500 Tab
               , CheckStarted 1, CheckFinished (at 3) 1 allPass ]
      map (\kp -> (kp.key, kp.sincePrevious)) (concatMap (.keyPresses) (records es)) @?=
        [ (Character 'f', 0), (Character 'n', 120), (Backspace, 80), (Character 'u', 96)
        , (Space, 104), (Enter, 50), (Tab, 50) ]
      -- Counting is as before.
      let r = run es
      (r.wordsTyped, r.backspaces) @?= (1, 1)

  , "A and a are kept as different characters" ~: do
      let es = [press 0 (Character 'A'), Edited (at 1) "A", press 90 (Character 'a'), CheckStarted 1, CheckFinished (at 2) 1 allPass]
      map (.key) (concatMap (.keyPresses) (records es)) @?= [Character 'A', Character 'a']

  , "only a Space or Enter straight after a character ends a word; Tab never does" ~: do
      let r = run (map (Pressed 0) [Character 'a', Tab, Space, Character '{', Enter, Character '1', Tab])
      r.wordsTyped @?= 1

  , "key presses while paused, after a skip or after a pass aren't kept" ~: do
      let toPause = [press 0 (Character 'a'), Edited (at 1) "a", Escaped (at 2)]
          es = toPause <> [press 50 (Character 'b'), Escaped (at 3), press 1000 (Character 'c')
                          , CheckStarted 1, CheckFinished (at 4) 1 allPass, press 2000 (Character 'd'), press 2100 Space]
      -- The gap after a Pause includes the paused time.
      map (\kp -> (kp.key, kp.sincePrevious)) (concatMap (.keyPresses) (records es))
        @?= [(Character 'a', 0), (Character 'c', 1000)]
      (run (es <> [press 3000 (Character 'e')])).presses @?= [(1000, Character 'c'), (0, Character 'a')]
      (run [Escaped (at 1), press 10 (Character 'z')]).presses @?= []

  , "a new Run clears the counts" ~: do
      let r = run [Pressed 0 letter, Edited (at 1) "x", Pressed 0 Space, Pressed 0 Backspace, Escaped (at 2), NewRunStarted]
      r @?= newRun

  , "a passed Run's record has its time, words per minute, backspaces and Solution" ~: do
      let keys5 = concat (replicate 5 [Pressed 0 letter, Pressed 0 Space])
          r = run ( [Edited (at 0) "f"] <> keys5 <> [Pressed 0 Backspace, Edited (at 1) "function fizzBuzz"]
                  <> [CheckStarted 1, CheckFinished (at 30) 1 allPass] )
      runRecord fizzBuzz r @?= Just RunRecord
        { puzzleIdentity = "fizzBuzz"
        , finishedAt = at 30
        , duration = 30
        , wpm = 10
        , backspaces = 1
        , solution = "function fizzBuzz"
        , keyPresses = map (\k -> KeyPress { key = k, sincePrevious = 0 })
            (concat (replicate 5 [letter, Space]) <> [Backspace])
        }

  , "a passed Run's record names the Puzzle by its identity, not its function" ~: do
      let p = fizzBuzz { identity = "fizzBuzzAgain" }
          r = run [Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space, CheckStarted 1, CheckFinished (at 6) 1 allPass]
          rr = runRecord p r
      fmap (.puzzleIdentity) rr @?= Just "fizzBuzzAgain"
      case fmap (decode . encode) rr :: Maybe (Maybe Value) of
        Just (Just (Object o)) -> KeyMap.lookup "puzzle" o @?= Just (String "fizzBuzzAgain")
        other -> assertFailure ("expected a JSON object, got " <> show other)

  , "a record reads back what it writes" ~: do
      let rr = RunRecord
            { puzzleIdentity = "fizzBuzz", finishedAt = at 30, duration = 29.5
            , wpm = 41.25, backspaces = 3, solution = "function fizzBuzz(n) {}"
            , keyPresses =
                [ KeyPress (Character 'f') 0, KeyPress Space 120, KeyPress Enter 80, KeyPress Tab 95
                , KeyPress Backspace 3000, KeyPress (Character 'A') 7, KeyPress (Character '€') 1
                , KeyPress (Character '\128512') 2, KeyPress (Character '"') 3, KeyPress (Character '\\') 4 ] }
      eitherDecode (encode rr) @?= Right rr
      eitherDecode (encode rr { keyPresses = [] }) @?= Right rr { keyPresses = [] }

  , "a record stored before Puzzles had an identity still reads" ~: do
      let old = "{\"backspaces\":2,\"finishedAt\":\"2026-10-17T21:14:03.512Z\",\"puzzle\":\"fizzBuzz\",\"seconds\":24.731,\"solution\":\"function fizzBuzz(n) {\\n  return n;\\n}\",\"wordsPerMinute\":38.81}"
      eitherDecode old @?= Right RunRecord
        { puzzleIdentity = "fizzBuzz"
        , finishedAt = UTCTime (fromGregorian 2026 10 17) (21 * 3600 + 14 * 60 + 3.512)
        , duration = 24.731
        , wpm = 38.81
        , backspaces = 2
        , solution = "function fizzBuzz(n) {\n  return n;\n}"
        , keyPresses = []
        }

  , "a record stores its key presses as a string of keys and a list of gaps" ~: do
      let rr = RunRecord
            { puzzleIdentity = "fizzBuzz", finishedAt = at 30, duration = 29.5
            , wpm = 41.25, backspaces = 1, solution = "aB"
            , keyPresses = [KeyPress (Character 'a') 0, KeyPress Backspace 80, KeyPress (Character 'B') 95, KeyPress Space 10, KeyPress Enter 20, KeyPress Tab 30] }
      case decode (encode rr) :: Maybe Value of
        Just (Object o) -> do
          KeyMap.lookup "keys" o @?= Just (String "a\bB \n\t")
          KeyMap.lookup "gaps" o @?= Just (Array [Number 0, Number 80, Number 95, Number 10, Number 20, Number 30])
        other -> assertFailure ("expected a JSON object, got " <> show other)

  , "a record with key presses, written by hand, reads" ~: do
      let stored = "{\"backspaces\":1,\"finishedAt\":\"2026-10-19T10:00:00Z\",\"gaps\":[0,120,80,95],\"keys\":\"Ab\\b \",\"puzzle\":\"fizzBuzz\",\"seconds\":4,\"solution\":\"A \",\"wordsPerMinute\":15}"
      fmap (.keyPresses) (eitherDecode stored :: Either String RunRecord)
        @?= Right [KeyPress (Character 'A') 0, KeyPress (Character 'b') 120, KeyPress Backspace 80, KeyPress Space 95]

  , "a record whose key presses were stripped to make room still reads, with its summary" ~: do
      let stripped = "{\"backspaces\":1,\"finishedAt\":\"2026-10-19T10:00:00Z\",\"puzzle\":\"fizzBuzz\",\"seconds\":4,\"solution\":\"A \",\"wordsPerMinute\":15}"
      fmap (\rr -> (rr.puzzleIdentity, rr.duration, rr.wpm, rr.backspaces, rr.solution, rr.keyPresses)) (eitherDecode stripped :: Either String RunRecord)
        @?= Right ("fizzBuzz", 4, 15, 1, "A ", [])

  , "a record with keys but no gaps, or a gap too few, doesn't read" ~: do
      let base = "\"backspaces\":1,\"finishedAt\":\"2026-10-19T10:00:00Z\",\"puzzle\":\"fizzBuzz\",\"seconds\":4,\"solution\":\"A \",\"wordsPerMinute\":15"
          bad1 = "{" <> base <> ",\"keys\":\"ab\"}"
          bad2 = "{" <> base <> ",\"keys\":\"ab\",\"gaps\":[0]}"
      assertBool "keys without gaps" (isLeft (eitherDecode bad1 :: Either String RunRecord))
      assertBool "a gap too few" (isLeft (eitherDecode bad2 :: Either String RunRecord))

  , "the bank's fizzBuzz is the fizzBuzz Puzzle the game has always played" ~: do
      lookupPuzzle "fizzBuzz" @?= Just fizzBuzz

  , "a random number picks any Puzzle in the bank, each equally likely" ~: do
      let n = length bank
          picks = [randomPuzzle ((fromIntegral i + 0.5) / fromIntegral n) | i <- [0 .. n - 1]]
      map (.identity) picks @?= map (.identity) (NonEmpty.toList bank)
      (randomPuzzle 0).identity @?= (NonEmpty.head bank).identity
      (randomPuzzle 0.999999).identity @?= (NonEmpty.last bank).identity

  , "the bank is sorted by identity, with no identity twice" ~: do
      let ids = map (.identity) (NonEmpty.toList bank)
      ids @?= sort ids
      length ids @?= length (NonEmpty.nub (NonEmpty.fromList ids))

  , "the bank holds one Puzzle for every file in puzzles/" ~: do
      -- cabal runs the tests in common/. A dev build misses a newly added
      -- file until a common module is touched (see Common.Bank).
      files <- listDirectory "../puzzles"
      let fromFiles = sort [T.pack (dropExtension f) | f <- files, takeExtension f == ".toml"]
      map (.identity) (NonEmpty.toList bank) @?= fromFiles

  , "no Puzzle's prompt starts or ends with whitespace" ~: do
      let untrimmed = [p.identity | p <- NonEmpty.toList bank, T.strip p.prompt /= p.prompt]
      untrimmed @?= []

  , "a Puzzle file parses, its values as JSON" ~: do
      fmap (.tests) (parsesTo sampleFile) @?= Right
        [ PuzzleTest { args = [Number 2], expected = Number 4 }
        , PuzzleTest
            { args = [Array [Number 1, Number 2.5], Object (KeyMap.fromList [("a", String "b")]), Bool True]
            , expected = String "x" }
        ]
      fmap (\p -> (p.identity, p.function, p.signature, p.prompt, p.reference)) (parsesTo sampleFile)
        @?= Right ("double", "double", "double(x)", "Return x times two.", "function double(x) { return x * 2; }")

  , "a Puzzle file missing a key fails, naming it" ~: do
      failsMentioning "reference" (parsesTo (filter (not . T.isPrefixOf "reference") sampleFile))

  , "a Puzzle file with a key the format doesn't know fails, naming it" ~: do
      failsMentioning "difficulty" (parsesTo (sampleFile <> ["difficulty = 3"]))

  , "a test missing its expected value fails" ~: do
      failsMentioning "expected" (parsesTo (filter (/= "expected = 4") sampleFile))

  , "a Puzzle file that isn't TOML fails" ~: do
      assertBool "should fail" (isLeft (parsesTo (sampleFile <> ["prompt = \"unterminated"])))

  , "a date is not a JSON value" ~: do
      assertBool "should fail" (isLeft (parsesTo (map (\l -> if l == "expected = 4" then "expected = 2026-01-01" else l) sampleFile)))

  , "the bank takes each identity from its file name and names a broken file" ~: do
      fmap (fmap (.identity)) (parseBank [("b.toml", T.unlines sampleFile), ("a.toml", T.unlines sampleFile)])
        @?= Right ("a" NonEmpty.:| ["b"])
      case parseBank [("a.toml", T.unlines sampleFile), ("broken.toml", "function = ")] of
        Left e -> assertBool ("error should name the file: " <> e) ("broken.toml" `isInfixOf` e)
        Right _ -> assertFailure "expected an error"
      assertBool "an empty bank should fail" (isLeft (parseBank []))

  , "a Run that hasn't passed has no record" ~: do
      runRecord fizzBuzz (run [Edited (at 0) "f", Pressed 0 letter]) @?= Nothing

  , "failures pair each failed test's call with what the Solution returned" ~: do
      let rs = [pass, failWith, pass, pass]
      failedTests fizzBuzz (Results rs)
        @?= [("fizzBuzz(10)", "\"Buzz\"", "\"3\"")]

  , "the check request carries the code, the function name and the tests" ~: do
      let req = decode (LBS.fromStrict (T.encodeUtf8 (checkRequest fizzBuzz "let x"))) :: Maybe Value
      fmap keys req @?= Just ["code", "fn", "tests"]

  , "the check request sends object keys sorted, arrays in order" ~: do
      -- The runner and the Puzzle bank check both rely on this order.
      let obj kvs = Object (KeyMap.fromList [(Key.fromText k, v) | (k, v) <- kvs])
          p = fizzBuzz { tests =
                [ PuzzleTest
                    { args = [obj [("b", Number 1), ("a", Array [obj [("y", Number 1), ("x", Number 2)]])]]
                    , expected = obj [("z", Number 1), ("_", Number 2), ("B", Number 3)] } ] }
      checkRequest p "" @?= "{\"code\":\"\",\"fn\":\"fizzBuzz\",\"tests\":[{\"args\":[{\"a\":[{\"x\":2,\"y\":1}],\"b\":1}],\"expected\":{\"B\":3,\"_\":2,\"z\":1}}]}"

  , "a results reply parses" ~: do
      parseReply "{\"kind\":\"results\",\"results\":[{\"pass\":true,\"got\":\"\\\"Fizz\\\"\"}]}"
        @?= Results [TestResult { passed = True, got = "\"Fizz\"" }]

  , "an error reply parses as a crash" ~: do
      parseReply "{\"kind\":\"error\",\"message\":\"ReferenceError: x is not defined\"}"
        @?= Crashed "ReferenceError: x is not defined"

  , "an unreadable reply is a crash, not a pass" ~: do
      case parseReply "nonsense" of
        Crashed _ -> pure ()
        other -> assertFailure ("expected a crash, got " <> show other)
  ]
  where
    keys = \case
      Object o -> sort (map Key.toText (KeyMap.keys o))
      _ -> []
