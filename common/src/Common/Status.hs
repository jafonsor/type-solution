{-# LANGUAGE NoOverloadedLists #-}
-- | The status line below the editor: what the Run is doing, in words.
module Common.Status
  ( statusText
  , secondsText
  ) where

import Data.Text (Text)
import Data.Text qualified as T
import Numeric (showFFloat)
import Data.Time (NominalDiffTime)

import Common.Run

-- | The status line for the Run.
statusText :: Run -> Text
statusText r = case r.phase of
  NotStarted -> "Start typing: the clock starts on your first keystroke."
  Typing -> ""
  Checking -> "checking…"
  Checked -> case r.outcome of
    Just (Results rs) -> tshow (length (filter (.passed) rs)) <> "/" <> tshow (length rs) <> " tests pass"
    Just (SyntaxError _) -> "doesn't parse yet"
    Just (Crashed _) -> "crashed"
    Just TimedOut -> "timed out"
    Nothing -> ""
  Paused -> "Paused. Esc to carry on."
  Skipped -> "Skipped."
  Passed -> case (r.finishedAt, wordsPerMinute r) of
    (Just f, Just w) -> "Passed in " <> secondsText (elapsed f r) <> ", " <> tshow (round w :: Int)
      <> " wpm, " <> plural r.backspaces "backspace" <> "."
    (Just f, Nothing) -> "Passed in " <> secondsText (elapsed f r) <> "."
    (Nothing, _) -> "Passed."

-- | A time as the page shows it, e.g. @12.3 s@.
secondsText :: NominalDiffTime -> Text
secondsText t = T.pack (showFFloat (Just 1) (realToFrac t :: Double) "") <> " s"

plural :: Int -> Text -> Text
plural n w = tshow n <> " " <> w <> (if n == 1 then "" else "s")

tshow :: Show a => a -> Text
tshow = T.pack . show
