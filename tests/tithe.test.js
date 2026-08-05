/* Tithe split across the pay days it is given from, with the shares always
 * adding up to the figure on the TITHE row. */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("tithe — a share per pay day that sums to the total");
  setToday("2026-08-22");

  const mk = (income, log, paid) => ({
    currentMonth: "2026-08",
    settings: { titheEnabled: true, tithePercent: 10 },
    balanceChecks: [{ id: "a", date: "2026-08-22", amount: 1000, createdAt: 1 }],
    income, incomeLog: log || [], billsPaid: paid ? { "2026-08": paid } : {},
    bills: [], debts: [], transactions: [],
    spendingCategories: [], categoryFunding: {}, creditCards: []
  });
  const BIWEEKLY = { id: "i1", label: "PAYCHECK", amount: 1000, dueDateOfMonth: 1, frequency: "biweekly" };
  const MONTHLY = { id: "i2", label: "SALARY", amount: 3000, dueDateOfMonth: 15, frequency: "monthly" };

  t.section("Shares add up to the TITHE row, exactly");
  {
    const s = mk([BIWEEKLY, MONTHLY]);
    const ls = B.titheLandings(s);
    t.is("four landings — three fortnightly plus one monthly", ls.length, 4);
    t.eq("shares sum to the headline tithe", ls.reduce((a, l) => a + l.share, 0), B.tithe(s), 0.01);
    // Prorated inside each source, so one source's schedule never distorts
    // another's contribution.
    t.eq("the fortnightly source's shares sum to its own monthly tithe",
      ls.filter(l => l.incomeId === "i1").reduce((a, l) => a + l.share, 0),
      B.incomeMonthlyAmount(BIWEEKLY) * 0.10, 0.01);
    t.eq("the monthly source keeps its full share", ls.find(l => l.incomeId === "i2").share, 300, 0.01);
    t.is("sorted by pay day", ls.map(l => l.date).join(","),
      "2026-08-01,2026-08-15,2026-08-15,2026-08-29");
  }

  t.section("This is what the old per-source row got wrong");
  {
    // It showed `source amount x rate` — $100 for a fortnightly $1,000 source
    // whose monthly tithe is $216.67 — so ticking every row left most of the
    // tithe outstanding while the list looked complete.
    const s = mk([BIWEEKLY]);
    t.eq("the old single row under-counted", BIWEEKLY.amount * 0.10, 100);
    t.eq("the new rows total the real monthly tithe",
      B.titheLandings(s).reduce((a, l) => a + l.share, 0), B.tithe(s), 0.01);
    t.ok("and the gap was over a hundred dollars", Math.abs(100 - B.tithe(s)) > 100);
  }

  t.section("Records under the pre-split id still read, and still clear");
  {
    const s = mk([BIWEEKLY], [], { "tithe:i1": { paid: true, amount: 100, createdAt: 1 } });
    const ls = B.titheLandings(s);
    const first = B.titheLandingRecord(s, ls[0]);
    t.is("the earliest landing answers to the old id", first.key, "tithe:i1");
    t.ok("and finds the record", !!first.rec);
    const second = B.titheLandingRecord(s, ls[1]);
    t.is("later landings do not claim it", second.rec, null);
    t.is("their key is the new per-pay-day form", second.key, "tithe:i1:1");
  }

  t.section("A per-pay-day record wins where both exist");
  {
    const s = mk([BIWEEKLY], [], {
      "tithe:i1": { paid: true, amount: 100, createdAt: 1 },
      "tithe:i1:0": { paid: true, amount: 72.22, createdAt: 2 }
    });
    t.is("prefers the newer id", B.titheLandingRecord(s, B.titheLandings(s)[0]).key, "tithe:i1:0");
  }

  t.section("unpaidTithe still sees per-pay-day ticks");
  {
    const ls = B.titheLandings(mk([BIWEEKLY]));
    const all = {};
    ls.forEach(l => { all[l.key] = { paid: true, amount: l.share, createdAt: 1 }; });
    t.eq("nothing outstanding once every pay day is ticked", B.unpaidTithe(mk([BIWEEKLY], [], all)), 0, 0.02);
    const one = { [ls[0].key]: { paid: true, amount: ls[0].share, createdAt: 1 } };
    t.eq("one ticked leaves the rest",
      B.unpaidTithe(mk([BIWEEKLY], [], one)), B.tithe(mk([BIWEEKLY])) - ls[0].share, 0.02);
    const lump = { tithe: { paid: true, amount: B.tithe(mk([BIWEEKLY])), createdAt: 1 } };
    t.eq("the one-lump tick covers everything", B.unpaidTithe(mk([BIWEEKLY], [], lump)), 0, 0.02);
  }

  t.section("Nothing to split, and nothing to tithe");
  {
    const s = mk([MONTHLY]);
    t.is("a single-pay-day month has one landing", B.titheLandings(s).length, 1);
    t.eq("carrying the whole tithe", B.titheLandings(s)[0].share, B.tithe(s), 0.01);
    const off = mk([BIWEEKLY]); off.settings.titheEnabled = false;
    t.eq("every share is zero when tithing is switched off",
      B.titheLandings(off).reduce((a, l) => a + l.share, 0), 0);
    t.is("no income, no landings", B.titheLandings(mk([])).length, 0);
  }

  return t.report();
};
