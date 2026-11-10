{-# LANGUAGE NoOverloadedLists #-}
-- | The Runs in the browser: the Puzzle, the editor, the checks that run the
-- Solution against the Puzzle's tests whenever the player stops typing, the
-- menu that starts the next Run, and the weak-key lists. The Run's logic is 'Common.Run'; this
-- module turns the page's events into its events and draws the result.
module Frontend.Run
  ( runWidget
  ) where

import Control.Monad (forM_)
import Control.Monad.Fix (MonadFix)
import Control.Monad.IO.Class (liftIO)
import Data.IORef (IORef, atomicModifyIORef', newIORef, readIORef)
import Data.Map.Strict qualified as Map
import Data.Text (Text)
import Data.Text qualified as T
import Data.Time (NominalDiffTime, getCurrentTime)
import Language.Javascript.JSaddle (JSM, MonadJSM, liftJSM)
import Reflex.Dom.Core

import Common.Bank (randomPuzzle)
import Common.History
import Common.Puzzle
import Common.Run hiding (Event)
import Common.Status
import Frontend.Js

-- | How long typing must stop before the Solution is checked.
quietBeforeCheck :: NominalDiffTime
quietBeforeCheck = 0.4

runWidget
  :: ( DomBuilder t m
     , DomBuilderSpace m ~ GhcjsDomSpace
     , PostBuild t m
     , MonadHold t m
     , MonadFix m
     , PerformEvent t m
     , TriggerEvent t m
     , MonadJSM m
     , MonadJSM (Performable m)
     )
  => Text
     -- ^ URL of JavaScript's test-runner worker script. Each Language's
     -- Checker is made the first time it's needed.
  -> m ()
runWidget workerUrl = mdo
  -- The Language the page opens in (the one remembered in this browser) and
  -- the list the dropdown offers; both come from the shim's registry.
  initial <- liftJSM initialLanguage
  available <- liftJSM languages
  dLanguage <- holdDyn initial eLanguage
  -- The first Puzzle is picked here, in the browser, so each visit differs.
  firstPuzzle <- liftJSM (randomPuzzle <$> random)
  dPuzzle <- holdDyn firstPuzzle ePuzzle

  -- The history: the Runs stored in this browser when the page loaded, plus
  -- each Run passed since (whether or not storage could keep it). The status
  -- line compares a Run with the history as it was when the Run began, so a
  -- pass never compares with its own record.
  stored <- liftJSM (decodeRecords <$> loadRuns)
  dHistory <- foldDyn addRecord (history stored) eRecord
  dHistoryBefore <- holdDyn (history stored) (tag (current dHistory) ePuzzle)

  elClass "header" "puzzle" do
    elClass "h1" "signature" $ dynText (signatureText <$> dLanguage <*> dPuzzle)
    elClass "p" "prompt" $ dynText ((.prompt) <$> dPuzzle)

  (box, _) <- elClass' "div" "editor" blank
  (eCode, fireCode) <- newTriggerEvent
  (eCycle, fireCycle) <- newTriggerEvent
  (eEscape, fireEscape) <- newTriggerEvent
  (eReply, fireReply) <- newTriggerEvent
  (eKey, fireKey) <- newTriggerEvent
  editor <- liftJSM $ createEditor (_element_raw box)
    (liftIO . fireCode) (liftIO (fireEscape ())) (\t k -> liftIO (fireKey (Pressed t k)))
    (liftIO (fireCycle ()))
  -- One Checker per Language, made when first used and kept (it may hold a
  -- worker); a check goes to the Checker of the Language it was typed in.
  checkers <- liftIO (newIORef Map.empty)
  let checkerFor l = cachedChecker checkers workerUrl l

  -- The thin bar under the editor: the Language dropdown at its right edge.
  -- Alt+L from the editor cycles it too.
  eChosen <- elClass "div" "editor-bar" do
    elClass "span" "hint" $ text "Alt+L"
    d <- dropdown (languageName initial) (constDyn (Map.fromList [ (n, t) | (Language n, t) <- available ]))
      DropdownConfig
        { _dropdownConfig_setValue = languageName <$> eCycled
        , _dropdownConfig_attributes = ffor dMenuOpen \open ->
            "aria-label" =: "Language" <> (if open then "disabled" =: "" else mempty)
        }
    pure (Language <$> _dropdown_change d)

  -- A pick, from the dropdown or Alt+L (not while the menu is open and the
  -- editor read-only): the editor keeps the old draft and shows the new
  -- Language's. The check in flight, which was of the old Language's code,
  -- is stopped. The clock isn't touched.
  eCycled <- performEvent $ liftJSM (nextLanguage editor) <$ gate (not . menuOpen <$> current dRun) eCycle
  let eLanguage = gate (not . menuOpen <$> current dRun) (leftmost [eChosen, eCycled])
      eChange = attachWithMaybe (\old new -> if old == new then Nothing else Just (old, new))
        (current dLanguage) eLanguage
  eSwitched <- performEvent $ ffor eChange \(old, new) -> liftJSM do
    stopCheck =<< checkerFor old
    draft <- setLanguage editor new
    pure (new, draft)

  -- The editor is read-only while the menu is open, so edits come only
  -- while it's closed; the Run would ignore any others anyway.
  let eTyped = gate (not . menuOpen <$> current dRun) eCode
      -- Checks are for a Run under way, paused or not.
      underWay r = r.phase `notElem` [NotStarted, Skipped, Passed]

  -- Every edit stops the check in flight; a pause in typing starts a new one.
  eEdited <- performEvent $ ffor (attach (current dLanguage) eTyped) \(l, src) -> do
    liftJSM (stopCheck =<< checkerFor l)
    t <- liftIO getCurrentTime
    pure [Edited t src]
  -- A check is for the Language its code was typed in: one still waiting
  -- when the player switches Language is dropped (below). Landing on a draft
  -- that has text starts one for that draft.
  let eToCheck = leftmost
        [ attachWith (,) (current dLanguage) eTyped
        , fmapMaybe (\(l, draft) -> if T.null (T.strip draft) then Nothing else Just (l, draft)) eSwitched
        ]
  eQuiet <- debounce quietBeforeCheck eToCheck
  eCheck <- zipListWithEvent (,) [1 :: Int ..] $
    attachWithMaybe
      (\(p, current', r) (l, src) -> if l == current' && underWay r then Just (p, l, src) else Nothing)
      ((,,) <$> current dPuzzle <*> current dLanguage <*> current dRun) eQuiet

  -- The Language's Checker does the rest: parsing, running, and its own
  -- timeouts. A newer check or an edit makes an older reply never arrive.
  eStarted <- performEvent $ ffor eCheck \(n, (puzzle, l, src)) -> liftJSM do
    c <- checkerFor l
    startCheck c (checkRequest puzzle src) \reply ->
      liftIO (fireReply (n, l, reply))
    pure [CheckStarted n]

  eFinished <- performEvent $ ffor eReply \(n, l, reply) -> do
    liftJSM (stopCheck =<< checkerFor l)
    t <- liftIO getCurrentTime
    pure [CheckFinished t n (parseReply reply)]

  -- Esc skips, pauses or carries on; the Run decides which. A check in
  -- flight keeps running: its outcome still counts.
  eEscaped <- performEvent $ ffor eEscape \_ -> do
    t <- liftIO getCurrentTime
    pure [Escaped t]

  -- Either menu button starts a new Run with an empty editor.
  ePuzzle <- performEvent $ ffor (attach ((,) <$> current dPuzzle <*> current dLanguage) eChoice) \((p, l), choice) -> liftJSM do
    stopCheck =<< checkerFor l
    resetEditor editor
    case choice of
      Repeat -> pure p
      NewRandom -> randomPuzzle <$> random

  dRun <- foldDyn (\es r -> foldl (flip step) r es) newRun $ mergeWith (<>)
    [ eEdited, eStarted, eFinished, eEscaped
    , (\(_, draft) -> [CodeSwapped draft]) <$> eSwitched
    , [NewRunStarted] <$ ePuzzle, (: []) <$> eKey ]

  -- A Run that has just passed is kept in the browser; one given up isn't.
  let eRecord = attachWithMaybe
        (\(p, old) new -> recordOnStep p old new)
        ((,) <$> current dPuzzle <*> current dRun) (updated dRun)
  performEvent_ $ liftJSM . saveRun . recordText <$> eRecord

  -- The clock, ticking while the Run is under way.
  t0 <- liftIO getCurrentTime
  tick <- tickLossyFromPostBuildTime 0.1
  dNow <- holdDyn t0 (_tickInfo_lastUTC <$> tick)
  let dElapsed = zipDynWith elapsed dNow dRun

  elClass "div" "status" do
    elClass "span" "clock" $ dynText (secondsText <$> dElapsed)
    elClass "span" "phase" $ dynText (statusText <$> dPuzzle <*> dHistoryBefore <*> dRun)

  (eChoice, firstButton, menuBox) <- menu

  -- Opening the menu freezes the editor and focuses the first button;
  -- closing it hands the focus back to the editor.
  dMenuOpen <- holdUniqDyn (menuOpen <$> dRun)
  performEvent_ $ ffor (updated dMenuOpen) \open -> liftJSM do
    setHidden menuBox (not open)
    setReadOnly editor open
    if open then focusElement firstButton else focusEditor editor

  elClass "div" "feedback" $ dyn_ (feedback <$> dPuzzle <*> dRun)

  -- The weak-key lists come from the history, which gains a passed Run's
  -- record in the frame it passes, so they refresh straight away.
  elClass "footer" "weak-keys" do
    weakKeyLine "Most missed" (mostMissed <$> dHistory) \n ->
      T.pack (show n) <> (if n == 1 then " Correction" else " Corrections")
    weakKeyLine "Slowest" (slowest <$> dHistory) \ms ->
      "Median Hesitation " <> T.pack (show (round ms :: Int)) <> " ms"

-- | One weak-key list: its label, then each character in a chip of its own
-- (so a lone @,@ or @.@ is easy to see), its score in the chip's tooltip.
-- A dash until some character has enough data. The line's height is fixed,
-- so filling it moves nothing.
weakKeyLine
  :: (DomBuilder t m, PostBuild t m, MonadHold t m, MonadFix m, Eq a)
  => Text -> Dynamic t [(Char, a)] -> (a -> Text) -> m ()
weakKeyLine label dKeys describe = elClass "p" "weak-key-line" do
  elClass "span" "label" $ text (label <> ":")
  dUniq <- holdUniqDyn dKeys
  dyn_ $ ffor dUniq \case
    [] -> elAttr "span" ("class" =: "none" <> "title" =: "Not enough typed yet") $ text "—"
    ks -> forM_ ks \(c, score) -> elAttr "kbd" ("title" =: describe score) $ text (T.singleton c)

-- | The Puzzle's signature in the Language: the lines the player types
-- first. Empty for a Language the Puzzle file format doesn't know.
signatureText :: Language -> Puzzle -> Text
signatureText l p = maybe "" (.signature) (languageTable (languageName l) p)

-- | The Language's name, as the shim's registry and the Puzzle file know it.
languageName :: Language -> Text
languageName (Language n) = n

-- | The Language's Checker, made on first use and then kept.
cachedChecker :: IORef (Map.Map Text Checker) -> Text -> Language -> JSM Checker
cachedChecker ref url l = do
  known <- liftIO (Map.lookup (languageName l) <$> readIORef ref)
  case known of
    Just c -> pure c
    Nothing -> do
      c <- newChecker url l
      liftIO (atomicModifyIORef' ref \m -> (Map.insert (languageName l) c m, ()))
      pure c

data Choice = NewRandom | Repeat

-- | The menu's two buttons, hidden until the Run opens it.
menu
  :: (DomBuilder t m, DomBuilderSpace m ~ GhcjsDomSpace, PostBuild t m)
  => m (Event t Choice, RawElement GhcjsDomSpace, RawElement GhcjsDomSpace)
menu = do
  (box, (eNew, newEl, eRepeat)) <- elAttr' "div" ("class" =: "menu" <> "hidden" =: "") do
    (n, _) <- iconButton "New random Puzzle" skipNextIcon
    (r, _) <- iconButton "Repeat Puzzle" repeatIcon
    pure (domEvent Click n, _element_raw n, domEvent Click r)
  pure (leftmost [NewRandom <$ eNew, Repeat <$ eRepeat], newEl, _element_raw box)
  where
    iconButton name = elAttr' "button"
      ("type" =: "button" <> "title" =: name <> "aria-label" =: name)

-- | "Skip next": a play triangle against a bar.
skipNextIcon :: (DomBuilder t m, PostBuild t m) => m ()
skipNextIcon = icon do
  svg "path" [("d", "M6 5.5 L15 12 L6 18.5 Z"), ("fill", "currentColor")]
  svg "rect" [("x", "16"), ("y", "5.5"), ("width", "2.5"), ("height", "13"), ("fill", "currentColor")]

-- | "Repeat": a circle of arrow going round.
repeatIcon :: (DomBuilder t m, PostBuild t m) => m ()
repeatIcon = icon do
  let stroke = [ ("fill", "none"), ("stroke", "currentColor"), ("stroke-width", "2")
               , ("stroke-linecap", "round"), ("stroke-linejoin", "round") ]
  svg "path" (("d", "M19 12 A7 7 0 1 1 16.95 7.05") : stroke)
  svg "path" (("d", "M12.95 7.05 H16.95 V3.05") : stroke)

icon :: (DomBuilder t m, PostBuild t m) => m () -> m ()
icon = elDynAttrNS (Just svgNS) "svg" (constDyn
  ("viewBox" =: "0 0 24 24" <> "width" =: "20" <> "height" =: "20" <> "aria-hidden" =: "true"))

svg :: (DomBuilder t m, PostBuild t m) => Text -> [(Text, Text)] -> m ()
svg name attrs = elDynAttrNS (Just svgNS) name (constDyn (foldMap (uncurry (=:)) attrs)) blank

svgNS :: Text
svgNS = "http://www.w3.org/2000/svg"

-- | Why the last check failed: each failed test with what the Solution
-- returned, or the error that stopped the tests from running. Shown during
-- a Pause too, as a check may finish then.
feedback :: DomBuilder t m => Puzzle -> Run -> m ()
feedback puzzle r = case r.outcome of
  _ | r.phase == Passed -> blank
  Just (Results _) -> forM_ (maybe [] (failedTests puzzle) r.outcome) \(call, want, actual) ->
    elClass "div" "failure" do
      elClass "code" "call" $ text call
      text " should return "
      elClass "code" "expected" $ text want
      text ", got "
      elClass "code" "got" $ text actual
  Just (SyntaxError msg) -> elClass "div" "failure" $ text ("Syntax error: " <> msg)
  Just (Crashed msg) -> elClass "div" "failure" $ text msg
  Just (TimedOut msg) -> elClass "div" "failure" $ text msg
  Nothing -> blank
