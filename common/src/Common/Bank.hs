{-# OPTIONS_GHC -fforce-recomp #-}
-- | The Puzzle bank: every Puzzle file in the repo's @puzzles@ folder, read
-- in when the app is built.
--
-- This module always recompiles (@-fforce-recomp@), as GHC can't watch a
-- folder: it would notice an edited Puzzle file, but not a new one. It's
-- one small module; modules that use it only recompile when the bank
-- changes.
module Common.Bank
  ( bank
  , lookupPuzzle
  , randomPuzzle
  ) where

import Data.List (find)
import Data.List.NonEmpty (NonEmpty)
import Data.List.NonEmpty qualified as NonEmpty
import Data.Text (Text)

import Common.Puzzle

-- | Every Puzzle, sorted by identity.
bank :: NonEmpty Puzzle
bank = $(embedBank)

-- | The Puzzle with this identity, if the bank has one.
lookupPuzzle :: Text -> Maybe Puzzle
lookupPuzzle i = find ((== i) . (.identity)) bank

-- | The Puzzle a random number in [0, 1) picks, each as likely as any other:
-- 'Math.random' in the browser gives the number.
randomPuzzle :: Double -> Puzzle
randomPuzzle x = bank NonEmpty.!! max 0 (min (length bank - 1) (floor (x * fromIntegral (length bank))))
