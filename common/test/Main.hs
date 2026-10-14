module Main (main) where

import Control.Monad (unless)
import Data.Aeson (Value (..), decode)
import Data.Aeson.Key qualified as Key
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as LBS
import Data.List (sort)
import Data.Text.Encoding qualified as T
import Data.Time (UTCTime (..), addUTCTime, fromGregorian)
import System.Exit (exitFailure)
import Test.HUnit

import Common.Puzzle
import Common.Run

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

pass, failWith :: TestResult
pass = TestResult { passed = True, got = "\"x\"" }
failWith = TestResult { passed = False, got = "\"3\"" }

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

  , "restarting gives a new Run" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, CheckFinished (at 2) 1 allPass, Restarted]
      r @?= newRun

  , "an outcome arriving after a restart is ignored" ~: do
      let r = run [Edited (at 1) "", CheckStarted 1, Restarted, CheckFinished (at 2) 1 allPass]
      r @?= newRun

  , "a space or Enter straight after a character ends a word" ~: do
      let r = run (map Pressed [Character, Space, Space, Character, Character, Enter, Enter, Character])
      r.wordsTyped @?= 2

  , "a space after a backspace doesn't end a word" ~: do
      let r = run (map Pressed [Character, Backspace, Space])
      r.wordsTyped @?= 0

  , "backspaces are counted" ~: do
      let r = run (map Pressed [Character, Backspace, Backspace, Character])
      r.backspaces @?= 2

  , "key presses after passing don't count" ~: do
      let r = run [ Pressed Character, Edited (at 1) "x", CheckStarted 1, CheckFinished (at 2) 1 allPass
                  , Pressed Space, Pressed Backspace ]
      (r.wordsTyped, r.backspaces) @?= (0, 0)

  , "restarting clears the counts" ~: do
      let r = run [Pressed Character, Pressed Space, Pressed Backspace, Restarted]
      r @?= newRun

  , "a passed Run's record has its time, words per minute, backspaces and Solution" ~: do
      let keys5 = concat (replicate 5 [Pressed Character, Pressed Space])
          r = run ( [Edited (at 0) "f"] <> keys5 <> [Pressed Backspace, Edited (at 1) "function fizzBuzz"]
                  <> [CheckStarted 1, CheckFinished (at 30) 1 allPass] )
      runRecord fizzBuzz r @?= Just RunRecord
        { puzzleFunction = "fizzBuzz"
        , finishedAt = at 30
        , duration = 30
        , wpm = 10
        , backspaces = 1
        , solution = "function fizzBuzz"
        }

  , "a Run that hasn't passed has no record" ~: do
      runRecord fizzBuzz (run [Edited (at 0) "f", Pressed Character]) @?= Nothing

  , "failures pair each failed test's call with what the Solution returned" ~: do
      let rs = [pass, failWith, pass, pass]
      failedTests fizzBuzz (Results rs)
        @?= [("fizzBuzz(10)", "\"Buzz\"", "\"3\"")]

  , "the check request carries the code, the function name and the tests" ~: do
      let req = decode (LBS.fromStrict (T.encodeUtf8 (checkRequest fizzBuzz "let x"))) :: Maybe Value
      fmap keys req @?= Just ["code", "fn", "tests"]

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
