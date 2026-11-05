import Prelude
import Data.Array (head)

clamp :: Int -> Int -> Int -> Int
clamp value lo hi
  | value < lo = lo
  | value > hi = hi
  | otherwise = value
