{-# LANGUAGE NoOverloadedLists #-}
-- | The JavaScript seam: the CodeMirror shim (static/editor, loaded as
-- @window.TypeSolution@) and the test-runner worker (static/src/js/runner.js).
-- Reflex sees only document text, the Escape key and the worker's replies.
module Frontend.Js
  ( Editor
  , createEditor
  , setDoc
  , setReadOnly
  , focusEditor
  , focusElement
  , setHidden
  , random
  , syntaxError
  , saveRun
  , Checker
  , newChecker
  , startCheck
  , stopCheck
  ) where

import Control.Monad (forM_, void)
import Control.Monad.IO.Class (MonadIO, liftIO)
import Data.IORef (IORef, atomicModifyIORef', newIORef, writeIORef)
import Data.Text (Text)
import GHCJS.DOM.Types (Element (..))
import Language.Javascript.JSaddle

import Common.Run (Key (..))

newtype Editor = Editor JSVal

-- | Mount an editor in the element. The callbacks get the whole document on
-- every change the player makes, the Escape key (pressed anywhere on the
-- page), and each key press a Run counts.
createEditor :: Element -> (Text -> JSM ()) -> JSM () -> (Key -> JSM ()) -> JSM Editor
createEditor parent onChange onEscape onKey = do
  changed <- function \_ _ args -> forM_ (take 1 args) \a ->
    fromJSValUnchecked a >>= onChange
  escaped <- function \_ _ _ -> onEscape
  pressed <- function \_ _ args -> forM_ (take 1 args) \a ->
    fromJSValUnchecked a >>= \case
      ("character" :: Text) -> onKey Character
      "space" -> onKey Space
      "enter" -> onKey Enter
      "backspace" -> onKey Backspace
      _ -> pure ()
  Editor <$> (jsg ("TypeSolution" :: Text) # ("createEditor" :: Text) $ (unElement parent, changed, escaped, pressed))

-- | Replace the document, without calling the change callback.
setDoc :: Editor -> Text -> JSM ()
setDoc (Editor e) t = void $ e # ("setDoc" :: Text) $ [t]

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

-- | The JavaScript parser's message if the code doesn't parse.
syntaxError :: Text -> JSM (Maybe Text)
syntaxError code = do
  r <- jsg ("TypeSolution" :: Text) # ("syntaxError" :: Text) $ [code]
  maybeNullOrUndefined r >>= traverse fromJSValUnchecked

-- | Keep a finished Run (as JSON) in the browser's storage.
saveRun :: Text -> JSM ()
saveRun json = void $ jsg ("TypeSolution" :: Text) # ("saveRun" :: Text) $ [json]

-- | The check in flight: its worker and the callback the worker replies to.
newtype Checker = Checker (IORef (Maybe (JSVal, Function)))

newChecker :: MonadIO m => m Checker
newChecker = Checker <$> liftIO (newIORef Nothing)

-- | Start a fresh worker from the script at the URL, send it the request,
-- and pass its reply on. Any check still in flight is stopped first.
startCheck :: Checker -> Text -> Text -> (Text -> JSM ()) -> JSM ()
startCheck c@(Checker ref) url request onReply = do
  stopCheck c
  opts <- obj
  (opts <# ("type" :: Text)) ("module" :: Text)
  worker <- new (jsg ("Worker" :: Text)) (url, opts)
  replied <- function \_ _ args -> forM_ (take 1 args) \e ->
    (e ! ("data" :: Text)) >>= fromJSValUnchecked >>= onReply
  (worker <# ("onmessage" :: Text)) replied
  void $ worker # ("postMessage" :: Text) $ [request]
  liftIO $ writeIORef ref (Just (worker, replied))

-- | Terminate the check in flight, if any.
stopCheck :: Checker -> JSM ()
stopCheck (Checker ref) = do
  current <- liftIO $ atomicModifyIORef' ref (Nothing,)
  forM_ current \(worker, replied) -> do
    void $ worker # ("terminate" :: Text) $ ()
    freeFunction replied
