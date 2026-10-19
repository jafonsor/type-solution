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
  ) where

import Data.List (find)
import Data.List.NonEmpty (NonEmpty)
import Data.Text (Text)

import Common.Puzzle

-- | Every Puzzle, sorted by identity.
bank :: NonEmpty Puzzle
bank = $(embedBank)

-- | The Puzzle with this identity, if the bank has one.
lookupPuzzle :: Text -> Maybe Puzzle
lookupPuzzle i = find ((== i) . (.identity)) bank
