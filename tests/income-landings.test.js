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

  /* ---- Corrections to one pay day ----
     Hourly work is a different figure every week and a pay date that moves
     whenever one lands on a holiday, so each landing can carry its own amount,
     its own day and its own note. */

  t.section("Nothing set means nothing moved");
  {
    const slots = B.landingsForMonth(base(), biweekly, "2026-08");
    t.is("no landing claims to have moved", slots.some(l => l.moved), false);
    t.is("nor to be overridden", slots.some(l => l.overridden), false);
    t.is("each keyed like a bill occurrence", slots.map(l => l.key).join(","), "inc1,inc1:1,inc1:2");
    t.is("and each remembers the cadence it came from", slots[1].usualDay, 15);
  }

  t.section("One pay day can be worth what it is actually worth");
  {
    const s = base(); s.incomeLandingEdits = { "2026-08": { "inc1:1": { amount: 1320, note: "38 HRS" } } };
    const slots = B.landingsForMonth(s, biweekly, "2026-08");
    t.eq("the heavy fortnight brings more", slots[1].amount, 1320);
    t.is("and is marked as an override", slots[1].overridden, true);
    t.is("with the note it was given", slots[1].note, "38 HRS");
    t.eq("the others are untouched", slots[0].amount, 1000);
    t.is("and still remember the usual figure", slots[1].usualAmount, 1000);
    const ev = B.horizonEvents(s).find(e => e.kind === "income" && e.date === "2026-08-29");
    t.ok("the walk carries the dated landings", !!ev);
  }

  t.section("A pay day can be moved to the day it actually lands");
  {
    const s = base(); s.incomeLandingEdits = { "2026-08": { "inc1:2": { day: 27 } } };
    const slots = B.landingsForMonth(s, biweekly, "2026-08");
    const moved = slots.find(l => l.key === "inc1:2");
    t.is("it lands on the new day", moved.date, "2026-08-27");
    t.is("and says so", moved.moved, true);
    t.is("while remembering where the cadence put it", moved.usualDay, 29);
    const ev = B.horizonEvents(s).filter(e => e.kind === "income");
    t.is("the walk pays it on the new day", ev.some(e => e.date === "2026-08-27"), true);
    t.is("not the old one", ev.some(e => e.date === "2026-08-29"), false);
  }

  t.section("A moved pay day keeps its slot, so its tick follows it");
  {
    const s = base([entry({ id: "mid", landingIndex: 1 })]);
    s.incomeLandingEdits = { "2026-08": { "inc1:1": { day: 18 } } };
    const moved = B.landingsForMonth(s, biweekly, "2026-08").find(l => l.index === 1);
    t.is("the entry came with it", moved.entry.id, "mid");
    t.is("on the new date", moved.date, "2026-08-18");
  }

  t.section("A pay day moved past its neighbour still reads in date order");
  {
    // The 15th pushed out to the 30th, which is after the 29th.
    const s = base(); s.incomeLandingEdits = { "2026-08": { "inc1:1": { day: 30 } } };
    const slots = B.landingsForMonth(s, biweekly, "2026-08");
    t.is("printed in the order they land",
      slots.map(l => l.date).join(","), "2026-08-01,2026-08-29,2026-08-30");
    t.is("with the keys still tied to the cadence, not the order",
      slots.map(l => l.key).join(","), "inc1,inc1:2,inc1:1");
    t.is("and a lookup by index still finds the right one",
      slots.find(l => l.index === 1).date, "2026-08-30");
  }

  t.section("Untagged entries still fill by cadence order, not by moved date");
  {
    // The rule that keeps pre-existing data reading the way it always has.
    const s = base([entry({ id: "x1", createdAt: 1 })]);
    s.incomeLandingEdits = { "2026-08": { inc1: { day: 30 } } };
    const slots = B.landingsForMonth(s, biweekly, "2026-08");
    t.is("the earliest unclaimed slot is still landing zero",
      slots.find(l => l.index === 0).entry.id, "x1");
    t.is("even though it now lands last", slots[slots.length - 1].index, 0);
  }

  t.section("The smoothed monthly figure is deliberately left alone");
  {
    const s = base();
    s.incomeLandingEdits = { "2026-08": { "inc1:1": { amount: 1320 } } };
    // 1000 x 26/12. A month with a heavy fortnight is not a pay rise, and the
    // budget must not swing with it — see the note on landingsForMonth.
    t.eq("expected monthly income is unchanged", B.totalIncome(s), 1000 * 26 / 12);
    t.eq("and so is the tithe it drives",
      B.totalIncome(s) * 0.1, 1000 * 26 / 12 * 0.1);
  }

  t.section("Corrections belong to their month alone");
  {
    const s = base();
    s.incomeLandingEdits = { "2026-08": { "inc1:1": { day: 20, amount: 1320, note: "38 HRS" } } };
    const sept = B.landingsForMonth(s, biweekly, "2026-09");
    t.is("September lands on its own cadence", sept.some(l => l.moved), false);
    t.eq("at the usual figure", sept[1].amount, 1000);
    t.is("with no note carried over", sept[1].note, "");
  }

  t.section("A landing key resolves back to its source");
  {
    const s = base();
    t.is("the right source", B.landingForKey(s, "inc1:2", "2026-08").inc.id, "inc1");
    t.is("the right landing", B.landingForKey(s, "inc1:2", "2026-08").landing.index, 2);
    t.is("a bare id is landing zero", B.landingForKey(s, "inc1", "2026-08").landing.index, 0);
    t.is("an unknown key is null", B.landingForKey(s, "nope:1", "2026-08"), null);
  }

  return t.report();
};
