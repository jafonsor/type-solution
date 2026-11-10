module Frontend where

import Obelisk.Frontend
import Obelisk.Generated.Static
import Obelisk.Route
import Obelisk.Route.Frontend
import Reflex.Dom

import Common.Route
import Frontend.Run (runWidget)



frontend :: Frontend (R FrontendRoute)
frontend = Frontend
  { _frontend_head = frontendHead
  , _frontend_body = frontendBody
  }

frontendHead :: ObeliskWidget t route m => RoutedT t route m ()
frontendHead = do
  el "title" $ text "Type Solution"
  elAttr "meta" ("name" =: "viewport" <> "content" =: "width=device-width, initial-scale=1") blank
  elAttr "link" ("rel" =: "stylesheet" <> "href" =: static @"css/app.css") blank
  -- The CodeMirror shim, which the Run's editor needs before it mounts.
  elAttr "script" ("src" =: static @"js/editor.js") blank

-- | The exported page shows "Loading…"; the Runs, on a Puzzle picked at
-- random, start once the app runs in the browser.
frontendBody :: ObeliskWidget t (R FrontendRoute) m => RoutedT t (R FrontendRoute) m ()
frontendBody = elClass "main" "run" $
  prerender_ (el "p" $ text "Loading…") $
    runWidget (static @"js/runner.js")
