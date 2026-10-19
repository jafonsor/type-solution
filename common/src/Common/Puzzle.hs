-- | A Puzzle: a small programming problem shown to the player, with the
-- hidden tests that decide whether a Solution is correct. Each Puzzle is a
-- TOML file in the repo's @puzzles@ folder, read in when the app is built;
-- "Common.Bank" holds them all.
module Common.Puzzle
  ( Puzzle (..)
  , PuzzleTest (..)
  , callText
  , valueText
    -- * Puzzle files
  , parsePuzzle
  , parseBank
  , embedBank
  ) where

import Control.Monad (forM, forM_)
import Data.Aeson (Value (..))
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString qualified as BS
import Data.ByteString.Lazy qualified as LBS
import Data.List (sort)
import Data.List.NonEmpty (NonEmpty (..))
import Data.Scientific (fromFloatDigits)
import Data.Text (Text)
import Data.Text qualified as T
import Data.Text.Encoding qualified as T
import Language.Haskell.TH.Syntax (Exp, Lift, Q, addDependentFile, getPackageRoot, lift, runIO)
import System.Directory (listDirectory)
import System.FilePath (takeExtension, dropExtension, (</>))
import Toml qualified
import Toml.Schema qualified as Toml

data Puzzle = Puzzle
  { identity :: Text
    -- ^ Which Puzzle this is: its file's name without @.toml@. Runs are
    -- recorded under it. Two Puzzles may share a function name, never this.
  , function :: Text
    -- ^ The name the Solution must define, and the tests call.
  , signature :: Text
  , prompt :: Text
  , reference :: Text
    -- ^ The Reference Solution, which proves the tests can be passed. It
    -- travels in the bundle but is never shown (Design Contract I1).
  , tests :: [PuzzleTest]
    -- ^ Never shown, but a failed one may be described by 'callText'.
  }
  deriving stock (Eq, Show, Lift)

-- | One hidden test: call the function with these arguments and expect this
-- result. Values are JSON, as the test-runner worker is JavaScript.
data PuzzleTest = PuzzleTest
  { args :: [Value]
  , expected :: Value
  }
  deriving stock (Eq, Show, Lift)

-- | How a test's call reads, e.g. @fizzBuzz(10)@.
callText :: Puzzle -> PuzzleTest -> Text
callText p t = p.function <> "(" <> T.intercalate ", " (map valueText t.args) <> ")"

-- | A value as JavaScript would write it.
valueText :: Value -> Text
valueText = T.decodeUtf8 . LBS.toStrict . Aeson.encode

-- * Puzzle files

-- | Reads a Puzzle file, given its identity and its TOML text. A missing
-- key, an unknown one or a value of the wrong type is an error.
parsePuzzle :: Text -> Text -> Either String Puzzle
parsePuzzle ident src = case Toml.decode src of
  Toml.Success [] (PuzzleFile p) -> Right (p ident)
  Toml.Success ws _ -> Left (unlines ws)
  Toml.Failure es -> Left (unlines es)

-- | Reads every Puzzle file, given each one's name (e.g. @fizzBuzz.toml@)
-- and text, into the bank, sorted by identity. Errors name their file.
parseBank :: [(FilePath, Text)] -> Either String (NonEmpty Puzzle)
parseBank files = do
  ps <- forM (sort files) \(name, src) ->
    case parsePuzzle (T.pack (dropExtension name)) src of
      Right p -> Right p
      Left e -> Left ("Puzzle file " <> name <> " is malformed:\n" <> unlines (map ("  " <>) (lines e)))
  case ps of
    p : rest -> Right (p :| rest)
    [] -> Left "There are no Puzzle files."

-- | A Template Haskell splice: reads every @.toml@ file in the repo's
-- @puzzles@ folder and embeds the bank, a @NonEmpty Puzzle@. A file that
-- doesn't parse stops the build. Editing a file rebuilds the splice; a new
-- file is seen once the splice's module recompiles (see "Common.Bank").
embedBank :: Q Exp
embedBank = do
  root <- getPackageRoot
  let dir = root </> ".." </> "puzzles"
  names <- filter ((== ".toml") . takeExtension) <$> runIO (listDirectory dir)
  forM_ names (addDependentFile . (dir </>))
  files <- runIO $ forM names \name ->
    (,) name . T.decodeUtf8 <$> BS.readFile (dir </> name)
  either fail lift (parseBank files)

-- | A Puzzle file's contents: all of a Puzzle but its identity.
newtype PuzzleFile = PuzzleFile (Text -> Puzzle)

instance Toml.FromValue PuzzleFile where
  fromValue = Toml.parseTableFromValue do
    f <- Toml.reqKey "function"
    s <- Toml.reqKey "signature"
    p <- Toml.reqKey "prompt"
    r <- Toml.reqKey "reference"
    ts <- Toml.reqKeyOf "tests" (Toml.listOf \_ -> Toml.parseTableFromValue puzzleTest)
    pure $ PuzzleFile \i -> Puzzle
      { identity = i, function = f, signature = s, prompt = p, reference = r, tests = ts }
    where
      puzzleTest = PuzzleTest
        <$> Toml.reqKeyOf "args" (Toml.listOf \_ -> json)
        <*> Toml.reqKeyOf "expected" json

-- | A TOML value as JSON. TOML has no @null@; JSON has no dates.
json :: Toml.Value' l -> Toml.Matcher l Value
json = \case
  Toml.Integer' _ n -> pure (Number (fromInteger n))
  Toml.Double' a d
    | isNaN d || isInfinite d -> Toml.failAt a "JSON has no NaN or infinity"
    | otherwise -> pure (Number (fromFloatDigits d))
  Toml.Bool' _ b -> pure (Bool b)
  Toml.Text' _ t -> pure (String t)
  v@(Toml.List' _ _) -> Aeson.toJSON <$> Toml.listOf (\_ -> json) v
  Toml.Table' _ (Toml.MkTable m) -> Object . KeyMap.fromMapText <$> traverse (json . snd) m
  v -> Toml.failAt (Toml.valueAnn v) "dates and times aren't JSON values"
