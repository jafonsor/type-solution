{-# LANGUAGE NoOverloadedLists #-}
-- | The JavaScript seam: the CodeMirror shim (static/editor, loaded as
-- @window.TypeSolution@), which holds the Languages, and JavaScript's
-- test-runner worker (static/src/js/runner.js).
-- Reflex sees only document text, the Escape key, the key presses a Run
-- counts (with their times), the worker's replies and the stored Runs (as
-- JSON text). Storage is reached only through the shim; nothing goes over
-- the network.
module Frontend.Js
  ( Language (..)
  , initialLanguage
  , languages
  , Editor
  , createEditor
  , setDoc
  , setReadOnly
  , setLanguage
  , nextLanguage
  , setErrors
  , setUnderlines
  , underlinesOn
  , watchLoading
  , retryLoading
  , resetEditor
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
  , canWarmUp
  , warmUp
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
  deriving newtype (Eq)

-- | The Language the page opens in: the one remembered in this browser, read
-- once at page load, else JavaScript. A remembered Language that has a bundle
-- starts downloading it here.
initialLanguage :: JSM Language
initialLanguage = Language <$> ((jsg ("TypeSolution" :: Text) # ("initialLanguage" :: Text) $ ()) >>= fromJSValUnchecked)

-- | Every Language the shim knows, in the dropdown's order, with the title the
-- player sees: @(name, title)@. The dropdown is built from this list.
languages :: JSM [(Language, Text)]
languages = do
  pairs <- (jsg ("TypeSolution" :: Text) # ("languages" :: Text) $ ()) >>= fromJSValUnchecked
  pure [ (Language n, t) | [n, t] <- pairs ]

newtype Editor = Editor JSVal

-- | Mount an editor in the element. The callbacks get the whole document on
-- every change the player makes, the Escape key (pressed anywhere on the
-- page), each key press a Run counts with its time, and Alt+L (answer it
-- with 'nextLanguage' and 'setLanguage'). It opens in the shim's current
-- Language ('initialLanguage').
createEditor :: Element -> (Text -> JSM ()) -> JSM () -> (Millis -> Key -> JSM ()) -> JSM () -> JSM Editor
createEditor parent onChange onEscape onKey onCycle = do
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
  cycled <- function \_ _ _ -> onCycle
  Editor <$> (jsg ("TypeSolution" :: Text) # ("createEditor" :: Text) $ (unElement parent, changed, escaped, pressed, cycled))

-- | Replace the document, without calling the change callback.
setDoc :: Editor -> Text -> JSM ()
setDoc (Editor e) t = void $ e # ("setDoc" :: Text) $ [t]

-- | Pick a Language: the editor keeps the draft of the one it leaves, shows
-- the picked one's (empty if never typed in), and the shim remembers the
-- choice and starts the Language's bundle download the first time. Returns
-- the text now shown. Nothing changes while the editor is read-only.
setLanguage :: Editor -> Language -> JSM Text
setLanguage (Editor e) (Language name) = (e # ("setLanguage" :: Text) $ [name]) >>= fromJSValUnchecked

-- | The Language Alt+L would pick: the one after the current, wrapping round.
nextLanguage :: Editor -> JSM Language
nextLanguage (Editor e) = Language <$> ((e # ("nextLanguage" :: Text) $ ()) >>= fromJSValUnchecked)

-- | Underline these ranges (document offsets, @(from, to)@) under the text: a
-- finished check's errors. The next edit, or a Language switch, clears them.
-- With the underlines option off they are kept but not drawn.
setErrors :: Editor -> [(Int, Int)] -> JSM ()
setErrors (Editor e) ranges = void $ e # ("setErrors" :: Text) $ [[ [from, to] | (from, to) <- ranges ]]

-- | The "Show error underlines" option: kept in this browser
-- (@type-solution.options@) and applied at once.
setUnderlines :: Editor -> Bool -> JSM ()
setUnderlines (Editor e) on = void $ e # ("setUnderlines" :: Text) $ [on]

-- | The option as it is now (on unless the player turned it off).
underlinesOn :: Editor -> JSM Bool
underlinesOn (Editor e) = (e # ("underlines" :: Text) $ ()) >>= fromJSValUnchecked

-- | Hear about each Language's download: @(name, state, percent)@ with the
-- state @"loading"@, @"ready"@ or @"failed"@ and the percent a whole number
-- while loading, @-1@ when there is none. Told at once of what has begun.
watchLoading :: (Text -> Text -> Int -> JSM ()) -> JSM ()
watchLoading onChange = do
  changed <- function \_ _ args -> case args of
    [a, b, c] -> do
      name <- fromJSValUnchecked a
      state <- fromJSValUnchecked b
      percent <- fromJSValUnchecked c
      onChange name state percent
    _ -> pure ()
  void $ jsg ("TypeSolution" :: Text) # ("watchLoading" :: Text) $ [changed]

-- | Try a Language's failed download again.
retryLoading :: Language -> JSM ()
retryLoading (Language name) = void $ jsg ("TypeSolution" :: Text) # ("retryLoading" :: Text) $ [name]

-- | A new Run: every Language's draft goes and the editor is empty.
resetEditor :: Editor -> JSM ()
resetEditor (Editor e) = void $ e # ("reset" :: Text) $ ()

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

-- | Whether the Language's Checker can get ready for a Puzzle ahead of its
-- first check (the Language's @canWarmUp@ in static/editor/src/languages.mjs).
-- Asked first so that a Language without one (JavaScript) gets no Checker made
-- just to be warmed up.
canWarmUp :: Language -> JSM Bool
canWarmUp (Language name) =
  (jsg ("TypeSolution" :: Text) # ("canWarmUp" :: Text) $ [name]) >>= fromJSValUnchecked

-- | Hand the Checker a Puzzle's Reference Solution, as a check's request
-- ('Common.Run.checkRequest'), so it can prepare. It stays inside the
-- Checker: nothing is shown, nothing replies, and no Run event comes of it.
warmUp :: Checker -> Text -> JSM ()
warmUp (Checker pool _) request = void $ pool # ("warmUp" :: Text) $ [request]
