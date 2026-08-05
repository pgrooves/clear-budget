/* Bills that land more than once a month, and amounts that move with usage. */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("bills — a line per occurrence, priced per month");
  setToday("2026-08-04");

  const base = (bills, extra) => Object.assign({
    currentMonth: "2026-08",
    settings: { titheEnabled: false, tithePercent: 10 },
    balanceChecks: [{ id: "a", date: "2026-08-04", amount: 3000, createdAt: 1 }],
    income: [{ id: "i1", label: "PAY", amount: 2000, dueDateOfMonth: 15, frequency: "monthly" }],
    incomeLog: [], bills, billsPaid: {}, billAmounts: {},
    debts: [], transactions: [], spendingCategories: [], categoryFunding: {}, creditCards: []
  }, extra || {});

  const MONTHLY = { id: "rent", label: "RENT", amount: 1400, dueDateOfMonth: 1 };
  const WEEKLY = { id: "clean", label: "CLEANER", amount: 80, dueDateOfMonth: 3, frequency: "weekly" };
  const POWER = { id: "pow", label: "POWER", amount: 180, dueDateOfMonth: 10 };

  t.section("A bill with no frequency is exactly what it always was");
  {
    const s = base([MONTHLY]);
    const occ = B.billOccurrences(s, MONTHLY);
    t.is("one occurrence", occ.length, 1);
    t.is("keyed by the bare bill id, so old records still resolve", occ[0].key, "rent");
    t.is("on its due day", occ[0].date, "2026-08-01");
    t.eq("at its usual amount", occ[0].amount, 1400);
    t.eq("and the bills total is unchanged", B.billsSubtotal(s), 1400);
  }

  t.section("A weekly bill lands every week, each one tickable");
  {
    const s = base([WEEKLY]);
    const occ = B.billOccurrences(s, WEEKLY);
    t.is("five occurrences in a 31-day August from the 3rd", occ.length, 5);
    t.is("dated a week apart", occ.map(o => o.date).join(","),
      "2026-08-03,2026-08-10,2026-08-17,2026-08-24,2026-08-31");
    t.is("the first keeps the bare id", occ[0].key, "clean");
    t.is("the rest are numbered", occ[1].key, "clean:1");
    t.eq("the month costs five times the weekly figure", B.billsSubtotal(s), 400);
  }

  t.section("Ticking one occurrence leaves the others standing");
  {
    const s = base([WEEKLY], { billsPaid: { "2026-08": { "clean:1": { paid: true, amount: 80, createdAt: 1 } } } });
    const occ = B.billOccurrences(s, WEEKLY);
    t.is("the ticked one is paid", occ[1].paid, true);
    t.is("the first is not", occ[0].paid, false);
    t.eq("four are still owed", B.unpaidBillsTotal(s), 320);
    const events = B.horizonEvents(s).filter(e => e.kind === "bill" && e.date <= "2026-08-31");
    t.is("and only the unpaid ones are in the walk", events.length, 4);
    t.is("with the ticked date absent", events.some(e => e.date === "2026-08-10"), false);
  }

  t.section("A legacy paid record still ticks the first occurrence");
  {
    // Written before occurrences existed, under the bare bill id.
    const s = base([WEEKLY], { billsPaid: { "2026-08": { clean: { paid: true, amount: 80, createdAt: 1 } } } });
    t.is("occurrence zero reads as paid", B.billOccurrences(s, WEEKLY)[0].paid, true);
    t.eq("and is out of the walk", B.unpaidBillsTotal(s), 320);
  }

  t.section("A usage-based bill can cost what it actually cost");
  {
    const s = base([POWER], { billAmounts: { "2026-08": { pow: 312 } } });
    const occ = B.billOccurrences(s, POWER)[0];
    t.eq("this month it is the amount you entered", occ.amount, 312);
    t.is("and it is marked as an override", occ.overridden, true);
    t.eq("the bills total follows", B.billsSubtotal(s), 312);
    t.eq("so does what is still owed", B.unpaidBillsTotal(s), 312);
    const ev = B.horizonEvents(s).find(e => e.kind === "bill");
    t.eq("and the walk charges the real figure", ev.amount, -312);
    // Next month goes back to normal on its own.
    t.eq("next month reverts to the usual amount",
      B.billOccurrences(s, POWER, "2026-09")[0].amount, 180);
  }

  t.section("Overrides are per occurrence, not per bill");
  {
    const s = base([WEEKLY], { billAmounts: { "2026-08": { "clean:2": 140 } } });
    const occ = B.billOccurrences(s, WEEKLY);
    t.eq("the dearer week costs more", occ[2].amount, 140);
    t.eq("the others are untouched", occ[0].amount, 80);
    t.eq("and the total reflects just the one", B.billsSubtotal(s), 80 * 4 + 140);
  }

  t.section("An occurrence key resolves back to its bill");
  {
    const s = base([WEEKLY, MONTHLY]);
    const found = B.billOccurrenceFor(s, "clean:3", "2026-08");
    t.is("the right bill", found.bill.id, "clean");
    t.is("the right occurrence", found.occ.index, 3);
    t.is("a bare id is occurrence zero", B.billOccurrenceFor(s, "rent", "2026-08").occ.index, 0);
    t.is("an unknown key is null", B.billOccurrenceFor(s, "nope:2", "2026-08"), null);
  }

  t.section("Late occurrences are reported one by one");
  {
    const s = base([WEEKLY]);
    const note = B.shortfallReport(s, "safe").notes.find(n => n.kind === "lateBills");
    // Today is the 4th, so only the 3rd has been and gone.
    t.is("one occurrence is past due", note && note.count, 1);
    t.is("and it is tickable by its own key", note.bills[0].id, "clean");
  }

  t.section("Every cadence is offered, and none of them is quarterly");
  {
    t.is("four choices", B.BILL_FREQUENCIES.length, 4);
    t.is("ending at monthly", B.BILL_FREQUENCIES[B.BILL_FREQUENCIES.length - 1].id, "monthly");
    t.is("an unknown frequency falls back to monthly", B.billFrequency({ frequency: "yearly" }).id, "monthly");
    t.is("as does none at all", B.billFrequency({}).id, "monthly");
  }

  return t.report();
};
