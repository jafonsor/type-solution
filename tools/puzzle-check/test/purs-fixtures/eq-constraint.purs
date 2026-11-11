import Prelude

same :: forall a. Eq a => a -> a -> Boolean
same x y = x == y
