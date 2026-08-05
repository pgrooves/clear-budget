/* Tiny test harness. No dependencies — `node tests/run.js` and nothing else.
 *
 * Everything in the engine is time-dependent (the walk starts from today), so
 * setToday pins the clock. It swaps the global Date, and because the engine
 * only ever calls `new Date()` inside function bodies, a suite can move the
 * clock at any point and the next call picks it up.
 */
const RealDate = Date;

function setToday(iso) {
  const base = new RealDate(iso + "T12:00:00Z");
  global.Date = class extends RealDate {
    constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(base); }
    static now() { return base.getTime(); }
  };
}

function suite(title) {
  const lines = [];
  let fails = 0;

  const record = (ok, text) => {
    if (!ok) fails++;
    lines.push(`${ok ? "  ok  " : "  FAIL  "}${text}`);
  };

  return {
    title,
    section(text) { lines.push(`\n  --- ${text}`); },
    note(text) { lines.push(`        ${text}`); },
    // Money, so within half a dollar is the same number once rounded for display.
    eq(label, got, want, tolerance) {
      const tol = tolerance == null ? 0.51 : tolerance;
      record(Math.abs(got - want) < tol, `${label}: got ${round(got)}, want ${round(want)}`);
    },
    is(label, got, want) {
      record(got === want, `${label}: got ${got}, want ${want}`);
    },
    ok(label, condition, detail) {
      record(!!condition, label + (detail ? ` · ${detail}` : ""));
    },
    report() {
      console.log(`\n${fails ? "FAIL" : "PASS"}  ${title}`);
      console.log(lines.join("\n"));
      return fails;
    }
  };
}

function round(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}

module.exports = { setToday, suite };
