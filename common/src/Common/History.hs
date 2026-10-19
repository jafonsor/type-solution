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
  , mostMissed
  , slowest
  ) where

import Data.Aeson (Value, fromJSON)
import Data.Aeson qualified as Aeson
import Data.List (sort, sortOn)
import Data.Map.Strict (Map)
import Data.Map.Strict qualified as Map
import Data.Maybe (mapMaybe)
import Data.Ord (Down (..))
import Data.Text (Text)
import Data.Text.Encoding qualified as T

import Common.Run

-- | The records of every passed Run, oldest first. Built once from the
-- records the page reads, then kept up to date as Runs pass; the questions
-- asked of it ('personalBest', 'mostMissed', 'slowest') are functions on it.
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

-- * The weak-key lists

-- | Most missed: the five characters with the most Corrections, most first,
-- each with its count. A Correction is a character typed straight after a
-- run of exactly one or two Backspaces; three or more in a row is a rewrite
-- and counts for nothing. A character with no Corrections isn't listed.
-- Of two with the same count, the lower character (by code point) first.
-- See 'weakKeyRuns' for which Runs count and 'listed' for which characters.
mostMissed :: History -> [(Char, Int)]
mostMissed h = topFive $ listed h $
  Map.fromListWith (+) [(c, 1) | ps <- weakKeyRuns h, c <- corrections ps]

-- | Slowest: the five characters with the highest median Hesitation, slowest
-- first, each with that median in milliseconds. Hesitation is a press's time
-- since the previous press; each Run's first press, and any gap over 1.5 s
-- (thinking, or a Pause), are left out. A character typed straight after a
-- Backspace counts like any other: finding the right key is what Hesitation
-- measures. The median of an even number of gaps is the mean of the two
-- middle ones. Of two with the same median, the lower character first.
slowest :: History -> [(Char, Double)]
slowest h = topFive $ listed h $ Map.map median $
  Map.fromListWith (<>) [(c, [g]) | ps <- weakKeyRuns h, (c, g) <- hesitations ps]

-- | The key presses of the Runs the lists look at: the last 20 passed Runs
-- that still have key presses. Records without them (stored before Runs
-- kept them, or stripped to make room) are skipped and don't use up one of
-- the 20.
weakKeyRuns :: History -> [[KeyPress]]
weakKeyRuns (History rs) = takeEnd 20 (filter (not . null) (map (.keyPresses) rs))
  where takeEnd n xs = drop (length xs - n) xs

-- | Keeps only the characters typed at least 10 times in those Runs (every
-- press of the character, Corrections included). Space, Enter, Tab and
-- Backspace aren't characters, so they never appear; @A@ and @a@ are
-- different characters.
listed :: History -> Map Char a -> Map Char a
listed h m = Map.restrictKeys m (Map.keysSet (Map.filter (>= 10) typed))
  where
    typed = Map.fromListWith (+) [(c, 1 :: Int) | ps <- weakKeyRuns h, KeyPress { key = Character c } <- ps]

-- | Worst first, then by character; five at most.
topFive :: Ord a => Map Char a -> [(Char, a)]
topFive = take 5 . sortOn (\(c, v) -> (Down v, c)) . Map.toList

-- | The characters each Correction in one Run was aiming for, in order.
corrections :: [KeyPress] -> [Char]
corrections = go 0
  where
    go :: Int -> [KeyPress] -> [Char]
    go _ [] = []
    go n (kp : rest) = case kp.key of
      Backspace -> go (n + 1) rest
      Character c | n == 1 || n == 2 -> c : go 0 rest
      _ -> go 0 rest

-- | Each character press in one Run with its Hesitation in milliseconds,
-- leaving out the Run's first press and gaps over 1.5 s.
hesitations :: [KeyPress] -> [(Char, Int)]
hesitations ps = [(c, kp.sincePrevious) | kp@KeyPress { key = Character c } <- drop 1 ps, kp.sincePrevious <= 1500]

-- | The middle value; for an even count, the mean of the two middle ones.
-- Never given an empty list ('Map.fromListWith' builds each from one gap up).
median :: [Int] -> Double
median gs = case drop ((n - 1) `div` 2) (sort gs) of
  a : b : _ | even n -> (fromIntegral a + fromIntegral b) / 2
  a : _ -> fromIntegral a
  [] -> 0
  where n = length gs
