import Prelude

class Describe a where
  describe :: a -> String

instance Describe String where describe s = "text " <> s
instance Describe Int where describe n = "number " <> show n

label :: forall a. Describe a => a -> String
label x = describe x
