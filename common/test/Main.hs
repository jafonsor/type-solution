module Main (main) where

import Control.Monad (unless)
import Data.Aeson (Value (..), decode, eitherDecode, encode)
import Data.Aeson.Key qualified as Key
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as LBS
import Data.Either (isLeft)
import Data.List (isInfixOf, sort)
import Data.List.NonEmpty qualified as NonEmpty
import Data.Text (Text)
import Data.Text qualified as T
import Data.Text.Encoding qualified as T
import Data.Time (UTCTime (..), addUTCTime, fromGregorian)
import System.Exit (exitFailure)
import Test.HUnit

import Common.Bank
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
        { puzzleIdentity = "fizzBuzz"
        , finishedAt = at 30
        , duration = 30
        , wpm = 10
        , backspaces = 1
        , solution = "function fizzBuzz"
        }

  , "a passed Run's record names the Puzzle by its identity, not its function" ~: do
      let p = fizzBuzz { identity = "fizzBuzzAgain" }
          r = run [Edited (at 0) "f", Pressed Character, Pressed Space, CheckStarted 1, CheckFinished (at 6) 1 allPass]
          rr = runRecord p r
      fmap (.puzzleIdentity) rr @?= Just "fizzBuzzAgain"
      case fmap (decode . encode) rr :: Maybe (Maybe Value) of
        Just (Just (Object o)) -> KeyMap.lookup "puzzle" o @?= Just (String "fizzBuzzAgain")
        other -> assertFailure ("expected a JSON object, got " <> show other)

  , "a record reads back what it writes" ~: do
      let rr = RunRecord
            { puzzleIdentity = "fizzBuzz", finishedAt = at 30, duration = 29.5
            , wpm = 41.25, backspaces = 3, solution = "function fizzBuzz(n) {}" }
      eitherDecode (encode rr) @?= Right rr

  , "a record stored before Puzzles had an identity still reads" ~: do
      let old = "{\"backspaces\":2,\"finishedAt\":\"2026-10-17T21:14:03.512Z\",\"puzzle\":\"fizzBuzz\",\"seconds\":24.731,\"solution\":\"function fizzBuzz(n) {\\n  return n;\\n}\",\"wordsPerMinute\":38.81}"
      eitherDecode old @?= Right RunRecord
        { puzzleIdentity = "fizzBuzz"
        , finishedAt = UTCTime (fromGregorian 2026 10 17) (21 * 3600 + 14 * 60 + 3.512)
        , duration = 24.731
        , wpm = 38.81
        , backspaces = 2
        , solution = "function fizzBuzz(n) {\n  return n;\n}"
        }

  , "the bank's fizzBuzz is the fizzBuzz Puzzle the game has always played" ~: do
      lookupPuzzle "fizzBuzz" @?= Just fizzBuzz

  , "the bank is sorted by identity, with no identity twice" ~: do
      let ids = map (.identity) (NonEmpty.toList bank)
      ids @?= sort ids
      length ids @?= length (NonEmpty.nub (NonEmpty.fromList ids))

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
