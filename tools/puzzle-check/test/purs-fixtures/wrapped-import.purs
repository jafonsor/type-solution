import Prelude
import Data.Ord (
  min, max)

clamp :: Int -> Int -> Int -> Int
clamp value lo hi = min hi (max lo value)
