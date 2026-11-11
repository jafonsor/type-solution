{-# LANGUAGE NoOverloadedLists #-}
-- | The status line below the editor: what the Run is doing, in words.
module Common.Status
  ( statusText
  , statusHover
  , secondsText
  , Load (..)
  , loadText
  , loadShown
  ) where

import Data.Text (Text)
import Data.Text qualified as T
import Numeric (showFFloat)
import Data.Time (NominalDiffTime)

import Common.History
import Common.Puzzle
import Common.Run

-- | The status line for a Run on the Puzzle, given the history before it
-- (without the Run's own record). Only a pass line mentions the Personal
-- best; during a Run it's never shown.
statusText :: Puzzle -> History -> Run -> Text
statusText p h r = case r.phase of
  NotStarted -> "Start typing: the clock starts on your first keystroke."
  Typing -> ""
  Checking -> "checking…"
  Checked -> case r.outcome of
    Just (Results rs) -> tshow (length (filter (.passed) rs)) <> "/" <> tshow (length rs) <> " tests pass"
    Just (CompileError e) -> compileText e
    Just (Crashed _) -> "crashed"
    Just (TimedOut _) -> "timed out"
    Nothing -> ""
  Paused -> "Paused. Esc to carry on."
  Skipped -> "Skipped."
  Passed -> case (r.finishedAt, wordsPerMinute r) of
    (Just f, Just w) -> "Passed in " <> peekedTime r.hasPeeked (elapsed f r) <> ", " <> tshow (round w :: Int)
      <> " wpm, " <> plural (scoredBackspaces r) "backspace" <> ". " <> bestText f
    (Just f, Nothing) -> "Passed in " <> peekedTime r.hasPeeked (elapsed f r) <> ". " <> bestText f
    (Nothing, _) -> "Passed."
  where
    -- The Run's time as its record stores it, so it compares like with like.
    -- The Personal best is of the Language that passed.
    bestText f = case standing (scoringLanguage r) p.identity (realToFrac (elapsed f r)) h of
      FirstTime -> "First time on this Puzzle."
      NewBest was -> "New best (was " <> secondsText (secs was) <> (if was.peeked then ", peeked" else "") <> ")."
      NotBest best -> "Best: " <> peekedTime best.peeked (secs best) <> "."
    secs rr = realToFrac rr.duration

-- | The first error as one line: the verdict, where, and what.
compileText :: CompileProblem -> Text
compileText p = verdict <> ": line " <> tshow p.line <> ", column " <> tshow p.column <> ": " <> p.message
  where
    verdict = case p.kind of
      Syntax -> "doesn't parse yet"
      TypeCheck -> "doesn't type-check yet"

-- | What hovering the status line shows: every error in full, for a compile
-- error; nothing for any other line.
statusHover :: Run -> Text
statusHover r = case (r.phase, r.outcome) of
  (Checked, Just (CompileError p)) -> p.everything
  _ -> ""

-- | What a Language's download is doing, while it is not done.
data Load = Loading (Maybe Int) | LoadFailed
  deriving stock (Eq, Show)

-- | The status line while a Language's compiler downloads, given the
-- Language's title: with a percentage if there is one.
loadText :: Text -> Load -> Text
loadText title = \case
  Loading p -> "Loading " <> title <> " compiler…" <> maybe "" (\n -> " " <> tshow n <> "%") p
  LoadFailed -> "Could not load the " <> title <> " compiler."

-- | Whether the download takes the status line over: while the player is
-- typing or waiting for a check, not once the Run is Paused, Skipped or Passed
-- (those lines are about the Run, and the Run is not waiting on the download).
loadShown :: Run -> Bool
loadShown r = r.phase `elem` [NotStarted, Typing, Checking, Checked]

-- | A time with the plain word "peeked" after it when the Run peeked at the
-- Reference Solution; it is shown wherever the Run's time is.
peekedTime :: Bool -> NominalDiffTime -> Text
peekedTime wasPeeked t = secondsText t <> (if wasPeeked then " (peeked)" else "")

-- | A time as the page shows it, e.g. @12.3 s@.
secondsText :: NominalDiffTime -> Text
secondsText t = T.pack (showFFloat (Just 1) (realToFrac t :: Double) "") <> " s"

plural :: Int -> Text -> Text
plural n w = tshow n <> " " <> w <> (if n == 1 then "" else "s")

tshow :: Show a => a -> Text
tshow = T.pack . show
