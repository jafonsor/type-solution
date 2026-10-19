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
import Data.Text (Text)
import Data.Text qualified as T
import Data.Time (NominalDiffTime, getCurrentTime)
import Language.Javascript.JSaddle (MonadJSM, liftJSM)
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

-- | How long a check may run before it counts as a timeout.
checkTimeout :: NominalDiffTime
checkTimeout = 1

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
     -- ^ URL of the test-runner worker script.
  -> m ()
runWidget workerUrl = mdo
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
    elClass "h1" "signature" $ dynText ((.signature) <$> dPuzzle)
    elClass "p" "prompt" $ dynText ((.prompt) <$> dPuzzle)

  (box, _) <- elClass' "div" "editor" blank
  (eCode, fireCode) <- newTriggerEvent
  (eEscape, fireEscape) <- newTriggerEvent
  (eReply, fireReply) <- newTriggerEvent
  (eKey, fireKey) <- newTriggerEvent
  editor <- liftJSM $ createEditor (_element_raw box)
    (liftIO . fireCode) (liftIO (fireEscape ())) (\t k -> liftIO (fireKey (Pressed t k)))
  checker <- newChecker
  -- The editor is built before it's on the page, so it's focused once it
  -- is: the player can start typing straight away.
  eBuilt <- delay 0 =<< getPostBuild
  performEvent_ (liftJSM (focusEditor editor) <$ eBuilt)

  -- The editor is read-only while the menu is open, so edits come only
  -- while it's closed; the Run would ignore any others anyway.
  let eTyped = gate (not . menuOpen <$> current dRun) eCode
      -- Checks are for a Run under way, paused or not.
      underWay r = r.phase `notElem` [NotStarted, Skipped, Passed]

  -- Every edit stops the check in flight; a pause in typing starts a new one.
  eEdited <- performEvent $ ffor eTyped \src -> do
    liftJSM (stopCheck checker)
    t <- liftIO getCurrentTime
    pure [Edited t src]
  eQuiet <- debounce quietBeforeCheck eTyped
  eCheck <- zipListWithEvent (,) [1 :: Int ..] $
    attachWith (,) (current dPuzzle) (gate (underWay <$> current dRun) eQuiet)

  -- Code that doesn't parse fails at once; the rest goes to a worker.
  eStarted <- performEvent $ ffor eCheck \(n, (puzzle, src)) -> liftJSM do
    syntaxError src >>= \case
      Just msg -> do
        t <- liftIO getCurrentTime
        pure (n, False, [CheckStarted n, CheckFinished t n (SyntaxError msg)])
      Nothing -> do
        startCheck checker workerUrl (checkRequest puzzle src) \reply ->
          liftIO (fireReply (n, reply))
        pure (n, True, [CheckStarted n])

  eFinished <- performEvent $ ffor eReply \(n, reply) -> do
    liftJSM (stopCheck checker)
    t <- liftIO getCurrentTime
    pure [CheckFinished t n (parseReply reply)]

  -- A check still awaited when its time is up is stopped and times out.
  eDeadline <- delay checkTimeout $ fmapMaybe
    (\(n, toWorker, _) -> if toWorker then Just n else Nothing) eStarted
  let eOverdue = attachWithMaybe
        (\r n -> if r.awaiting == Just n then Just n else Nothing)
        (current dRun) eDeadline
  eTimedOut <- performEvent $ ffor eOverdue \n -> do
    liftJSM (stopCheck checker)
    t <- liftIO getCurrentTime
    pure [CheckFinished t n TimedOut]

  -- Esc skips, pauses or carries on; the Run decides which. A check in
  -- flight keeps running: its outcome still counts.
  eEscaped <- performEvent $ ffor eEscape \_ -> do
    t <- liftIO getCurrentTime
    pure [Escaped t]

  -- Either menu button starts a new Run with an empty editor.
  ePuzzle <- performEvent $ ffor (attach (current dPuzzle) eChoice) \(p, choice) -> liftJSM do
    stopCheck checker
    setDoc editor ""
    case choice of
      Repeat -> pure p
      NewRandom -> randomPuzzle <$> random

  dRun <- foldDyn (\es r -> foldl (flip step) r es) newRun $ mergeWith (<>)
    [ eEdited, (\(_, _, es) -> es) <$> eStarted, eFinished, eTimedOut, eEscaped
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
  Just TimedOut -> elClass "div" "failure" $
    text ("Stopped after " <> secondsText checkTimeout <> ": an infinite loop?")
  Nothing -> blank
