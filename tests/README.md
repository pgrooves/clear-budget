# Tests

```
node tests/run.js
```

No install, no dependencies. Exits non-zero if anything fails.

## What they cover

| Suite | What it protects |
| --- | --- |
| `walk.test.js` | The cash-flow walk: the rolling 35-day horizon, credit dated to the card's due day, and the two headline figures with the breakdown behind each. |
| `income-landings.test.js` | One tickable slot per pay day, and that existing untagged entries still fill the earliest slots so old data reads unchanged. |
| `tithe.test.js` | Tithe split per pay day, shares summing exactly to the TITHE row, and pre-split records still readable and clearable. |
| `monotonic.test.js` | **Marking income received can never lower either headline figure.** |

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
