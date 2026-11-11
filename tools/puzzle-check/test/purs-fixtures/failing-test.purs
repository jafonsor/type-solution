import Prelude

clamp :: Int -> Int -> Int -> Int
clamp value lo hi
  | value < lo = lo
  | value > hi = 0
  | otherwise = value
