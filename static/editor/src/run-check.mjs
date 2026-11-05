// The Run's side of the Checker seam: one Language's Checker, behind the
// request/reply text the Reflex frontend speaks. `language` is the current
// Language (any value with the four seams); nothing here knows which one.
//
// A request is JSON text {code, fn, tests: [{args, expected}]}; the reply
// is the Checker's result as JSON text. A check that a newer start() or a
// stop() has ended never replies, so an older result is ignored.
export function createCheckSession(language, env) {
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
          onReply(JSON.stringify({ status: "error", kind: "crash", message: String(err), line: 1, column: 0 }));
        },
      );
    },
    stop() {
      current++;
      checker.stop();
    },
  };
}
