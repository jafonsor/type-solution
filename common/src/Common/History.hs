{-# LANGUAGE NoOverloadedLists #-}
-- | The player's history: the records of the Runs passed in this browser,
-- and what they say. Everything here is worked out from the records each
-- time; nothing is stored apart from them, so it can't drift.
module Common.History
  ( History
  , history
  , addRecord
  , decodeRecords
  , personalBest
  , Standing (..)
  , standing
  ) where

import Data.Aeson (Value, fromJSON)
import Data.Aeson qualified as Aeson
import Data.Maybe (mapMaybe)
import Data.Text (Text)
import Data.Text.Encoding qualified as T

import Common.Run

-- | The records of every passed Run, oldest first. Built once from the
-- records the page reads, then kept up to date as Runs pass; the questions
-- asked of it ('personalBest', and the weak-key lists to come) are
-- functions on it.
newtype History = History [RunRecord]
  deriving stock (Eq, Show)

-- | The history of these records, oldest first (as the browser stores them).
history :: [RunRecord] -> History
history = History

-- | The history with one more record, the newest.
addRecord :: RunRecord -> History -> History
addRecord rr (History rs) = History (rs <> [rr])

-- | The records in the JSON text the browser's storage holds: a list of
-- records, in any format this game has written. A record that doesn't read
-- is skipped on its own, never losing the rest; text that isn't a JSON list
-- gives no records.
decodeRecords :: Text -> [RunRecord]
decodeRecords txt = case Aeson.decodeStrict (T.encodeUtf8 txt) :: Maybe [Value] of
  Just vs -> mapMaybe (resultToMaybe . fromJSON) vs
  Nothing -> []
  where
    resultToMaybe = \case
      Aeson.Success a -> Just a
      Aeson.Error _ -> Nothing

-- | The Personal best on the Puzzle with this identity: its fastest passed
-- Run, whose words per minute and Backspaces go with it. Of two equally
-- fast, the earlier. Records of other Puzzles don't count.
personalBest :: Text -> History -> Maybe RunRecord
personalBest i (History rs) = foldl faster Nothing (filter ((== i) . (.puzzleIdentity)) rs)
  where
    faster Nothing r = Just r
    faster (Just b) r = Just (if r.duration < b.duration then r else b)

-- | How a passed Run's time compares with the Personal best before it.
data Standing
  = FirstTime
    -- ^ No earlier passed Run on the Puzzle.
  | NewBest Double
    -- ^ Faster than every earlier one; the old best's seconds.
  | NotBest Double
    -- ^ As fast as the best or slower; the best's seconds. A tie isn't a
    -- new best: it doesn't beat the time to beat.
  deriving stock (Eq, Show)

-- | How a time in seconds on the Puzzle with this identity compares with
-- the history, which must not hold the Run itself yet. Compares the stored
-- seconds, not the times as shown to a tenth.
standing :: Text -> Double -> History -> Standing
standing i seconds h = case personalBest i h of
  Nothing -> FirstTime
  Just b
    | seconds < b.duration -> NewBest b.duration
    | otherwise -> NotBest b.duration
