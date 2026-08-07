#!/usr/bin/env node
/* Runs every suite. No dependencies, no config:
 *
 *     node tests/run.js
 *
 * Exits non-zero if anything fails, so it works as a pre-push check or in CI.
 */
const suites = [
  "./walk.test",
  "./reconcile.test",
  "./income-landings.test",
  "./tithe.test",
  "./tithe-lump.test",
  "./monotonic.test",
  "./debt.test",
  "./debt-minimums.test",
  "./bills.test",
  "./month-scope.test",
  "./pending.test",
  "./import-parse.test",
  "./anon-export.test"
];

let failures = 0;
suites.forEach(name => {
  try {
    failures += require(name)();
  } catch (err) {
    failures++;
    console.log(`\nFAIL  ${name} threw before it could report`);
    console.log(err && err.stack ? err.stack : String(err));
  }
});

console.log(failures
  ? `\n${failures} failing assertion${failures === 1 ? "" : "s"}\n`
  : "\nAll suites passing\n");
process.exit(failures ? 1 : 0);
