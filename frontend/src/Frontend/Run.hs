{-# LANGUAGE NoOverloadedLists #-}
-- | One Run in the browser: the Puzzle, the editor, and the checks that run
-- the Solution against the Puzzle's tests whenever the player pauses. The
-- Run's logic is 'Common.Run'; this module turns the page's events into its
-- events and draws the result.
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
import Numeric (showFFloat)
import Reflex.Dom.Core

import Common.Puzzle
import Common.Run
import Frontend.Js

-- | How long typing must pause before the Solution is checked.
pauseBeforeCheck :: NominalDiffTime
pauseBeforeCheck = 0.4

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
  -> Puzzle
  -> m ()
runWidget workerUrl puzzle = mdo
  elClass "header" "puzzle" do
    elClass "h1" "signature" $ text puzzle.signature
    elClass "p" "prompt" $ text puzzle.prompt

  (box, _) <- elClass' "div" "editor" blank
  (eCode, fireCode) <- newTriggerEvent
  (eEscape, fireEscape) <- newTriggerEvent
  (eReply, fireReply) <- newTriggerEvent
  editor <- liftJSM $ createEditor (_element_raw box) (liftIO . fireCode) (liftIO (fireEscape ()))
  checker <- newChecker

  let notPassed = (/= Passed) . (.phase) <$> current dRun

  -- Every edit stops the check in flight; a pause starts a new one.
  eEdited <- performEvent $ ffor (gate notPassed eCode) \_ -> do
    liftJSM (stopCheck checker)
    t <- liftIO getCurrentTime
    pure [Edited t]
  ePause <- debounce pauseBeforeCheck (gate notPassed eCode)
  eCheck <- zipListWithEvent (,) [1 :: Int ..] ePause

  -- Code that doesn't parse fails at once; the rest goes to a worker.
  eStarted <- performEvent $ ffor eCheck \(n, code) -> liftJSM do
    syntaxError code >>= \case
      Just msg -> do
        t <- liftIO getCurrentTime
        pure (n, False, [CheckStarted n, CheckFinished t n (SyntaxError msg)])
      Nothing -> do
        startCheck checker workerUrl (checkRequest puzzle code) \reply ->
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

  -- Escape starts the Run over.
  eRestarted <- performEvent $ ffor eEscape \_ -> liftJSM do
    stopCheck checker
    setDoc editor ""
    pure [Restarted]

  dRun <- foldDyn (\es r -> foldl (flip step) r es) newRun $ mergeWith (<>)
    [eEdited, (\(_, _, es) -> es) <$> eStarted, eFinished, eTimedOut, eRestarted]

  -- The clock, ticking while the Run is under way.
  t0 <- liftIO getCurrentTime
  tick <- tickLossyFromPostBuildTime 0.1
  dNow <- holdDyn t0 (_tickInfo_lastUTC <$> tick)
  let dElapsed = zipDynWith elapsed dNow dRun

  elClass "div" "status" do
    elClass "span" "clock" $ dynText (seconds <$> dElapsed)
    elClass "span" "phase" $ dynText (statusText <$> dRun <*> dElapsed)

  elClass "div" "feedback" $ dyn_ (feedback puzzle <$> dRun)

statusText :: Run -> NominalDiffTime -> Text
statusText r t = case r.phase of
  NotStarted -> "Start typing: the clock starts on your first keystroke."
  Typing -> ""
  Checking -> "checking…"
  Checked -> case r.outcome of
    Just (Results rs) -> tshow (length (filter (.passed) rs)) <> "/" <> tshow (length rs) <> " tests pass"
    Just (SyntaxError _) -> "doesn't parse yet"
    Just (Crashed _) -> "crashed"
    Just TimedOut -> "timed out"
    Nothing -> ""
  Passed -> "Passed in " <> seconds t <> ". Press Esc for another Run."

-- | Why the last check failed: each failed test with what the Solution
-- returned, or the error that stopped the tests from running.
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
    text ("Stopped after " <> seconds checkTimeout <> ": an infinite loop?")
  Nothing -> blank

seconds :: NominalDiffTime -> Text
seconds t = T.pack (showFFloat (Just 1) (realToFrac t :: Double) "") <> " s"

tshow :: Show a => a -> Text
tshow = T.pack . show
