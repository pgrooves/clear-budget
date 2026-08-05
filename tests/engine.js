/* Loads the real BudgetEngine out of index.html.
 *
 * The app is one self-contained HTML file with no build step, so there is
 * nothing to import. Rather than keep a second copy of the engine that would
 * quietly drift out of date, this pulls the two top-level IIFEs straight out
 * of the shipped file and evaluates them. If a test fails, it failed against
 * the code that actually runs in the browser.
 *
 * Both blocks end with `})();` at column zero. Nested closures inside them are
 * indented, so that is an unambiguous terminator.
 */
const fs = require("fs");
const path = require("path");

const TERMINATOR = "\n})();";

function block(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`tests/engine.js: could not find "${decl}" in index.html`);
  const end = src.indexOf(TERMINATOR, start);
  if (end < 0) throw new Error(`tests/engine.js: could not find the end of "${decl}"`);
  return src.slice(start, end + TERMINATOR.length);
}

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// Util first — the other two close over it.
const code = [
  block(src, "const Util = (() => {"),
  block(src, "const BudgetEngine = (() => {"),
  block(src, "const DebtEngine = (() => {"),
  "return { Util, BudgetEngine, DebtEngine };"
].join("\n");

// `Date` resolves at call time, not here, so tests can move the clock after
// this module has been required (see harness.setToday).
module.exports = new Function(code)();
