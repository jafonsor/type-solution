// The Run's side of the Checker seam: one Language's Checker, behind the
// request/reply text the Reflex frontend speaks. `language` is the current
// Language (any value with the four seams); nothing here knows which one.
//
// A request is JSON text {code, fn, tests: [{args, expected}]}; the reply
// is the Checker's result as JSON text. A check that a newer start() or a
// stop() has ended never replies, so an older result is ignored.
//
// warmUp(request) hands the Checker a Puzzle's Reference Solution, in the same
// request form, so it can get ready for the first real check (languages.mjs,
// "canWarmUp"). It never replies and never throws; a Checker without a warmUp
// (JavaScript's) does nothing.
export function createRunChecker(language, env) {
  const checker = language.createChecker(env);
  let current = 0;

  return {
    language,
    start(request, onReply) {
      const mine = ++current;
      const { code, fn, tests } = JSON.parse(request);
      checker.check(code, fn, tests).then(
        (result) => { if (mine === current) onReply(JSON.stringify(result)); },
        (err) => {
          if (mine !== current) return;
          onReply(JSON.stringify({ status: "error", kind: "crash", message: String(err), line: 1, column: 1 }));
        },
      );
    },
    warmUp(request) {
      try {
        if (!checker.warmUp) return;
        const { code, fn, tests } = JSON.parse(request);
        checker.warmUp(code, fn, tests);
      } catch { /* silent: a warm-up is only a head start */ }
    },
    stop() {
      current++;
      checker.stop();
    },
  };
}
