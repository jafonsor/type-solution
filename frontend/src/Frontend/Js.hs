{-# LANGUAGE NoOverloadedLists #-}
-- | The JavaScript seam: the CodeMirror shim (static/editor, loaded as
-- @window.TypeSolution@), which holds the Languages, and JavaScript's
-- test-runner worker (static/src/js/runner.js).
-- Reflex sees only document text, the Escape key, the key presses a Run
-- counts (with their times), the worker's replies and the stored Runs (as
-- JSON text). Storage is reached only through the shim; nothing goes over
-- the network.
module Frontend.Js
  ( Language
  , javascript
  , Editor
  , createEditor
  , setDoc
  , setReadOnly
  , setLanguage
  , focusEditor
  , focusElement
  , setHidden
  , random
  , saveRun
  , loadRuns
  , Checker
  , newChecker
  , startCheck
  , stopCheck
  ) where

import Control.Monad (forM_, void)
import Control.Monad.IO.Class (liftIO)
import Data.IORef (IORef, atomicModifyIORef', newIORef, writeIORef)
import Data.Text (Text)
import Data.Text qualified as T
import GHCJS.DOM.Types (Element (..))
import Language.Javascript.JSaddle

import Common.Run (Key, Millis, keyFromChar)

-- | A Language by name, as the shim's registry knows it (static/editor/src/
-- languages.mjs). The shim holds everything Language-specific: the editor's
-- mode and the Checker.
newtype Language = Language Text

javascript :: Language
javascript = Language "javascript"

newtype Editor = Editor JSVal

-- | Mount an editor in the element. The callbacks get the whole document on
-- every change the player makes, the Escape key (pressed anywhere on the
-- page), and each key press a Run counts with its time. The Language gives
-- the editor its mode.
createEditor :: Element -> (Text -> JSM ()) -> JSM () -> (Millis -> Key -> JSM ()) -> Language -> JSM Editor
createEditor parent onChange onEscape onKey (Language name) = do
  changed <- function \_ _ args -> forM_ (take 1 args) \a ->
    fromJSValUnchecked a >>= onChange
  escaped <- function \_ _ _ -> onEscape
  -- The shim sends the key as one character (see 'keyFromChar') and the
  -- keydown event's timeStamp.
  pressed <- function \_ _ args -> case args of
    a : b : _ -> do
      k <- fromJSValUnchecked a
      t <- fromJSValUnchecked b
      case T.unpack k of
        [c] -> onKey t (keyFromChar c)
        _ -> pure ()
    _ -> pure ()
  Editor <$> (jsg ("TypeSolution" :: Text) # ("createEditor" :: Text) $ (unElement parent, changed, escaped, pressed, name))

-- | Replace the document, without calling the change callback.
setDoc :: Editor -> Text -> JSM ()
setDoc (Editor e) t = void $ e # ("setDoc" :: Text) $ [t]

-- | Swap the editor's mode for the Language's; text and history stay.
setLanguage :: Editor -> Language -> JSM ()
setLanguage (Editor e) (Language name) = void $ e # ("setLanguage" :: Text) $ [name]

-- | Read-only: the editor takes no typing and Tab moves the focus on.
setReadOnly :: Editor -> Bool -> JSM ()
setReadOnly (Editor e) b = void $ e # ("setReadOnly" :: Text) $ [b]

focusEditor :: Editor -> JSM ()
focusEditor (Editor e) = void $ e # ("focus" :: Text) $ ()

focusElement :: Element -> JSM ()
focusElement el = void $ jsg ("TypeSolution" :: Text) # ("focus" :: Text) $ [unElement el]

-- | Hide the element, or show it again.
setHidden :: Element -> Bool -> JSM ()
setHidden el b = void $ unElement el # ("toggleAttribute" :: Text) $ (("hidden" :: Text), b)

-- | A random number in [0, 1), from the browser.
random :: JSM Double
random = (jsg ("TypeSolution" :: Text) # ("random" :: Text) $ ()) >>= fromJSValUnchecked

-- | Keep a finished Run (as JSON) in the browser's storage.
saveRun :: Text -> JSM ()
saveRun json = void $ jsg ("TypeSolution" :: Text) # ("saveRun" :: Text) $ [json]

-- | Every Run kept in the browser's storage, as the JSON text it holds
-- ("[]" if none, or if storage can't be read). Read it with
-- 'Common.History.decodeRecords'.
loadRuns :: JSM Text
loadRuns = (jsg ("TypeSolution" :: Text) # ("loadRuns" :: Text) $ ()) >>= fromJSValUnchecked

-- | The Language's Checker (static/editor/src/run-check.mjs): the callback
-- the check in flight replies to. Parsing, workers and timeouts are the
-- Language's own.
data Checker = Checker JSVal (IORef (Maybe Function))

-- | The Checker for the Language, given the URL of its runner script.
newChecker :: Text -> Language -> JSM Checker
newChecker url (Language name) = do
  pool <- jsg ("TypeSolution" :: Text) # ("createChecker" :: Text) $ (url, name)
  Checker pool <$> liftIO (newIORef Nothing)

-- | Run the request and pass its reply on (see 'Common.Run.parseReply').
-- Any check still in flight is stopped first.
startCheck :: Checker -> Text -> (Text -> JSM ()) -> JSM ()
startCheck c@(Checker pool ref) request onReply = do
  stopCheck c
  replied <- function \_ _ args -> forM_ (take 1 args) \a ->
    fromJSValUnchecked a >>= onReply
  void $ pool # ("start" :: Text) $ (request, replied)
  liftIO $ writeIORef ref (Just replied)

-- | Stop the check in flight, if any; it never replies.
stopCheck :: Checker -> JSM ()
stopCheck (Checker pool ref) = do
  current <- liftIO $ atomicModifyIORef' ref (Nothing,)
  forM_ current \replied -> do
    void $ pool # ("stop" :: Text) $ ()
    freeFunction replied
