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
  block(src, "const ImportEngine = (() => {"),
  "return { Util, BudgetEngine, DebtEngine, ImportEngine };"
].join("\n");

// `Date` resolves at call time, not here, so tests can move the clock after
// this module has been required (see harness.setToday).
const engines = new Function(code)();

/* The anonymized export lives inside the UI closure, which cannot be evaluated
 * here because it wants a DOM. The builder itself does not: it reads Util,
 * BudgetEngine and DebtEngine and nothing else. So pull out that one region —
 * from the first anonymizer table down to the end of the coach prompt — and
 * evaluate it against the same three engines the browser hands it. What this
 * suite asserts about privacy is therefore asserted about the shipped code.
 */
const ANON_START = "const ANON_BILL_GENERICS";
const ANON_PROMPT = "const COACH_PROMPT";
const ANON_TAIL = "\n  ].join(\"\\n\");";

function anonRegion(source) {
  const start = source.indexOf(ANON_START);
  const prompt = start < 0 ? -1 : source.indexOf(ANON_PROMPT, start);
  const end = prompt < 0 ? -1 : source.indexOf(ANON_TAIL, prompt);
  if (end < 0) throw new Error("tests/engine.js: could not find the anonymized export block in index.html");
  return source.slice(start, end + ANON_TAIL.length);
}

const AnonExport = new Function("Util", "BudgetEngine", "DebtEngine", [
  anonRegion(src),
  "return { buildAnonymizedExport, COACH_PROMPT, ANON_WINDOW_MONTHS, anonMonthWindow, anonMonthFacts };"
].join("\n"))(engines.Util, engines.BudgetEngine, engines.DebtEngine);

module.exports = Object.assign({}, engines, { AnonExport });
