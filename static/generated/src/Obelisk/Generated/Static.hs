{-# LANGUAGE AllowAmbiguousTypes #-}
{-# LANGUAGE DataKinds #-}
{-# LANGUAGE FlexibleInstances #-}
{-# LANGUAGE KindSignatures #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE ScopedTypeVariables #-}
{-# LANGUAGE TypeApplications #-}
module Obelisk.Generated.Static where

import qualified GHC.Types
import Data.Text (Text)
import qualified Data.Text.Internal
import Data.Monoid ((<>))

static :: forall a. StaticFile a => Text
static = "static/" <> staticPath @a

class StaticFile (s :: GHC.Types.Symbol)
    where {staticPath :: Data.Text.Internal.Text}
instance StaticFile "css/.keep"
    where {staticPath = "css/0mdqa9w1p6cmli6976v4wi0sw9r4p5prkj7lzfd1877wk11c9c73-.keep"}
instance StaticFile "css/app.css"
    where {staticPath = "css/1xj8yxqdf3v1npd8h029q6gpx2i2icdyhj09jw4i628fkwkc3d9f-app.css"}
instance StaticFile "html/.keep"
    where {staticPath = "html/0mdqa9w1p6cmli6976v4wi0sw9r4p5prkj7lzfd1877wk11c9c73-.keep"}
instance StaticFile "icons/.keep"
    where {staticPath = "icons/0mdqa9w1p6cmli6976v4wi0sw9r4p5prkj7lzfd1877wk11c9c73-.keep"}
instance StaticFile "images/.keep"
    where {staticPath = "images/0mdqa9w1p6cmli6976v4wi0sw9r4p5prkj7lzfd1877wk11c9c73-.keep"}
instance StaticFile "js/.keep"
    where {staticPath = "js/0mdqa9w1p6cmli6976v4wi0sw9r4p5prkj7lzfd1877wk11c9c73-.keep"}
instance StaticFile "js/editor.js"
    where {staticPath = "js/1dil943j9bcmgckfxx0sxmb6mfwx6hy09kl4ji08q7gvm8f8yk57-editor.js"}
instance StaticFile "js/runner.js"
    where {staticPath = "js/0ffcqjcm3pviidjvq34c0riaxdc6spdra1rjgw0j5yv2zn43h4wm-runner.js"}
