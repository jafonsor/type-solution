-- | A Puzzle: a small programming problem shown to the player, with the
-- hidden tests that decide whether a Solution is correct.
module Common.Puzzle
  ( Puzzle (..)
  , PuzzleTest (..)
  , callText
  , valueText
  , fizzBuzz
  ) where

import Data.Aeson (Value (..))
import Data.Aeson qualified as Aeson
import Data.ByteString.Lazy qualified as LBS
import Data.Text (Text)
import Data.Text qualified as T
import Data.Text.Encoding qualified as T

data Puzzle = Puzzle
  { function :: Text
    -- ^ The name the Solution must define, and the tests call.
  , signature :: Text
  , prompt :: Text
  , tests :: [PuzzleTest]
  }
  deriving stock (Eq, Show)

-- | One hidden test: call the function with these arguments and expect this
-- result. Values are JSON, as the test-runner worker is JavaScript.
data PuzzleTest = PuzzleTest
  { args :: [Value]
  , expected :: Value
  }
  deriving stock (Eq, Show)

-- | How a test's call reads, e.g. @fizzBuzz(10)@.
callText :: Puzzle -> PuzzleTest -> Text
callText p t = p.function <> "(" <> T.intercalate ", " (map valueText t.args) <> ")"

-- | A value as JavaScript would write it.
valueText :: Value -> Text
valueText = T.decodeUtf8 . LBS.toStrict . Aeson.encode

fizzBuzz :: Puzzle
fizzBuzz = Puzzle
  { function = "fizzBuzz"
  , signature = "fizzBuzz(n)"
  , prompt = "Return \"Fizz\" for multiples of 3, \"Buzz\" for multiples of 5, \"FizzBuzz\" for both, otherwise the number as a string."
  , tests =
      [ PuzzleTest { args = [Number 3], expected = String "Fizz" }
      , PuzzleTest { args = [Number 10], expected = String "Buzz" }
      , PuzzleTest { args = [Number 30], expected = String "FizzBuzz" }
      , PuzzleTest { args = [Number 7], expected = String "7" }
      ]
  }
