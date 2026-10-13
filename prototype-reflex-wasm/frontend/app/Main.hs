{-# LANGUAGE CPP #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE LambdaCase #-}

import Data.Text qualified as T
import Reflex.Dom

main :: IO ()
main = mainWidget $ do
  el "h1" $ text "reflex-dom on wasm, built on macOS"

  el "section" $ do
    click <- button "+1"
    clicks <- foldDyn (+) (0 :: Int) (1 <$ click)
    el "p" $ text "Clicks: " >> dynText (T.pack . show <$> clicks)

  el "section" $ do
    input <- inputElement def
    let typed = _inputElement_value input
    el "p" $ text "Echo: " >> dynText typed
    el "p" $ text "Length: " >> dynText (T.pack . show . T.length <$> typed)

  el "section" $ do
    flip_ <- button "toggle"
    shown <- foldDyn (const not) False flip_
    dyn_ $ ffor shown $ \case
      True -> elAttr "p" ("id" =: "shown") $ text "dyn_ swapped me in"
      False -> blank

#if defined(wasm32_HOST_ARCH)
foreign export javascript "hs_start" main :: IO ()
#endif
