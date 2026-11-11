{-# LANGUAGE NoOverloadedLists #-}
-- | The Runs in the browser: the Puzzle, the editor, the checks that run the
-- Solution against the Puzzle's tests whenever the player stops typing, the
-- menu that starts the next Run, the hint that shows the Reference Solution,
-- and the weak-key lists. The Run's logic is 'Common.Run'; this module turns
-- the page's events into its events and draws the result.
module Frontend.Run
  ( runWidget
  ) where

import Control.Monad (forM, forM_, when)
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
  (eLoad, fireLoad) <- newTriggerEvent
  editor <- liftJSM $ createEditor (_element_raw box)
    (liftIO . fireCode) (liftIO (fireEscape ())) (\t k -> liftIO (fireKey (Pressed t k)))
    (liftIO (fireCycle ()))
  -- What each Language's download is doing, from the shim: the status line
  -- says so while it is not done.
  liftJSM $ watchLoading \n s p -> liftIO (fireLoad (n, s, p))
  dLoad <- foldDyn (\(n, s, p) -> Map.alter (const (loadOf s p)) n) Map.empty eLoad
  -- The underlines option, as the page opens.
  underlinesNow <- liftJSM (underlinesOn editor)
  -- One Checker per Language, made when first used and kept (it may hold a
  -- worker); a check goes to the Checker of the Language it was typed in.
  checkers <- liftIO (newIORef Map.empty)
  let checkerFor l = cachedChecker checkers workerUrl l

  -- The thin bar under the editor: the hoverable "?" that shows the
  -- Reference Solution (ADR 0001), and the Language dropdown at its right
  -- edge. Alt+L from the editor cycles it too.
  (eChosen, eHint) <- elClass "div" "editor-bar" do
    eHint' <- referenceHint (referenceText <$> dLanguage <*> dPuzzle)
    elClass "span" "hint" $ text "Alt+L"
    d <- dropdown (languageName initial) (constDyn (Map.fromList [ (n, t) | (Language n, t) <- available ]))
      DropdownConfig
        { _dropdownConfig_setValue = languageName <$> eCycled
        , _dropdownConfig_attributes = ffor dMenuOpen \open ->
            "aria-label" =: "Language" <> (if open then "disabled" =: "" else mempty)
        }
    pure (Language <$> _dropdown_change d, eHint')

  -- A pick, from the dropdown or Alt+L (not while the menu is open and the
  -- editor read-only): the editor keeps the old draft and shows the new
  -- Language's. The clock isn't touched, and nor is a check under way for
  -- the Language left: whichever Solution passes first ends the Run (L3).
  eCycled <- performEvent $ liftJSM (nextLanguage editor) <$ gate (not . menuOpen <$> current dRun) eCycle
  let eLanguage = gate (not . menuOpen <$> current dRun) (leftmost [eChosen, eCycled])
      eChange = attachWithMaybe (\old new -> if old == new then Nothing else Just (old, new))
        (current dLanguage) eLanguage
  eSwitched <- performEvent $ ffor eChange \(_, new) -> liftJSM do
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
  -- A check is of the draft of the Language it was typed in, 400 ms after
  -- that Language's last edit, whichever Language is shown by then (so a
  -- draft that would pass in the last 400 ms before a switch is still
  -- checked). Landing on a draft that has text starts one for that draft.
  let eToCheck = leftmost
        [ attachWith (,) (current dLanguage) eTyped
        , fmapMaybe (\(l, draft) -> if T.null (T.strip draft) then Nothing else Just (l, draft)) eSwitched
        ]
  -- Each Language waits out its own pause in typing, so typing in one never
  -- swallows another's pending check.
  eQuiet <- fmap leftmost $ forM available \(l, _) ->
    debounce quietBeforeCheck (ffilter ((== l) . fst) eToCheck)
  -- Only a draft that is still the Run's draft: a new Run, or typing since,
  -- has made an older one stale.
  eCheck <- zipListWithEvent (,) [1 :: Int ..] $
    attachWithMaybe
      (\(p, r) (l, src) -> if underWay r && draftOf (languageName l) r == src then Just (p, l, src) else Nothing)
      ((,) <$> current dPuzzle <*> current dRun) eQuiet

  -- The Language's Checker does the rest: parsing, running, and its own
  -- timeouts. A newer check or an edit makes an older reply never arrive.
  eStarted <- performEvent $ ffor eCheck \(n, (puzzle, l, src)) -> liftJSM do
    c <- checkerFor l
    startCheck c (checkRequest puzzle src) \reply ->
      liftIO (fireReply (n, l, reply))
    pure [CheckStarted n (languageName l)]

  -- A finished check's errors are underlined, if it was of the draft shown
  -- (the shim clears them on the next edit).
  performEvent_ $ ffor (attach (current dLanguage) eReply) \(current', (_, l, reply)) ->
    liftJSM $ setErrors editor (if l == current' then underlineRanges (parseReply reply) else [])

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
  ePuzzle <- performEvent $ ffor (attach (current dPuzzle) eChoice) \(p, choice) -> liftJSM do
    -- Every Language's check under way was of the Run that ends here.
    mapM_ stopCheck . Map.elems =<< liftIO (readIORef checkers)
    resetEditor editor
    case choice of
      Repeat -> pure p
      NewRandom -> randomPuzzle <$> random

  -- A Language's Checker may use the quiet while the page loads and while a
  -- Puzzle opens to get ready (static/editor/src/languages.mjs, "canWarmUp"):
  -- once at load, for each new Puzzle and when the Language shown changes, and
  -- only for the Language shown. It is given the Reference Solution inside the
  -- Checker; the page shows nothing of it, and no Run event comes of it.
  let warm l p = liftJSM do
        can <- canWarmUp l
        when can do
          c <- checkerFor l
          warmUp c (checkRequest p (referenceText l p))
  eBuilt <- getPostBuild
  performEvent_ $ warm initial firstPuzzle <$ eBuilt
  performEvent_ $ ffor (attach (current dLanguage) ePuzzle) (uncurry warm)
  performEvent_ $ ffor (attach (current dPuzzle) eSwitched) \(p, (l, _)) -> warm l p

  -- The hint open for about a second marks the Run peeked; the Run works
  -- that out from when it opened and closed.
  eHinted <- performEvent $ ffor eHint \opened -> do
    t <- liftIO getCurrentTime
    pure [if opened then HintOpened t else HintClosed t]

  dRun <- foldDyn (\es r -> foldl (flip step) r es) (newRunIn (languageName initial)) $ mergeWith (<>)
    [ eEdited, eStarted, eFinished, eEscaped, eHinted
    , (\(l, draft) -> [CodeSwapped (languageName l) draft]) <$> eSwitched
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

  -- While the shown Language's compiler downloads (or failed to), that is
  -- the line; otherwise what the Run is doing. Hovering it shows every
  -- error in full.
  let titles = Map.fromList [ (n, t) | (Language n, t) <- available ]
      dLoadShown = (\l loads r -> if loadShown r then Map.lookup (languageName l) loads else Nothing)
        <$> dLanguage <*> dLoad <*> dRun
      dLine = (\l p h r ld -> case ld of
                  Just st -> loadText (Map.findWithDefault (languageName l) (languageName l) titles) st
                  Nothing -> statusText p h r)
        <$> dLanguage <*> dPuzzle <*> dHistoryBefore <*> dRun <*> dLoadShown
      dHover = (\r ld -> if ld == Nothing then statusHover r else "") <$> dRun <*> dLoadShown
  eRetry <- elClass "div" "status" do
    elClass "span" "clock" $ dynText (secondsText <$> dElapsed)
    elDynAttr "span" (ffor dHover \t -> "class" =: "phase" <> (if T.null t then mempty else "title" =: t)) $ dynText dLine
    switchHold never =<< dyn (ffor dLoadShown \case
      Just LoadFailed -> do
        (b, _) <- elAttr' "button" ("type" =: "button" <> "class" =: "retry") $ text "Retry"
        pure (domEvent Click b)
      _ -> pure never)
  performEvent_ $ liftJSM . retryLoading <$> tag (current dLanguage) eRetry

  (eChoice, firstButton, menuBox, eUnderlines) <- menu underlinesNow
  performEvent_ $ liftJSM . setUnderlines editor <$> eUnderlines

  -- Opening the menu freezes the editor and focuses the first button;
  -- closing it hands the focus back to the editor.
  dMenuOpen <- holdUniqDyn (menuOpen <$> dRun)
  performEvent_ $ ffor (updated dMenuOpen) \open -> liftJSM do
    setHidden menuBox (not open)
    setReadOnly editor open
    if open then focusElement firstButton else focusEditor editor

  elClass "div" "feedback" $ dyn_ (feedback <$> dPuzzle <*> dRun)

  -- The weak-key lists are of the Language shown, from the history, which
  -- gains a passed Run's record in the frame it passes, so they refresh
  -- straight away.
  elClass "footer" "weak-keys" do
    weakKeyLine "Most missed" (mostMissed . languageName <$> dLanguage <*> dHistory) \n ->
      T.pack (show n) <> (if n == 1 then " Correction" else " Corrections")
    weakKeyLine "Slowest" (slowest . languageName <$> dLanguage <*> dHistory) \ms ->
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

-- | The hoverable @?@ in the bar under the editor: while the mouse is over it
-- (or its tooltip) the Reference Solution of the Language shown appears
-- (ADR 0001, drawn by CSS). Gives when the mouse enters (@True@) and leaves
-- (@False@); the Run decides whether that was a Peek.
referenceHint
  :: (DomBuilder t m, DomBuilderSpace m ~ GhcjsDomSpace, PostBuild t m)
  => Dynamic t Text -> m (Event t Bool)
referenceHint dText = do
  (box, _) <- elAttr' "div" ("class" =: "reference-hint" <> "aria-label" =: "Reference Solution, on hover") do
    text "?"
    elAttr "pre" ("class" =: "reference-tip" <> "role" =: "tooltip") $ dynText dText
  pure (leftmost [True <$ domEvent Mouseenter box, False <$ domEvent Mouseleave box])

-- | The Puzzle's Reference Solution in the Language, for the hint. Empty for
-- a Language the Puzzle file format doesn't know.
referenceText :: Language -> Puzzle -> Text
referenceText l p = maybe "" (.reference) (languageTable (languageName l) p)

-- | The Puzzle's signature in the Language: the lines the player types
-- first. Empty for a Language the Puzzle file format doesn't know.
signatureText :: Language -> Puzzle -> Text
signatureText l p = maybe "" (.signature) (languageTable (languageName l) p)

-- | The Language's name, as the shim's registry and the Puzzle file know it.
languageName :: Language -> Text
languageName (Language n) = n

-- | A download state from the shim, or nothing once it is done.
loadOf :: Text -> Int -> Maybe Load
loadOf state percent = case state of
  "loading" -> Just (Loading (if percent >= 0 then Just percent else Nothing))
  "failed" -> Just LoadFailed
  _ -> Nothing

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

-- | The menu, hidden until the Run opens it: its two buttons, then the "Show
-- error underlines" checkbox (a native one: Tab reaches it after the buttons
-- and Space flips it). Gives the choice, the first button (to focus), the
-- menu's element and the checkbox's changes.
menu
  :: (DomBuilder t m, DomBuilderSpace m ~ GhcjsDomSpace, PostBuild t m)
  => Bool -> m (Event t Choice, RawElement GhcjsDomSpace, RawElement GhcjsDomSpace, Event t Bool)
menu underlinesInitially = do
  (box, (eNew, newEl, eRepeat, eUnderlines)) <- elAttr' "div" ("class" =: "menu" <> "hidden" =: "") do
    (n, _) <- iconButton "New random Puzzle" skipNextIcon
    (r, _) <- iconButton "Repeat Puzzle" repeatIcon
    cb <- elClass "label" "option" do
      c <- inputElement (checkboxConfig underlinesInitially)
      text "Show error underlines"
      pure c
    pure (domEvent Click n, _element_raw n, domEvent Click r, _inputElement_checkedChange cb)
  pure (leftmost [NewRandom <$ eNew, Repeat <$ eRepeat], newEl, _element_raw box, eUnderlines)
  where
    iconButton name = elAttr' "button"
      ("type" =: "button" <> "title" =: name <> "aria-label" =: name)

-- | A checkbox, checked or not to begin with.
checkboxConfig :: forall t. Reflex t => Bool -> InputElementConfig EventResult t GhcjsDomSpace
checkboxConfig on = (def :: InputElementConfig EventResult t GhcjsDomSpace)
  { _inputElementConfig_initialChecked = on
  , _inputElementConfig_elementConfig =
      (def :: ElementConfig EventResult t GhcjsDomSpace) { _elementConfig_initialAttributes = "type" =: "checkbox" }
  }

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
  Just (Results _) -> forM_ (maybe [] (failedTests puzzle) r.outcome) \(input, want, actual) ->
    elClass "div" "failure" do
      elClass "code" "call" $ text input
      text " → "
      elClass "code" "expected" $ text want
      text ", got "
      elClass "code" "got" $ text actual
  -- A compile error is on the status line (and its hover), and underlined.
  Just (CompileError _) -> blank
  Just (Crashed msg) -> elClass "div" "failure" $ text msg
  Just (TimedOut msg) -> elClass "div" "failure" $ text msg
  Nothing -> blank
