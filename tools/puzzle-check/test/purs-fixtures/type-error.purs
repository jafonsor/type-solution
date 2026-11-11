import Prelude

clamp :: Int -> Int -> Int -> Int
clamp value lo hi
  | value < lo = "x"
  | value > hi = hi
  | otherwise = value
