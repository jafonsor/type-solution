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
import Common.History
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

-- | The status line on fizzBuzz with nothing passed before.
statusOf :: Run -> Text
statusOf = statusText fizzBuzz (history [])

run :: [Event] -> Run
run = foldl (flip step) newRun

-- | Every record the Runs leave behind, as the page keeps them: one for each
-- step that passed a Run.
records :: [Event] -> [RunRecord]
records es = mapMaybe (uncurry (recordOnStep fizzBuzz)) (zip runs (drop 1 runs))
  where runs = scanl (flip step) newRun es

-- | The two Languages the tests switch between. Only the names matter: the
-- Run and the history treat every Language alike.
js, ps :: Text
js = "javascript"
ps = "purescript"

-- | A character whose time doesn't matter to the test.
letter :: Key
letter = Character 'x'

-- | A key press at a time in milliseconds.
press :: Double -> Key -> Event
press = Pressed

-- | A Run under way: started at 1 s, with "x" typed.
typing :: [Event]
typing = [Pressed 0 letter, Edited (at 1) "x"]

-- | A stored record of a Run on the Puzzle with this identity, passed in
-- this many seconds.
storedRun :: Text -> Double -> RunRecord
storedRun i secs = RunRecord
  { puzzleIdentity = i, language = js, finishedAt = t0, duration = secs, wpm = 40, backspaces = 1
  , peeked = False, solution = "", keyPresses = [], keyLanguages = [] }

-- | A stored record whose key presses are these characters (as 'keyChar'
-- writes them, so @\b@ is a Backspace), each with its milliseconds since the
-- previous press.
keyed :: [(Char, Int)] -> RunRecord
keyed ps = (storedRun "fizzBuzz" 10)
  { keyPresses = [KeyPress { key = keyFromChar c, sincePrevious = g } | (c, g) <- ps] }

-- | A stored record of these key presses, 100 ms apart.
typedRecord :: String -> RunRecord
typedRecord s = keyed [(c, 100) | c <- s]

-- | Ten presses of each of these characters, so they reach the minimum.
tenOf :: String -> String
tenOf = concatMap (replicate 10)

-- | A Run's presses: each character with its gap; the first press of a Run
-- is never a Hesitation, so a throwaway one leads.
gapsOf :: [(Char, Int)] -> RunRecord
gapsOf ps = keyed (('_', 0) : ps)

-- | A Run on fizzBuzz passed in this many seconds, with one word typed.
passedIn :: Double -> Run
passedIn secs = run [Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space, CheckStarted 1 js, CheckFinished (at secs) 1 allPass]

-- | A parse error at line 1, column 9 with the underline at offsets 8 to 9.
syntaxError :: Text -> Outcome
syntaxError msg = CompileError CompileProblem
  { kind = Syntax, message = msg, line = 1, column = 9, ranges = [(8, 9)], everything = msg }

pass, failWith :: TestResult
pass = TestResult { passed = True, got = "\"x\"" }
failWith = TestResult { passed = False, got = "\"3\"" }

-- | fizzBuzz as it was written in Haskell before Puzzles became files.
fizzBuzz :: Puzzle
fizzBuzz = Puzzle
  { identity = "fizzBuzz"
  , function = "fizzBuzz"
  , prompt = "Return \"Fizz\" for multiples of 3, \"Buzz\" for multiples of 5, \"FizzBuzz\" for both, otherwise the number as a string."
  , javascript = LanguageTable
      { signature = "fizzBuzz(n)"
      , reference = "function fizzBuzz(n) {\n  if (n % 15 === 0) return \"FizzBuzz\";\n  if (n % 3 === 0) return \"Fizz\";\n  if (n % 5 === 0) return \"Buzz\";\n  return String(n);\n}\n"
      }
  , purescript = LanguageTable { signature = "fizzBuzz :: Int -> String", reference = "fizzBuzz n = show n" }
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
  , "prompt = \"Return x times two.\""
  , "[[tests]]"
  , "args = [2]"
  , "expected = 4"
  , "[[tests]]"
  , "args = [[1, 2.5], {a = \"b\"}, true]"
  , "expected = \"x\""
  , "[javascript]"
  , "signature = \"double(x)\""
  , "reference = \"function double(x) { return x * 2; }\""
  , "[purescript]"
  , "signature = \"double :: Int -> Int\""
  , "reference = \"double x = x * 2\""
  ]

parsesTo :: [Text] -> Either String Puzzle
parsesTo = parsePuzzle "double" . T.unlines

