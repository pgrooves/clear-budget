/* The screenshot and spreadsheet parsers. */
const { setToday, suite } = require("./harness");
const { ImportEngine: I } = require("./engine");

module.exports = function run() {
  const t = suite("import parsing — one row, one transaction");
  setToday("2026-08-04");
  const at = { today: new Date("2026-08-04T12:00:00Z") };

  t.section("A $0.00 beside a row is not a second transaction");
  {
    // What a bank feed looks like when a merchant name wraps and the app
    // prints a zero placeholder — an authorisation hold, a rewards line —
    // underneath the real amount.
    const feed = [
      "AUG 02, 2026",
      "  ...AME... -$20.00",
      "  $0.00",
      "SHELL FUEL -$54.20",
      "  $0.00",
      "AUG 01, 2026",
      "RENT PAYMENT -$1,400.00"
    ].join("\n");
    const r = I.textParse(feed, at);
    t.is("three purchases, not five", r.items.length, 3);
    t.is("no zero-amount phantoms", r.items.filter(x => Math.abs(x.amount) < 0.005).length, 0);
    t.eq("the real amounts survive", r.items[0].amount, -20);
    t.eq("all of them", r.items[1].amount, -54.2);
  }

  t.section("And the zero does not stick to the description");
  {
    // The merchant key is derived from the description, and merchant learning,
    // the duplicate check and the pending-settle match all key off it — so a
    // stray "$0.00" in the text would stop a shop looking like itself.
    const r = I.textParse(["AUG 02, 2026", "SHELL FUEL -$54.20", "  $0.00"].join("\n"), at);
    t.is("description is clean", r.items[0].description, "SHELL FUEL");
    t.is("so the merchant key is stable",
      I.normalizeMerchantKey(r.items[0].description),
      I.normalizeMerchantKey("SHELL FUEL"));
  }

  t.section("A genuinely zeroed balance does not take its row with it");
  {
    const r = I.textParse(["AUG 02, 2026", "LAST WITHDRAWAL -$75.00 $0.00"].join("\n"), at);
    t.is("the withdrawal is still imported", r.items.length, 1);
    t.eq("at its real amount", r.items[0].amount, -75);
    t.is("the zero balance is simply not recorded", r.items[0].runningBalance, null);
  }

  t.section("Ordinary rows are untouched");
  {
    const r = I.textParse([
      "AUG 02, 2026",
      "GROCERIES -$82.15 $1,240.00",
      "COFFEE -$4.60 $1,235.40"
    ].join("\n"), at);
    t.is("both rows", r.items.length, 2);
    t.eq("amounts intact", r.items[0].amount, -82.15);
    t.eq("and the running balance is still read", r.items[0].runningBalance, 1240);
  }

  t.section("Pending rows are still detected, and still kept");
  {
    const r = I.textParse(["AUG 02, 2026", "TAKEAWAY PENDING -$31.00"].join("\n"), at);
    t.is("the row is imported", r.items.length, 1);
    t.is("flagged pending", r.items[0].pending, true);
  }

  return t.report();
};
