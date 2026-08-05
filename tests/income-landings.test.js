/* One slot per pay day. A fortnightly source lands two or three times a
 * month, so a single "cleared?" flag cannot say which of them has arrived. */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("income landings — a tickable slot per pay day");
  setToday("2026-08-22");

  // Lands on the 1st, 15th and 29th of a 31-day month.
  const biweekly = { id: "inc1", label: "PAYCHECK", amount: 1000, dueDateOfMonth: 1, frequency: "biweekly" };
  const base = (log) => ({
    currentMonth: "2026-08",
    settings: { titheEnabled: false, tithePercent: 10 },
    balanceChecks: [{ id: "a", date: "2026-08-22", amount: 500, createdAt: 1 }],
    income: [biweekly], incomeLog: log || [],
    bills: [], billsPaid: {}, debts: [], transactions: [],
    spendingCategories: [], categoryFunding: {}, creditCards: []
  });
  const entry = over => Object.assign({
    id: "e" + Math.random(), incomeId: "inc1", amount: 1000,
    month: "2026-08", date: "2026-08-01", createdAt: 1
  }, over);

  t.section("Slots come from the pay schedule");
  {
    const slots = B.landingsForMonth(base(), biweekly, "2026-08");
    t.is("three landings in August", slots.length, 3);
    t.is("dated from the schedule", slots.map(l => l.date).join(","), "2026-08-01,2026-08-15,2026-08-29");
    t.is("all empty to start", slots.filter(l => l.entry).length, 0);
  }

  t.section("Untagged entries fill the earliest slots — existing data reads unchanged");
  {
    const slots = B.landingsForMonth(base([entry({ id: "x1", createdAt: 1 }), entry({ id: "x2", createdAt: 2 })]), biweekly, "2026-08");
    t.is("first slot takes the earliest entry", slots[0].entry.id, "x1");
    t.is("second takes the next", slots[1].entry.id, "x2");
    t.is("third is still open", slots[2].entry, null);
  }

  t.section("A tagged entry claims its own slot, leaving earlier ones open");
  {
    const s = base([entry({ id: "mid", landingIndex: 1 })]);
    const slots = B.landingsForMonth(s, biweekly, "2026-08");
    t.is("the 1st is untouched", slots[0].entry, null);
    t.is("the 15th is claimed", slots[1].entry.id, "mid");
    // This is what counting entries could not express: ticking the second
    // paycheck used to cancel the first.
    const august = B.horizonEvents(s).filter(e => e.kind === "income" && e.date <= "2026-08-31");
    t.is("only the 29th is still expected in August", august.length, 1);
    t.is("and it is the 29th", august[0].date, "2026-08-29");
    const overdue = B.overdueIncome(s);
    t.is("the unlogged 1st is reported overdue", overdue.length, 1);
    t.is("dated the 1st", overdue[0].landingDate, "2026-08-01");
  }

  t.section("Overdue income is per landing, not per source");
  {
    const tagged = base([entry({ id: "mid", landingIndex: 1 })]);
    const untagged = base([entry({ id: "any" })]);
    t.is("tagged to slot 1 leaves the 1st outstanding", B.overdueIncome(tagged).length, 1);
    t.is("untagged fills slot 0, leaving the 15th outstanding", B.overdueIncome(untagged).length, 1);
    t.ok("and they are different landings",
      B.overdueIncome(tagged)[0].landingDate !== B.overdueIncome(untagged)[0].landingDate);
  }

  t.section("Extra entries beyond the schedule still count as income");
  {
    const s = base([entry({ id: "a1" }), entry({ id: "a2" }), entry({ id: "a3" }), entry({ id: "bonus", amount: 250 })]);
    t.is("every slot filled", B.landingsForMonth(s, biweekly, "2026-08").filter(l => l.entry).length, 3);
    t.eq("the unslotted bonus is still received income", B.receivedIncome(s), 3250);
    t.is("nothing left to expect this month",
      B.horizonEvents(s).filter(e => e.kind === "income" && e.date <= "2026-08-31").length, 0);
  }

  t.section("A once-a-month source keeps exactly one slot");
  {
    const monthly = { id: "m1", label: "SALARY", amount: 3000, dueDateOfMonth: 15, frequency: "monthly" };
    const s = base([]); s.income = [monthly];
    const slots = B.landingsForMonth(s, monthly, "2026-08");
    t.is("one slot", slots.length, 1);
    t.is("on the 15th", slots[0].date, "2026-08-15");
  }

  return t.report();
};