-- | The lines without a table header and the keys under it (up to the next
-- table header).
withoutTable :: Text -> [Text] -> [Text]
withoutTable header ls = before <> dropWhile (not . isHeader) (drop 1 rest)
  where
    (before, rest) = break (== header) ls
    isHeader l = "[" `T.isPrefixOf` l

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
      let r = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2.5) 1 allPass]
      r.phase @?= Passed
      elapsed (at 10) r @?= 1.5

  , "a failing outcome is kept to show why" ~: do
      let o = Results [failWith]
          r = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 o]
      r.phase @?= Checked
      r.outcome @?= Just o

  , "an outcome for a check that was superseded is ignored" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1 js, CheckStarted 2 js, CheckFinished (at 2) 1 allPass]
      r.phase @?= Checking
      r.outcome @?= Nothing

  , "switching Language before typing doesn't start the clock" ~: do
      let r = run [CodeSwapped ps "", CodeSwapped js ""]
      r.phase @?= NotStarted
      r.startedAt @?= Nothing

  , "switching Language doesn't reset the clock; the Run's code is the shown draft" ~: do
      let r = run [Edited (at 1) "js", CodeSwapped ps "", CodeSwapped js "js", Edited (at 5) "js2"]
          swapped = run [Edited (at 1) "js", CodeSwapped ps "ps"]
      r.startedAt @?= Just (at 1)
      elapsed (at 6) r @?= 5
      swapped.code @?= "ps"
      swapped.shown @?= ps
      swapped.phase @?= Typing
      -- Each Language keeps its text for a check of it later.
      (draftOf js swapped, draftOf ps swapped, draftOf "other" swapped) @?= ("js", "ps", "")

  , "switching Language drops the last outcome" ~: do
      let o = Results [failWith]
          checked = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 o, CodeSwapped ps "x"]
      checked.outcome @?= Nothing
      checked.phase @?= Typing

  -- L3: one Run, many Languages. Whichever Solution passes first ends the Run.

  , "a check in flight for the Language left still ends the Run when it passes, with that Language's Solution" ~: do
      let r = run [ Pressed 0 letter, Edited (at 1) "jsCode", CheckStarted 1 js
                  , CodeSwapped ps "", Pressed 100 (Character 'p'), Edited (at 2) "psCode"
                  , CheckFinished (at 3) 1 allPass ]
      r.phase @?= Passed
      r.passedBy @?= Just js
      r.code @?= "jsCode"
      -- The time is the whole Run's, from the first keystroke.
      elapsed (at 9) r @?= 2
      fmap (\rr -> (rr.language, rr.solution, rr.duration)) (runRecord fizzBuzz r) @?= Just (js, "jsCode", 2)

  , "a check that begins after the switch, of the Language left, counts too" ~: do
      -- The check starts 400 ms after the last edit, whichever Language is shown by then.
      let r = run [ Edited (at 1) "jsCode", CodeSwapped ps "", Edited (at 2) "psCode"
                  , CheckStarted 1 js, CheckFinished (at 3) 1 allPass ]
      r.phase @?= Passed
      r.code @?= "jsCode"
      (run [Edited (at 1) "jsCode", CodeSwapped ps "", Edited (at 2) "psCode", CheckStarted 1 js]).phase @?= Typing

  , "the other Language passing first ends the Run in that Language; the later one is ignored" ~: do
      let r = run [ Edited (at 1) "jsCode", CheckStarted 1 js, CodeSwapped ps "", Edited (at 2) "psCode"
                  , CheckStarted 2 ps, CheckFinished (at 3) 2 allPass, CheckFinished (at 4) 1 allPass ]
      r.passedBy @?= Just ps
      r.code @?= "psCode"
      elapsed (at 9) r @?= 2

  , "a failure of the Language left tells nothing about the shown draft" ~: do
      let o = Results [failWith]
          r = run [ Edited (at 1) "jsCode", CheckStarted 1 js, CodeSwapped ps "", Edited (at 2) "psCode"
                  , CheckStarted 2 ps, CheckFinished (at 3) 1 o ]
      r.phase @?= Checking
      r.outcome @?= Nothing
      -- And the shown Language's own check still counts afterwards.
      (step (CheckFinished (at 4) 2 allPass) r).passedBy @?= Just ps

  , "an edit drops only the check of the Language edited" ~: do
      let es = [ Edited (at 1) "jsCode", CheckStarted 1 js, CodeSwapped ps "", Edited (at 2) "psCode"
               , CheckStarted 2 ps, Edited (at 3) "psCode2" ]
      (run (es <> [CheckFinished (at 4) 1 allPass])).passedBy @?= Just js
      (run (es <> [CheckFinished (at 4) 2 allPass])).phase @?= Typing
      -- Back in JavaScript, an edit drops its check.
      (run (es <> [CodeSwapped js "jsCode", Edited (at 4) "jsCode2", CheckFinished (at 5) 1 allPass])).phase @?= Typing

  , "switching back to a Language whose check is still in flight shows its outcome when it arrives" ~: do
      let o = Results [failWith]
          r = run [ Edited (at 1) "jsCode", CheckStarted 1 js, CodeSwapped ps "", CodeSwapped js "jsCode"
                  , CheckFinished (at 2) 1 o ]
      r.phase @?= Checked
      r.outcome @?= Just o

  , "a Language switch during a Pause does nothing" ~: do
      let r = run (typing <> [Escaped (at 2), CodeSwapped ps "y"])
      r.shown @?= js
      r.code @?= "x"

  , "the Puzzle's table is found by Language name" ~: do
      fmap (.signature) (languageTable "javascript" fizzBuzz) @?= Just fizzBuzz.javascript.signature
      fmap (.signature) (languageTable "purescript" fizzBuzz) @?= Just fizzBuzz.purescript.signature
      languageTable "klingon" fizzBuzz @?= Nothing

  , "editing drops the pending check" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1 js, Edited (at 2) "", CheckFinished (at 3) 1 allPass]
      r.phase @?= Typing
      r.outcome @?= Nothing

  , "the last outcome stays visible while typing again" ~: do
      let o = syntaxError "Unexpected token"
          r = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 o, Edited (at 3) ""]
      r.phase @?= Typing
      r.outcome @?= Just o

  , "a timeout is a failed check" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 (TimedOut "Stopped")]
      r.phase @?= Checked
      r.outcome @?= Just (TimedOut "Stopped")

  , "no results is not a pass" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 (Results [])]
      r.phase @?= Checked

  , "a passed Run ignores further edits and checks" ~: do
      let r = run [ Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 allPass
                  , Edited (at 3) "", CheckStarted 2 js, CheckFinished (at 4) 2 (Results [failWith]) ]
      r.phase @?= Passed
      elapsed (at 9) r @?= 1

  , "a new Run after a pass starts from scratch" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1 js, CheckFinished (at 2) 1 allPass, NewRunStarted]
      r @?= newRun

  , "an outcome arriving after a new Run started is ignored" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1 js, Escaped (at 1.5), NewRunStarted, CheckFinished (at 2) 1 allPass]
      r @?= newRun

  , "a check left over from a dropped Run doesn't start the new one" ~: do
      let r = run [Edited (at 1) "", Escaped (at 1.2), NewRunStarted, CheckStarted 1 js]
      r @?= newRun

  -- Esc

  , "Esc before the first keystroke skips the Puzzle" ~: do
      let r = run [Escaped (at 1)]
      r.phase @?= Skipped
      statusOf r @?= "Skipped."
      elapsed (at 5) r @?= 0

  , "after a skip, Esc and typing do nothing" ~: do
      let r = run [Escaped (at 1), Escaped (at 2), Pressed 0 letter, Edited (at 3) "x", CheckStarted 1 js]
      r @?= run [Escaped (at 1)]

  , "Esc while typing pauses the Run and stops the clock" ~: do
      let r = run (typing <> [Escaped (at 4)])
      r.phase @?= Paused
      statusOf r @?= "Paused. Esc to carry on."
      elapsed (at 4) r @?= 3
      elapsed (at 60) r @?= 3

  , "Esc while a check runs pauses the Run" ~: do
      let r = run (typing <> [CheckStarted 1 js, Escaped (at 2)])
      r.phase @?= Paused

  , "Esc after a failed check pauses the Run and keeps the feedback" ~: do
      let o = Results [failWith]
          r = run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 o, Escaped (at 3)])
      r.phase @?= Paused
      r.outcome @?= Just o

  , "Esc while paused carries on where the Run was, the clock going on from the same time" ~: do
      let r = run (typing <> [Escaped (at 4), Escaped (at 10)])
      r.phase @?= Typing
      elapsed (at 10) r @?= 3
      elapsed (at 12) r @?= 5
      let c = run (typing <> [CheckStarted 1 js, Escaped (at 2), Escaped (at 3)])
      c.phase @?= Checking
      let o = syntaxError "Unexpected token"
          f = run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 o, Escaped (at 3), Escaped (at 4)])
      (f.phase, statusOf f) @?= (Checked, "doesn't parse yet: line 1, column 9: Unexpected token")

  , "edits and key presses are ignored while paused" ~: do
      let paused = run (typing <> [Escaped (at 4)])
          r = run (typing <> [Escaped (at 4), Pressed 0 letter, Pressed 0 Space, Edited (at 5) "xy"])
      r @?= paused
      r.code @?= "x"

  , "Esc after a pass does nothing" ~: do
      let done = run (typing <> [CheckStarted 1 js, CheckFinished (at 3) 1 allPass])
          r = run (typing <> [CheckStarted 1 js, CheckFinished (at 3) 1 allPass, Escaped (at 4)])
      r @?= done

  , "paused time is left out of the Run's time and words per minute" ~: do
      let keys5 = concat (replicate 5 [Pressed 0 letter, Pressed 0 Space])
          r = run ( [Edited (at 0) "f"] <> keys5
                  <> [Escaped (at 10), Escaped (at 25), Escaped (at 30), Escaped (at 40)]
                  <> [CheckStarted 1 js, CheckFinished (at 45) 1 allPass] )
      -- 45 s on the clock, 15 + 10 of them paused.
      elapsed (at 99) r @?= 20
      wordsPerMinute r @?= Just 15
      fmap (\rr -> (rr.duration, rr.wpm)) (runRecord fizzBuzz r) @?= Just (20, 15)
      statusOf r @?= "Passed in 20.0 s, 15 wpm, 0 backspaces. First time on this Puzzle."

  , "a check passing during a Pause ends the Run when the Pause began" ~: do
      let r = run (typing <> [CheckStarted 1 js, Escaped (at 3), CheckFinished (at 3.5) 1 allPass])
      r.phase @?= Passed
      r.finishedAt @?= Just (at 3)
      elapsed (at 99) r @?= 2
      map (.duration) (records (typing <> [CheckStarted 1 js, Escaped (at 3), CheckFinished (at 3.5) 1 allPass])) @?= [2]

  , "after an earlier Pause, a pass during a Pause still leaves out all paused time" ~: do
      let r = run (typing <> [Escaped (at 2), Escaped (at 7), CheckStarted 1 js, Escaped (at 8), CheckFinished (at 9) 1 allPass])
      elapsed (at 99) r @?= 2

  , "a check failing during a Pause shows its feedback and stays paused" ~: do
      let o = Results [pass, failWith]
          r = run (typing <> [CheckStarted 1 js, Escaped (at 3), CheckFinished (at 3.5) 1 o])
      r.phase @?= Paused
      r.outcome @?= Just o
      statusOf r @?= "Paused. Esc to carry on."
      let resumed = step (Escaped (at 4)) r
      (resumed.phase, statusOf resumed) @?= (Checked, "1/2 tests pass")

  , "a check that starts during a Pause counts too" ~: do
      let r = run (typing <> [Escaped (at 2), CheckStarted 1 js, CheckFinished (at 2.5) 1 allPass])
      (r.phase, r.finishedAt) @?= (Passed, Just (at 2))

  , "the menu is open exactly after a pass, during a Pause and after a skip" ~: do
      let toPass = typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 allPass]
          phases :: [(Phase, Bool)]
          phases =
            [ (newRun.phase, menuOpen newRun)
            , let r = run typing in (r.phase, menuOpen r)
            , let r = run (typing <> [CheckStarted 1 js]) in (r.phase, menuOpen r)
            , let r = run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 (TimedOut "Stopped")]) in (r.phase, menuOpen r)
            , let r = run (typing <> [Escaped (at 2)]) in (r.phase, menuOpen r)
            , let r = run [Escaped (at 1)] in (r.phase, menuOpen r)
            , let r = run toPass in (r.phase, menuOpen r)
            , let r = run (toPass <> [NewRunStarted]) in (r.phase, menuOpen r)
            ]
      phases @?=
        [ (NotStarted, False), (Typing, False), (Checking, False), (Checked, False)
        , (Paused, True), (Skipped, True), (Passed, True), (NotStarted, False) ]

  , "a Run given up from a Pause leaves no record" ~: do
      let es = typing <> [Pressed 0 Space, CheckStarted 1 js, Escaped (at 3), NewRunStarted, CheckFinished (at 3.5) 1 allPass]
      records es @?= []
      run es @?= newRun

  , "a passed Run leaves exactly one record, and a new Run after it none" ~: do
      let es = typing <> [CheckStarted 1 js, CheckFinished (at 3) 1 allPass, Escaped (at 4), NewRunStarted]
      map (.duration) (records es) @?= [2]

  -- The status line

  , "the status line says what the Run is doing" ~: do
      statusOf newRun @?= "Start typing: the clock starts on your first keystroke."
      statusOf (run typing) @?= ""
      statusOf (run (typing <> [CheckStarted 1 js])) @?= "checking…"
      let after o = statusOf (run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 o]))
      after (Results [pass, failWith, failWith]) @?= "1/3 tests pass"
      after (syntaxError "x") @?= "doesn't parse yet: line 1, column 9: x"
      after (Crashed "x") @?= "crashed"
      after (TimedOut "x") @?= "timed out"

  , "the status line shows the first error only, as one line with line and column: parse or type-check" ~: do
      let err k = CompileError CompileProblem
            { kind = k, message = "Could not match type String with type Int", line = 3, column = 12
            , ranges = [(1, 2), (5, 6)], everything = "1. line 3, column 12\n  Could not match type\n\n2. line 5, column 1\n  Unknown value x" }
          after o = run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 o])
      statusOf (after (err TypeCheck)) @?= "doesn't type-check yet: line 3, column 12: Could not match type String with type Int"
      statusOf (after (err Syntax)) @?= "doesn't parse yet: line 3, column 12: Could not match type String with type Int"
      -- hovering it shows every error in full; no other line has a hover
      statusHover (after (err TypeCheck)) @?= "1. line 3, column 12\n  Could not match type\n\n2. line 5, column 1\n  Unknown value x"
      statusHover (after (Crashed "x")) @?= ""
      statusHover (run typing) @?= ""
      statusHover newRun @?= ""

  , "the download takes the status line over while typing or waiting, with a percentage if there is one" ~: do
      loadText "PureScript" (Loading Nothing) @?= "Loading PureScript compiler…"
      loadText "PureScript" (Loading (Just 42)) @?= "Loading PureScript compiler… 42%"
      loadText "PureScript" LoadFailed @?= "Could not load the PureScript compiler."
      let at' ph = (run typing) { phase = ph }
      filter (loadShown . at') [NotStarted, Typing, Checking, Checked, Paused, Skipped, Passed]
        @?= [NotStarted, Typing, Checking, Checked]

  , "the pass line gives the time, words per minute and backspaces, and no Esc hint" ~: do
      let r = run [ Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space, Pressed 0 Backspace
                  , CheckStarted 1 js, CheckFinished (at 12.34) 1 allPass ]
      statusOf r @?= "Passed in 12.3 s, 5 wpm, 1 backspace. First time on this Puzzle."
      let r2 = run [ Edited (at 0) "f", Pressed 0 Backspace, Pressed 0 Backspace, CheckStarted 1 js, CheckFinished (at 6) 1 allPass ]
      statusOf r2 @?= "Passed in 6.0 s, 0 wpm, 2 backspaces. First time on this Puzzle."

  , "times read in seconds to a tenth" ~: do
      secondsText 0 @?= "0.0 s"
      secondsText 1 @?= "1.0 s"
      secondsText 75.25 @?= "75.2 s"

  -- Personal bests

  , "the Personal best is the fastest passed Run on the Puzzle, its words per minute and backspaces with it" ~: do
      let best = (storedRun "fizzBuzz" 12.3) { wpm = 42, backspaces = 3 }
          h = history [storedRun "fizzBuzz" 14, storedRun "other" 5, best, storedRun "fizzBuzz" 15.1]
      personalBest js "fizzBuzz" h @?= Just best
      personalBest js "nothingPassed" h @?= Nothing
      -- Of two equally fast, the earlier.
      let first = (storedRun "fizzBuzz" 9) { wpm = 1 }
      fmap (.wpm) (personalBest js "fizzBuzz" (history [first, (storedRun "fizzBuzz" 9) { wpm = 2 }])) @?= Just 1

  , "other Puzzles' Runs are ignored" ~: do
      let h = history [storedRun "other" 1, storedRun "fizzBuzzAgain" 2]
      personalBest js "fizzBuzz" h @?= Nothing
      statusText fizzBuzz h (passedIn 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. First time on this Puzzle."

  , "a pass with no earlier pass on the Puzzle is the first time" ~: do
      statusText fizzBuzz (history []) (passedIn 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. First time on this Puzzle."

  , "a pass faster than the best is a new best, naming the old one" ~: do
      let h = history [storedRun "fizzBuzz" 15.1, storedRun "fizzBuzz" 14, storedRun "other" 3]
      statusText fizzBuzz h (passedIn 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. New best (was 14.0 s)."

  , "a pass slower than the best gives the best" ~: do
      let h = history [storedRun "fizzBuzz" 12.3, storedRun "fizzBuzz" 14]
      statusText fizzBuzz h (passedIn 15.1) @?= "Passed in 15.1 s, 4 wpm, 0 backspaces. Best: 12.3 s."

  , "a pass as fast as the best is not a new best" ~: do
      let h = history [storedRun "fizzBuzz" 12.3]
      statusText fizzBuzz h (passedIn 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. Best: 12.3 s."

  , "bests compare the stored seconds, not the times shown to a tenth" ~: do
      let h = history [storedRun "fizzBuzz" 12.34]
      statusText fizzBuzz h (passedIn 12.26) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. New best (was 12.3 s)."
      statusText fizzBuzz h (passedIn 12.341) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. Best: 12.3 s."

  , "the best is never shown during a Run" ~: do
      let h = history [storedRun "fizzBuzz" 1]
          during = [ newRun, run typing, run (typing <> [CheckStarted 1 js])
                   , run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 (TimedOut "Stopped")])
                   , run (typing <> [Escaped (at 2)]), run [Escaped (at 1)] ]
      map (statusText fizzBuzz h) during @?= map statusOf during

  , "a passed Run's record, once added, is what the next Run compares with" ~: do
      let pass1 = [Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space, CheckStarted 1 js, CheckFinished (at 14) 1 allPass]
          h = foldr addRecord (history []) (records pass1)
      statusText fizzBuzz h (passedIn 15.1) @?= "Passed in 15.1 s, 4 wpm, 0 backspaces. Best: 14.0 s."
      statusText fizzBuzz h (passedIn 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. New best (was 14.0 s)."
      -- Records added in order, oldest first.
      let h2 = addRecord (storedRun "fizzBuzz" 10) (addRecord (storedRun "fizzBuzz" 20) (history []))
      h2 @?= history [storedRun "fizzBuzz" 20, storedRun "fizzBuzz" 10]

  -- Most missed and Slowest

  , "a character typed straight after one or two Backspaces is a Correction; after three or more it isn't" ~: do
      let h = history [typedRecord ("a\bb" <> "a\b\bc" <> "a\b\b\bd" <> "a\b\b\b\be" <> "\bf" <> tenOf "abcdef")]
      mostMissed js h @?= [('b', 1), ('c', 1), ('f', 1)]
      -- Only the character straight after counts, and the run starts again after it.
      mostMissed js (history [typedRecord ("x\bgg\bg" <> tenOf "g")]) @?= [('g', 2)]

  , "Most missed counts every Correction over the Runs, most first" ~: do
      let h = history [ typedRecord ("x\b;x\b;x\b;" <> tenOf ";'"), typedRecord "x\b;x\b'" ]
      mostMissed js h @?= [(';', 4), ('\'', 1)]

  , "Hesitation is the time since the previous press; a character's score is its median" ~: do
      -- An odd count: the middle one.
      slowest js (history [gapsOf [('m', g) | g <- [100, 200 .. 1100]]]) @?= [('m', 600)]
      -- An even count: the mean of the two middle ones.
      slowest js (history [gapsOf [('m', g) | g <- [100, 200 .. 1000]]]) @?= [('m', 550)]
      -- Typed straight after a Backspace still counts (left out, the median would be 1000).
      slowest js (history [gapsOf ([('n', 1000) | _ <- [1 .. 5 :: Int]] <> [('n', 100) | _ <- [1 .. 4 :: Int]] <> [('\b', 100), ('n', 100)])]) @?= [('n', 550)]

  , "Hesitation leaves out gaps over 1.5 s" ~: do
      let h = history [gapsOf ([('e', 1501) | _ <- [1 .. 6 :: Int]] <> [('e', 50) | _ <- [1 .. 4 :: Int]] <> [('w', 1500) | _ <- [1 .. 10 :: Int]])]
      slowest js h @?= [('w', 1500), ('e', 50)]
      -- Every gap too long: nothing to score, though typed ten times.
      slowest js (history [gapsOf [('e', 1600) | _ <- [1 .. 10 :: Int]]]) @?= []

  , "Hesitation leaves out each Run's first press" ~: do
      -- Each Run starts on a slow 'r'; counted, they'd make 'r' the slowest js (705 ms).
      let runOf = keyed [('r', 1400), ('r', 10), ('s', 100), ('s', 100)]
      slowest js (history (replicate 5 runOf)) @?= [('s', 100), ('r', 10)]

  , "the lists use only the last 20 Runs" ~: do
      let oldest = typedRecord (concat (replicate 10 "z\bz") <> "a\ba")
          rest = replicate 20 (typedRecord "a\ba")
      mostMissed js (history (oldest : rest)) @?= [('a', 20)]
      mostMissed js (history (oldest : drop 1 rest)) @?= [('a', 20), ('z', 10)]
      let slowOld = keyed (('_', 0) : [('y', 900) | _ <- [1 .. 10 :: Int]])
          quick = keyed [('_', 0), ('z', 100)]
      slowest js (history (slowOld : replicate 20 quick)) @?= [('z', 100)]

  , "records without key presses are skipped and don't use up one of the 20" ~: do
      let oldest = typedRecord (concat (replicate 10 "z\bz") <> "a\ba")
          rest = replicate 19 (typedRecord "a\ba")
          bare = storedRun "fizzBuzz" 5
          h = history ([oldest] <> rest <> replicate 5 bare)
      mostMissed js h @?= [('a', 20), ('z', 10)]
      -- They still give bests.
      fmap (.duration) (personalBest js "fizzBuzz" h) @?= Just 5
      mostMissed js (history (replicate 3 bare)) @?= []

  , "a character appears only once typed at least 10 times in those Runs" ~: do
      let h = history [typedRecord ("x\bk" <> replicate 8 'k' <> "x\bq" <> replicate 9 'q')]
      mostMissed js h @?= [('q', 1)]
      slowest js h @?= [('q', 100)]
      -- Counted over all the Runs together.
      mostMissed js (history [typedRecord ("x\bk" <> replicate 4 'k'), typedRecord "kkkkk"]) @?= [('k', 1)]

  , "Space, Enter, Tab and Backspace never appear" ~: do
      let h = history [keyed (('_', 0) : concat (replicate 10 [('x', 50), ('\b', 1400), (' ', 1400), ('\b', 1400), ('\n', 1400), ('\b', 1400), ('\t', 1400)]))]
      mostMissed js h @?= []
      slowest js h @?= [('x', 50)]

  , "A and a stay apart" ~: do
      let h = history [keyed (('_', 0) : concat (replicate 10 [('a', 100), ('\b', 100), ('A', 900)]))]
      mostMissed js h @?= [('A', 10)]
      slowest js h @?= [('A', 900), ('a', 100)]

  , "each list shows at most five characters, worst first, ties by character" ~: do
      let missed = concat [concat (replicate n ['x', '\b', c]) | (c, n) <- [('.', 3), (',', 3), ('{', 7), ('`', 1), ('"', 2), ('(', 5), (')', 4 :: Int)]]
          h = history [typedRecord (missed <> tenOf ".,{`\"()")]
      mostMissed js h @?= [('{', 7), ('(', 5), (')', 4), (',', 3), ('.', 3)]
      let gaps = [(c, g) | (c, g) <- [('.', 300), (',', 300), ('{', 700), ('`', 100), ('"', 200), ('(', 500), (')', 400)], _ <- [1 .. 10 :: Int]]
      slowest js (history [gapsOf gaps]) @?= [('{', 700), ('(', 500), (')', 400), (',', 300), ('.', 300)]

  , "both lists are empty until some character has enough data" ~: do
      mostMissed js (history []) @?= []
      slowest js (history []) @?= []
      let h = history [typedRecord "f\bfunction"]
      (mostMissed js h, slowest js h) @?= ([], [])

  , "a newly added record counts straight away" ~: do
      let h = history [typedRecord (tenOf ";")]
      mostMissed js h @?= []
      mostMissed js (addRecord (typedRecord "x\b;") h) @?= [(';', 1)]

  , "stored records decode one by one: old, stripped and full records read, a broken one is skipped" ~: do
      let old = "{\"puzzle\":\"fizzBuzz\",\"finishedAt\":\"2026-10-17T21:14:03.512Z\",\"seconds\":99.9,\"wordsPerMinute\":10,\"backspaces\":0,\"solution\":\"x\"}"
          full = "{\"backspaces\":1,\"finishedAt\":\"2026-10-19T10:00:00Z\",\"gaps\":[0,120],\"keys\":\"A \",\"puzzle\":\"other\",\"seconds\":4,\"solution\":\"A \",\"wordsPerMinute\":15}"
          stripped = "{\"backspaces\":1,\"finishedAt\":\"2026-10-19T10:00:00Z\",\"puzzle\":\"fizzBuzz\",\"seconds\":12.5,\"solution\":\"A \",\"wordsPerMinute\":15}"
          badKeys = "{\"backspaces\":1,\"finishedAt\":\"2026-10-19T10:00:00Z\",\"keys\":\"ab\",\"puzzle\":\"fizzBuzz\",\"seconds\":1,\"solution\":\"\",\"wordsPerMinute\":15}"
          rs = decodeRecords ("[" <> T.intercalate "," [old, "5", full, "{\"puzzle\":\"fizzBuzz\"}", stripped, "null", badKeys, "\"junk\""] <> "]")
      map (\r -> (r.puzzleIdentity, r.duration, length r.keyPresses)) rs
        @?= [("fizzBuzz", 99.9, 0), ("other", 4, 2), ("fizzBuzz", 12.5, 0)]
      fmap (.duration) (personalBest js "fizzBuzz" (history rs)) @?= Just 12.5
      decodeRecords "[]" @?= []
      decodeRecords "not json" @?= []
      decodeRecords "{\"puzzle\":\"fizzBuzz\"}" @?= []

  , "a space or Enter straight after a character ends a word" ~: do
      let r = run (map (Pressed 0) [letter, Space, Space, letter, letter, Enter, Enter, letter])
      scoredWords r @?= 2

  , "a space after a backspace doesn't end a word" ~: do
      let r = run (map (Pressed 0) [letter, Backspace, Space])
      scoredWords r @?= 0

  , "backspaces are counted" ~: do
      let r = run (map (Pressed 0) [letter, Backspace, Backspace, letter])
      scoredBackspaces r @?= 2

  , "key presses after passing don't count" ~: do
      let r = run [ Pressed 0 letter, Edited (at 1) "x", CheckStarted 1 js, CheckFinished (at 2) 1 allPass
                  , Pressed 0 Space, Pressed 0 Backspace ]
      (scoredWords r, scoredBackspaces r) @?= (0, 0)

  , "the Run keeps every key press, in order, with the milliseconds since the one before" ~: do
      let es = [ press 1000.4 (Character 'f'), Edited (at 1) "f", press 1120.4 (Character 'n')
               , press 1200 Backspace, press 1295.6 (Character 'u'), press 1400 Space
               , press 1450 Enter, press 1500 Tab
               , CheckStarted 1 js, CheckFinished (at 3) 1 allPass ]
      map (\kp -> (kp.key, kp.sincePrevious)) (concatMap (.keyPresses) (records es)) @?=
        [ (Character 'f', 0), (Character 'n', 120), (Backspace, 80), (Character 'u', 96)
        , (Space, 104), (Enter, 50), (Tab, 50) ]
      -- Counting is as before.
      let r = run es
      (scoredWords r, scoredBackspaces r) @?= (1, 1)

  , "A and a are kept as different characters" ~: do
      let es = [press 0 (Character 'A'), Edited (at 1) "A", press 90 (Character 'a'), CheckStarted 1 js, CheckFinished (at 2) 1 allPass]
      map (.key) (concatMap (.keyPresses) (records es)) @?= [Character 'A', Character 'a']

  , "only a Space or Enter straight after a character ends a word; Tab never does" ~: do
      let r = run (map (Pressed 0) [Character 'a', Tab, Space, Character '{', Enter, Character '1', Tab])
      scoredWords r @?= 1

  , "key presses while paused, after a skip or after a pass aren't kept" ~: do
      let toPause = [press 0 (Character 'a'), Edited (at 1) "a", Escaped (at 2)]
          es = toPause <> [press 50 (Character 'b'), Escaped (at 3), press 1000 (Character 'c')
                          , CheckStarted 1 js, CheckFinished (at 4) 1 allPass, press 2000 (Character 'd'), press 2100 Space]
      -- The gap after a Pause includes the paused time.
      map (\kp -> (kp.key, kp.sincePrevious)) (concatMap (.keyPresses) (records es))
        @?= [(Character 'a', 0), (Character 'c', 1000)]
      map (\p -> (p.time, p.key)) (run (es <> [press 3000 (Character 'e')])).presses @?= [(1000, Character 'c'), (0, Character 'a')]
      (run [Escaped (at 1), press 10 (Character 'z')]).presses @?= []

  , "a new Run clears the counts" ~: do
      let r = run [Pressed 0 letter, Edited (at 1) "x", Pressed 0 Space, Pressed 0 Backspace, Escaped (at 2), NewRunStarted]
      r @?= newRun

  , "a passed Run's record has its time, words per minute, backspaces and Solution" ~: do
      let keys5 = concat (replicate 5 [Pressed 0 letter, Pressed 0 Space])
          r = run ( [Edited (at 0) "f"] <> keys5 <> [Pressed 0 Backspace, Edited (at 1) "function fizzBuzz"]
                  <> [CheckStarted 1 js, CheckFinished (at 30) 1 allPass] )
      runRecord fizzBuzz r @?= Just RunRecord
        { puzzleIdentity = "fizzBuzz"
        , language = js
        , finishedAt = at 30
        , duration = 30
        , wpm = 10
        , backspaces = 1
        , peeked = False
        , keyLanguages = []
        , solution = "function fizzBuzz"
        , keyPresses = map (\k -> KeyPress { key = k, sincePrevious = 0 })
            (concat (replicate 5 [letter, Space]) <> [Backspace])
        }

  , "a passed Run's record names the Puzzle by its identity, not its function" ~: do
      let p = fizzBuzz { identity = "fizzBuzzAgain" }
          r = run [Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space, CheckStarted 1 js, CheckFinished (at 6) 1 allPass]
          rr = runRecord p r
      fmap (.puzzleIdentity) rr @?= Just "fizzBuzzAgain"
      case fmap (decode . encode) rr :: Maybe (Maybe Value) of
        Just (Just (Object o)) -> KeyMap.lookup "puzzle" o @?= Just (String "fizzBuzzAgain")
        other -> assertFailure ("expected a JSON object, got " <> show other)

  , "a record reads back what it writes" ~: do
      let rr = RunRecord
            { puzzleIdentity = "fizzBuzz", language = ps, finishedAt = at 30, duration = 29.5
            , wpm = 41.25, backspaces = 3, peeked = True, solution = "function fizzBuzz(n) {}"
            , keyLanguages = []
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
        , language = js
        , peeked = False
        , keyLanguages = []
        , finishedAt = UTCTime (fromGregorian 2026 10 17) (21 * 3600 + 14 * 60 + 3.512)
        , duration = 24.731
        , wpm = 38.81
        , backspaces = 2
        , solution = "function fizzBuzz(n) {\n  return n;\n}"
        , keyPresses = []
        }

  , "a record stores its key presses as a string of keys and a list of gaps" ~: do
      let rr = RunRecord
            { puzzleIdentity = "fizzBuzz", language = js, finishedAt = at 30, duration = 29.5
            , wpm = 41.25, backspaces = 1, peeked = False, solution = "aB", keyLanguages = []
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

  -- The Run and its credit (spec, "The Run and its credit")

  , "words per minute and backspaces are the passing Solution's; the time is the whole Run's" ~: do
      -- Four words and two Backspaces in the first Language, then two words and
      -- one Backspace in the second, which passes at 30 s.
      let first = concat (replicate 4 [Pressed 0 letter, Pressed 0 Space]) <> [Pressed 0 Backspace, Pressed 0 Backspace]
          second = concat (replicate 2 [Pressed 0 letter, Pressed 0 Space]) <> [Pressed 0 Backspace]
          r = run ([Edited (at 0) "j"] <> first <> [CodeSwapped ps "p"] <> second
                  <> [Edited (at 10) "p2", CheckStarted 1 ps, CheckFinished (at 30) 1 allPass])
      (scoredWords r, scoredBackspaces r) @?= (2, 1)
      fmap (\rr -> (rr.language, rr.duration, rr.wpm, rr.backspaces)) (runRecord fizzBuzz r) @?= Just (ps, 30, 4, 1)

  , "a Space straight after a switch doesn't follow a character typed in the other Language" ~: do
      scoredWords (run [Pressed 0 letter, Edited (at 0) "j", CodeSwapped ps "", Pressed 0 Space]) @?= 0
      scoredWords (run [Pressed 0 letter, Edited (at 0) "j", CodeSwapped ps "", Pressed 0 letter, Pressed 0 Space]) @?= 1

  , "key presses are kept with the Language they were typed in" ~: do
      let r = run [ press 0 (Character 'a'), Edited (at 1) "a", CodeSwapped ps "", press 100 (Character 'b')
                  , press 150 (Character 'c'), CodeSwapped js "a", press 400 (Character 'd'), Edited (at 2) "ad"
                  , CheckStarted 1 js, CheckFinished (at 3) 1 allPass ]
      case runRecord fizzBuzz r of
        Just rr -> do
          rr.language @?= js
          map (\kp -> (kp.key, kp.sincePrevious)) rr.keyPresses
            @?= [(Character 'a', 0), (Character 'b', 100), (Character 'c', 50), (Character 'd', 250)]
          rr.keyLanguages @?= [(js, 1), (ps, 2), (js, 1)]
        Nothing -> assertFailure "the Run passed but left no record"

  , "a Run that never switched Language records no key Languages" ~: do
      case records (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 allPass]) of
        [rr] -> do
          rr.keyLanguages @?= []
          case decode (encode rr) :: Maybe Value of
            Just (Object o) -> KeyMap.member "keyLanguages" o @?= False
            other -> assertFailure ("expected a JSON object, got " <> show other)
        other -> assertFailure ("expected one record, got " <> show (length other))

  , "a new Run keeps the Language shown and drops every draft" ~: do
      let r = run [Edited (at 1) "j", CodeSwapped ps "p", NewRunStarted]
      r @?= newRunIn ps
      draftOf js r @?= ""

  -- Peeking (spec, "Peeking")

  , "the hint open for a second or more marks the Run peeked; less doesn't" ~: do
      let after secs = run (typing <> [HintOpened (at 2), HintClosed (at (2 + secs))])
      (after 0.9).hasPeeked @?= False
      (after 1).hasPeeked @?= True
      (after 30).hasPeeked @?= True

  , "brief mouse-overs add up to nothing" ~: do
      let blip n = [HintOpened (at n), HintClosed (at (n + 0.9))]
      (run (typing <> concatMap blip [2, 4 .. 20])).hasPeeked @?= False

  , "a Run passed while the hint has been open for a second is peeked; at less, it isn't" ~: do
      let passWith secsOpen = run (typing <> [HintOpened (at 2), CheckStarted 1 js, CheckFinished (at (2 + secsOpen)) 1 allPass])
      (passWith 1).hasPeeked @?= True
      (passWith 0.5).hasPeeked @?= False
      fmap (.peeked) (runRecord fizzBuzz (passWith 1)) @?= Just True

  , "the mark covers the whole Run, whichever Language passes" ~: do
      let r = run [ Edited (at 1) "j", CodeSwapped ps "p", HintOpened (at 2), CodeSwapped js "j"
                  , HintClosed (at 3.5), CodeSwapped ps "p", Edited (at 4) "p2", CheckStarted 1 ps
                  , CheckFinished (at 5) 1 allPass ]
      fmap (\rr -> (rr.language, rr.peeked)) (runRecord fizzBuzz r) @?= Just (ps, True)

  , "a peek before the first keystroke or during a Pause counts; after a skip or a pass it doesn't" ~: do
      (run [HintOpened (at 0), HintClosed (at 2)]).hasPeeked @?= True
      (run (typing <> [Escaped (at 2), HintOpened (at 3), HintClosed (at 5)])).hasPeeked @?= True
      (run [Escaped (at 1), HintOpened (at 2), HintClosed (at 5)]).hasPeeked @?= False
      let passed = run (typing <> [CheckStarted 1 js, CheckFinished (at 2) 1 allPass, HintOpened (at 3), HintClosed (at 9)])
      passed.hasPeeked @?= False

  , "a new Run starts unpeeked" ~: do
      (run (typing <> [HintOpened (at 2), HintClosed (at 4), NewRunStarted])).hasPeeked @?= False

  , "isPeeked sees a hint that is still open" ~: do
      let r = run (typing <> [HintOpened (at 2)])
      (isPeeked (at 2.9) r, isPeeked (at 3) r) @?= (False, True)

  , "the time shows the plain word peeked where the Run's time is shown" ~: do
      let peekedPass secs = run [ HintOpened (at (-3)), HintClosed (at (-1)), Edited (at 0) "f", Pressed 0 letter, Pressed 0 Space
                                , CheckStarted 1 js, CheckFinished (at secs) 1 allPass ]
      statusText fizzBuzz (history []) (peekedPass 12.3)
        @?= "Passed in 12.3 s (peeked), 5 wpm, 0 backspaces. First time on this Puzzle."
      -- Beside the best, whether the best or the Run was peeked.
      let peekedBest = (storedRun "fizzBuzz" 14) { peeked = True }
      statusText fizzBuzz (history [peekedBest]) (passedIn 12.3)
        @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. New best (was 14.0 s, peeked)."
      statusText fizzBuzz (history [peekedBest]) (passedIn 15.1)
        @?= "Passed in 15.1 s, 4 wpm, 0 backspaces. Best: 14.0 s (peeked)."
      statusText fizzBuzz (history [storedRun "fizzBuzz" 14]) (peekedPass 15.1)
        @?= "Passed in 15.1 s (peeked), 4 wpm, 0 backspaces. Best: 14.0 s."

  , "a faster Run replaces the best peeked or not; the mark follows the best" ~: do
      let rcd secs pk = (storedRun "fizzBuzz" secs) { peeked = pk }
          best rs = fmap (\b -> (b.duration, b.peeked)) (personalBest js "fizzBuzz" (history rs))
      -- A slower unpeeked Run doesn't replace a faster peeked best.
      best [rcd 10 True, rcd 12 False] @?= Just (10, True)
      -- A faster Run replaces it, peeked or not, and the best's mark is the new Run's.
      best [rcd 12 True, rcd 8 False] @?= Just (8, False)
      best [rcd 12 False, rcd 8 True] @?= Just (8, True)
      best [rcd 8 False, rcd 12 True] @?= Just (8, False)

  -- Languages in saved data and bests

  , "a Run that switched Language is eligible for the best of the Language that passed, with its whole time" ~: do
      let r = run [ Edited (at 0) "j", CodeSwapped ps "", Edited (at 20) "p", CheckStarted 1 ps, CheckFinished (at 25) 1 allPass ]
          h = history (records [ Edited (at 0) "j", CodeSwapped ps "", Edited (at 20) "p", CheckStarted 1 ps, CheckFinished (at 25) 1 allPass ])
      r.passedBy @?= Just ps
      fmap (.duration) (personalBest ps "fizzBuzz" h) @?= Just 25
      personalBest js "fizzBuzz" h @?= Nothing

  , "the Personal best is per Puzzle and Language" ~: do
      let inPs secs = (storedRun "fizzBuzz" secs) { language = ps }
          h = history [storedRun "fizzBuzz" 20, inPs 5, storedRun "fizzBuzz" 15, inPs 9, (inPs 1) { puzzleIdentity = "other" }]
      fmap (.duration) (personalBest js "fizzBuzz" h) @?= Just 15
      fmap (.duration) (personalBest ps "fizzBuzz" h) @?= Just 5
      fmap (.duration) (personalBest ps "other" h) @?= Just 1
      personalBest "klingon" "fizzBuzz" h @?= Nothing

  , "a pass is compared with the bests of its own Language" ~: do
      let inPs secs = (storedRun "fizzBuzz" secs) { language = ps }
          h = history [storedRun "fizzBuzz" 5, inPs 30]
          passedInPs secs = run [Edited (at 0) "f", CodeSwapped ps "p", Pressed 0 letter, Pressed 0 Space, CheckStarted 1 ps, CheckFinished (at secs) 1 allPass]
      statusText fizzBuzz h (passedInPs 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. New best (was 30.0 s)."
      statusText fizzBuzz h (passedIn 12.3) @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. Best: 5.0 s."
      statusText fizzBuzz (history [storedRun "fizzBuzz" 5]) (passedInPs 12.3)
        @?= "Passed in 12.3 s, 5 wpm, 0 backspaces. First time on this Puzzle."

  , "Most missed and Slowest are per Language" ~: do
      let jsRec = typedRecord ("x\b;" <> tenOf ";")
          psRec = (typedRecord ("x\b," <> tenOf ",")) { language = ps }
          h = history [jsRec, psRec]
      mostMissed js h @?= [(';', 1)]
      mostMissed ps h @?= [(',', 1)]
      map fst (slowest js h) @?= ";"
      map fst (slowest ps h) @?= ","
      mostMissed "klingon" h @?= []

  , "the last 20 records window counts only that Language's records" ~: do
      -- 20 later PureScript records would push a JavaScript record out of a
      -- window that counted every record.
      let jsMiss = typedRecord ("x\bz" <> tenOf "z")
          psRec = (typedRecord (tenOf "p")) { language = ps }
          h = history (jsMiss : replicate 20 psRec)
      mostMissed js h @?= [('z', 1)]
      -- And 20 JavaScript records do push it out of JavaScript's window only.
      let h2 = history (jsMiss : replicate 20 (typedRecord (tenOf "q")) <> replicate 5 psRec)
      mostMissed js h2 @?= []
      mostMissed ps (history ((jsMiss { language = ps }) : replicate 20 (typedRecord (tenOf "q")))) @?= [('z', 1)]

  , "a press counts toward the Language it was typed in, even in a Run another Language passed" ~: do
      -- Typed in JavaScript first, then in PureScript, where the Run passed.
      let first = "x\b;" <> tenOf ";"
          second = "x\b," <> tenOf ","
          rcd = (typedRecord (first <> second))
            { language = ps, keyLanguages = [(js, length first), (ps, length second)] }
          h = history [rcd]
      mostMissed js h @?= [(';', 1)]
      mostMissed ps h @?= [(',', 1)]

  , "a Backspace run and the first press after a switch don't span the switch" ~: do
      -- The Backspace ends the JavaScript stretch; the PureScript ';' is no Correction.
      let first = "x\b"
          second = tenOf ";"
          rcd = (typedRecord (first <> second)) { language = ps, keyLanguages = [(js, length first), (ps, length second)] }
      mostMissed ps (history [rcd]) @?= []
      -- The first press of the stretch is no Hesitation; gaps after it are.
      let gaps = [('_', 0)] <> [('a', 100) | _ <- [1 .. 10 :: Int]] <> [('b', 1400)] <> [('b', g) | g <- [100, 100, 100, 100, 100, 300, 300, 300, 300, 300]]
          rcd2 = (keyed gaps) { language = ps, keyLanguages = [(js, 11), (ps, 11)] }
      slowest ps (history [rcd2]) @?= [('b', 200)]

  , "stored records of every Language and age decode into one list; old ones are JavaScript" ~: do
      let base lang = "{\"puzzle\":\"fizzBuzz\",\"finishedAt\":\"2026-10-19T10:00:00Z\",\"seconds\":" <> lang
          oldRec secs = base secs <> ",\"wordsPerMinute\":10,\"backspaces\":0,\"solution\":\"x\"}"
          withLang l secs = "{\"language\":" <> l <> ",\"puzzle\":\"fizzBuzz\",\"finishedAt\":\"2026-10-19T10:00:00Z\",\"seconds\":" <> secs <> ",\"wordsPerMinute\":10,\"backspaces\":0,\"solution\":\"x\",\"peeked\":true}"
          rs = decodeRecords ("[" <> T.intercalate ","
            [ oldRec "9", withLang "\"purescript\"" "7", withLang "\"javascript\"" "8", withLang "null" "6", withLang "5" "1", oldRec "11", withLang "\"klingon\"" "2" ] <> "]")
      map (\r -> (r.language, r.duration, r.peeked)) rs
        @?= [(js, 9, False), (ps, 7, True), (js, 8, True), (js, 6, True), (js, 11, False), ("klingon", 2, True)]
      let h = history rs
      fmap (.duration) (personalBest js "fizzBuzz" h) @?= Just 6
      fmap (.duration) (personalBest ps "fizzBuzz" h) @?= Just 7
      fmap (.duration) (personalBest "klingon" "fizzBuzz" h) @?= Just 2

  , "a record's Language, peeked flag and key Languages are written and read back" ~: do
      let rr = (keyed [('a', 0), ('b', 10), ('c', 20)]) { language = ps, peeked = True, keyLanguages = [(js, 1), (ps, 2)] }
      eitherDecode (encode rr) @?= Right rr
      case decode (encode rr) :: Maybe Value of
        Just (Object o) -> do
          KeyMap.lookup "language" o @?= Just (String "purescript")
          KeyMap.lookup "peeked" o @?= Just (Bool True)
          KeyMap.lookup "keyLanguages" o @?= Just (Array [Array [String "javascript", Number 1], Array [String "purescript", Number 2]])
        other -> assertFailure ("expected a JSON object, got " <> show other)
      -- Every new record names its Language, peeked or not.
      case decode (encode (storedRun "fizzBuzz" 3)) :: Maybe Value of
        Just (Object o) -> (KeyMap.lookup "language" o, KeyMap.lookup "peeked" o) @?= (Just (String "javascript"), Just (Bool False))
        other -> assertFailure ("expected a JSON object, got " <> show other)

  , "key Languages that don't add up to the key presses are ignored: every press is the record's Language" ~: do
      let stored kl = "{\"puzzle\":\"fizzBuzz\",\"language\":\"purescript\",\"finishedAt\":\"2026-10-19T10:00:00Z\",\"seconds\":4,\"wordsPerMinute\":15,\"backspaces\":1,\"solution\":\"\",\"keys\":\"ab\",\"gaps\":[0,1],\"keyLanguages\":" <> kl <> "}"
      fmap (.keyLanguages) (eitherDecode (stored "[[\"javascript\",1],[\"purescript\",5]]") :: Either String RunRecord) @?= Right []
      fmap (.keyLanguages) (eitherDecode (stored "\"junk\"") :: Either String RunRecord) @?= Right []
      fmap (.keyLanguages) (eitherDecode (stored "[[\"javascript\",1],[\"purescript\",1]]") :: Either String RunRecord) @?= Right [(js, 1), (ps, 1)]

  , "the bank's fizzBuzz is the fizzBuzz Puzzle the game has always played" ~: do
      -- Except the PureScript table, a placeholder until ticket 24.
      fmap (\p -> p { purescript = fizzBuzz.purescript }) (lookupPuzzle "fizzBuzz") @?= Just fizzBuzz

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
      fmap (\p -> (p.identity, p.function, p.prompt, p.javascript.signature, p.javascript.reference)) (parsesTo sampleFile)
        @?= Right ("double", "double", "Return x times two.", "double(x)", "function double(x) { return x * 2; }")

  , "a Puzzle file holds a table for each Language: JavaScript and PureScript both parse" ~: do
      fmap (\p -> (p.purescript.signature, p.purescript.reference)) (parsesTo sampleFile)
        @?= Right ("double :: Int -> Int", "double x = x * 2")

  , "a Puzzle file missing a key fails, naming it" ~: do
      failsMentioning "prompt" (parsesTo (filter (not . T.isPrefixOf "prompt") sampleFile))

  , "a Puzzle file missing the [javascript] table fails, naming it" ~: do
      failsMentioning "javascript" (parsesTo (withoutTable "[javascript]" sampleFile))

  , "a Puzzle file missing the [purescript] table fails, naming it" ~: do
      failsMentioning "purescript" (parsesTo (withoutTable "[purescript]" sampleFile))

  , "a Puzzle file with a Language table the format doesn't know fails, naming it" ~: do
      failsMentioning "ruby" (parsesTo (sampleFile <> ["[ruby]", "signature = \"double(x)\"", "reference = \"def double(x) = x * 2\""]))

  , "a top-level key the format doesn't know fails, naming it" ~: do
      failsMentioning "difficulty" (parsesTo (["difficulty = 3"] <> sampleFile))

  , "a Language table missing its reference fails, naming it" ~: do
      failsMentioning "reference" (parsesTo (filter (/= "reference = \"double x = x * 2\"") sampleFile))

  , "a Language table with a key the format doesn't know fails, naming it" ~: do
      failsMentioning "difficulty" (parsesTo (sampleFile <> ["difficulty = 3"]))

  , "the old shape, signature and reference at the top level, fails" ~: do
      failsMentioning "signature" (parsesTo (["signature = \"double(x)\""] <> sampleFile))

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

  , "failures pair each failed test's input (no call syntax) with what the Solution returned" ~: do
      let rs = [pass, failWith, pass, pass]
      failedTests fizzBuzz (Results rs)
        @?= [("10", "\"Buzz\"", "\"3\"")]

  , "a failed test's input is its arguments in JSON, comma separated, with no call syntax" ~: do
      inputText PuzzleTest { args = [Number 3], expected = Null } @?= "3"
      inputText PuzzleTest { args = [Object (KeyMap.fromList [(Key.fromText "a", Number 1)]), String "a"], expected = Null }
        @?= "{\"a\":1}, \"a\""
      inputText PuzzleTest { args = [], expected = Null } @?= ""

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
      parseReply "{\"status\":\"pass\",\"message\":\"\",\"results\":[{\"pass\":true,\"got\":\"\\\"Fizz\\\"\"}]}"
        @?= Results [TestResult { passed = True, got = "\"Fizz\"" }]
      parseReply "{\"status\":\"fail\",\"message\":\"\",\"results\":[{\"pass\":false,\"got\":\"1\"}]}"
        @?= Results [TestResult { passed = False, got = "1" }]

  , "an error reply parses as a crash" ~: do
      parseReply "{\"status\":\"error\",\"kind\":\"crash\",\"message\":\"ReferenceError: x is not defined\",\"line\":1,\"column\":0}"
        @?= Crashed "ReferenceError: x is not defined"

  , "a syntax error reply and a timeout reply parse as themselves" ~: do
      parseReply "{\"status\":\"error\",\"kind\":\"syntax\",\"message\":\"Unexpected token (1:8)\",\"line\":1,\"column\":8,\"range\":{\"from\":8,\"to\":9}}"
        @?= CompileError CompileProblem
          { kind = Syntax, message = "Unexpected token (1:8)", line = 1, column = 8, ranges = [(8, 9)], everything = "Unexpected token (1:8)" }
      parseReply "{\"status\":\"error\",\"kind\":\"timeout\",\"message\":\"Stopped after 1.0 s: an infinite loop?\",\"line\":1,\"column\":0}"
        @?= TimedOut "Stopped after 1.0 s: an infinite loop?"

  , "a type error reply parses with its position, every range and the full text" ~: do
      parseReply "{\"status\":\"error\",\"kind\":\"type\",\"message\":\"Could not match type String with type Int\",\"line\":3,\"column\":12,\"range\":{\"from\":40,\"to\":43},\"ranges\":[{\"from\":40,\"to\":43},{\"from\":60,\"to\":61}],\"all\":\"1. line 3, column 12\\nfull text\"}"
        @?= CompileError CompileProblem
          { kind = TypeCheck, message = "Could not match type String with type Int", line = 3, column = 12
          , ranges = [(40, 43), (60, 61)], everything = "1. line 3, column 12\nfull text" }

  , "a compile error without a position or ranges still parses: line 1, column 1, nothing to underline, the message in full" ~: do
      parseReply "{\"status\":\"error\",\"kind\":\"type\",\"message\":\"oops\"}"
        @?= CompileError CompileProblem { kind = TypeCheck, message = "oops", line = 1, column = 1, ranges = [], everything = "oops" }

  , "only a compile error has ranges to underline" ~: do
      underlineRanges (syntaxError "x") @?= [(8, 9)]
      underlineRanges (Crashed "x") @?= []
      underlineRanges (TimedOut "x") @?= []
      underlineRanges (Results [pass]) @?= []

  , "an unreadable reply is a crash, not a pass" ~: do
      case parseReply "nonsense" of
        Crashed _ -> pure ()
        other -> assertFailure ("expected a crash, got " <> show other)
  ]
  where
    keys = \case
      Object o -> sort (map Key.toText (KeyMap.keys o))
      _ -> []
