# Tests

```
node tests/run.js
```

No install, no dependencies. Exits non-zero if anything fails.

## What they cover

| Suite | What it protects |
| --- | --- |
| `walk.test.js` | The cash-flow walk: the rolling 35-day horizon, credit dated to the card's due day, and the two headline figures with the breakdown behind each. |
| `reconcile.test.js` | **Every breakdown adds up to the figure printed above it**, including the day the walk never dips. Plus a seeded sweep and the malformed-month guard. |
| `income-landings.test.js` | One tickable slot per pay day, and that existing untagged entries still fill the earliest slots so old data reads unchanged. Plus per-pay-day corrections: a moved pay day keeps its slot and its tick, and **the smoothed monthly figure deliberately does not move with it**. |
| `tithe.test.js` | Tithe split per pay day, shares summing exactly to the TITHE row, and pre-split records still readable and clearable. |
| `tithe-lump.test.js` | **Ticking the lump and the pay-day shares is still one tithe.** The lump wins outright, in the engine rather than only on screen. |
| `monotonic.test.js` | **Marking income received can never lower either headline figure.** |
| `anon-export.test.js` | The AI export carries three months of history and **still leaks no merchant, note, account or name** — asserted over every month in the window, against the block pulled straight out of `index.html`. |

## Why the last one matters

That was a real bug. The pre-payday window used to be read off the *unlogged*
income events, so ticking your next paycheck removed it from the list, pushed
"your next payday" out to the one after it, and pulled another fortnight of
bills into the window. Logging money you had actually received made Safe To
Spend go **down**. Ticking the last one made the window vanish altogether.

The window now comes from the pay schedule, which no amount of ticking can
move. The suite checks 356 transitions across 64 household shapes — four pay
frequencies, four pay days, tithe on and off, two balances — ticking paychecks
one at a time in every starting order.

## Why `reconcile.test.js` sweeps instead of trusting a fixture

`walk.test.js` already had a section called "Both breakdowns reconcile to their
own figure, exactly", and it passed the whole time the panel was printing
$4,500 − $900 = $2,000. Its fixture simply never landed on the shape that broke:
a day where money comes in before it goes out, so the balance never actually
dips and the low is the balance you started with.

A hand-picked fixture only ever proves the case someone thought of. The new
suite keeps its fixtures for readability and adds 800 breakdowns across 400
generated households on a fixed seed, so the next shape nobody thought of has
somewhere to fail.

Those households now also carry per-landing corrections — a bill occurrence or
a pay day given its own amount, its own day, or both — because that is exactly
the kind of thing that moves a dated event inside the walk while a breakdown
assembled separately from the walk goes on quoting the old one. The sweep
asserts it actually generated some, so a renamed state key can't turn it into a
suite that passes while testing none of them.

## How they load the app

There is no build step: `index.html` is the whole application. `engine.js`
pulls the `Util` and `BudgetEngine` blocks straight out of that file and
evaluates them, so the tests always run against the code that ships. There is
no second copy to drift out of date.

If a rename ever breaks the extraction it throws immediately with the name it
could not find, rather than silently testing nothing.

## Adding a test

Each suite exports a function that returns its failure count:

```js
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("what this file is about");
  setToday("2026-08-22");          // the walk starts from today, so pin the clock

  t.section("a scenario");
  t.eq("money comparison", got, want);   // within half a dollar
  t.is("exact comparison", got, want);
  t.ok("a condition", condition, "optional detail");

  return t.report();
};
```

Then add it to the list in `run.js`.
