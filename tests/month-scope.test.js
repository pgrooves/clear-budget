/* Where an edit lands.
 *
 * The rule, in one line: Settings holds the figure that sticks, and an amount
 * typed on the Bills or Income tab belongs to the month that was on screen.
 *
 * This was not true for a while and nothing said so. Tapping a source's amount
 * on the Income tab wrote s.income[].amount, so a fortnight of overtime typed
 * in August quietly became what every future month expected — while the exact
 * same gesture one tab over, on a bill, had always been August-only. These
 * assertions are the rule itself, not an implementation detail: if any of them
 * fail, an edit has escaped its month.
 */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("month scope — Settings sticks, tabs are for the month on screen");
  setToday("2026-08-06");

  const POWER = { id: "pow", label: "POWER", amount: 180, dueDateOfMonth: 10 };
  const CLEANER = { id: "clean", label: "CLEANER", amount: 80, dueDateOfMonth: 3, frequency: "weekly" };
  const SALARY = { id: "sal", label: "SALARY", amount: 3000, dueDateOfMonth: 15, frequency: "monthly" };
  const HOURLY = { id: "hr", label: "HOURLY", amount: 1000, dueDateOfMonth: 1, frequency: "biweekly" };

  const base = (over) => Object.assign({
    currentMonth: "2026-08",
    settings: { titheEnabled: false, tithePercent: 10 },
    balanceChecks: [{ id: "a", date: "2026-08-06", amount: 3000, createdAt: 1 }],
    income: [], incomeLog: [], bills: [], billsPaid: {},
    billAmounts: {}, billOccEdits: {}, incomeLandingEdits: {},
    debts: [], transactions: [], spendingCategories: [], categoryFunding: {}, creditCards: []
  }, over || {});

  // Applying a patch the way DataService.update would: top-level key replace.
  const apply = (s, patch) => Object.assign({}, s, patch);

  t.section("A bill amount typed on the tab is that month's, and only that month's");
  {
    const s = base({ bills: [POWER] });
    const after = apply(s, B.monthAmountPatch(s, "bill", POWER, 312));
    t.eq("August runs at what was typed", B.billOccurrences(after, POWER, "2026-08")[0].amount, 312);
    t.eq("September is still the usual figure", B.billOccurrences(after, POWER, "2026-09")[0].amount, 180);
    t.eq("and Settings is untouched", Number(after.bills[0].amount), 180);
    t.is("the patch never carries the bills array at all", after.bills === s.bills, true);
  }

  t.section("An income amount typed on the tab behaves identically");
  {
    const s = base({ income: [SALARY] });
    const after = apply(s, B.monthAmountPatch(s, "income", SALARY, 3400));
    t.eq("August runs at what was typed", B.landingsForMonth(after, SALARY, "2026-08")[0].amount, 3400);
    t.eq("September is still the usual figure", B.landingsForMonth(after, SALARY, "2026-09")[0].amount, 3000);
    t.eq("and Settings is untouched", Number(after.income[0].amount), 3000);
    t.is("the patch never carries the income array at all", after.income === s.income, true);
  }

  t.section("Editing Settings moves every month that has not been told otherwise");
  {
    // What "Settings sticks" means from the other side: the standing figure is
    // the default for every month, and a month that overrode it keeps its own.
    const s = base({ bills: [POWER] });
    const august = apply(s, B.monthAmountPatch(s, "bill", POWER, 312));
    const raised = apply(august, { bills: [{ ...POWER, amount: 210 }] });
    t.eq("August keeps what August was told", B.billOccurrences(raised, raised.bills[0], "2026-08")[0].amount, 312);
    t.eq("September follows Settings", B.billOccurrences(raised, raised.bills[0], "2026-09")[0].amount, 210);
    t.eq("so does October", B.billOccurrences(raised, raised.bills[0], "2026-10")[0].amount, 210);
  }

  t.section("On something landing several times, the tab figure sets every date");
  {
    const s = base({ bills: [CLEANER] });
    const after = apply(s, B.monthAmountPatch(s, "bill", CLEANER, 95));
    const occ = B.billOccurrences(after, CLEANER, "2026-08");
    t.is("all five weeks", occ.map(o => o.amount).join(","), "95,95,95,95,95");
    t.eq("and the month costs what that comes to", B.billsSubtotal(after), 95 * 5);
    t.eq("September is untouched",
      B.billOccurrences(after, CLEANER, "2026-09").reduce((a, o) => a + o.amount, 0), 80 * 4);
  }

  t.section("The coarse tool overwrites, and can be used twice");
  {
    // The bug in the first draft of this: skipping dates that were already
    // priced meant the second save through the form found every date priced by
    // the first and silently did nothing.
    const s = base({ bills: [CLEANER] });
    const once = apply(s, B.monthAmountPatch(s, "bill", CLEANER, 95));
    const twice = apply(once, B.monthAmountPatch(once, "bill", CLEANER, 110));
    t.is("the second figure takes", B.billOccurrences(twice, CLEANER, "2026-08").map(o => o.amount).join(","),
      "110,110,110,110,110");
    // And the fine tool still wins, because it is applied afterwards.
    const thenOne = apply(twice, { billAmounts: { "2026-08": { ...twice.billAmounts["2026-08"], "clean:2": 140 } } });
    t.eq("a date priced on its own after the fact keeps its figure",
      B.billOccurrences(thenOne, CLEANER, "2026-08")[2].amount, 140);
  }

  t.section("Typing the standing figure back in clears the month rather than pinning it");
  {
    const s = base({ bills: [POWER] });
    const over = apply(s, B.monthAmountPatch(s, "bill", POWER, 312));
    const back = apply(over, B.monthAmountPatch(over, "bill", POWER, 180));
    t.is("no override left behind", back.billAmounts["2026-08"].pow, undefined);
    t.is("so the occurrence stops calling itself overridden",
      B.billOccurrences(back, POWER, "2026-08")[0].overridden, false);
    // Which is the point: a pinned 180 would then ignore Settings forever.
    const raised = apply(back, { bills: [{ ...POWER, amount: 240 }] });
    t.eq("and a later Settings change reaches this month",
      B.billOccurrences(raised, raised.bills[0], "2026-08")[0].amount, 240);
  }

  t.section("Clearing an amount keeps a moved day and a note, which are not amounts");
  {
    const s = base({
      income: [HOURLY],
      incomeLandingEdits: { "2026-08": { "hr:1": { day: 18, note: "32 HRS", amount: 1320 } } }
    });
    const cleared = apply(s, B.monthAmountPatch(s, "income", HOURLY, 1000));
    const l = B.landingsForMonth(cleared, HOURLY, "2026-08").find(x => x.index === 1);
    t.eq("the amount goes back to the usual", l.amount, 1000);
    t.is("the moved day survives", l.date, "2026-08-18");
    t.is("and so does the note", l.note, "32 HRS");
  }

  t.section("A month override never leaks into the smoothed monthly figure");
  {
    const s = base({ income: [HOURLY] });
    const after = apply(s, B.monthAmountPatch(s, "income", HOURLY, 1400));
    t.eq("expected monthly income still comes from Settings", B.totalIncome(after), 1000 * 26 / 12);
    t.eq("and the tithe with it", B.totalIncome(after) * 0.1, 1000 * 26 / 12 * 0.1);
  }

  t.section("Overrides are filed under the month that was on screen");
  {
    const s = base({ bills: [POWER], currentMonth: "2026-09" });
    const after = apply(s, B.monthAmountPatch(s, "bill", POWER, 260));
    t.is("September holds it", after.billAmounts["2026-09"].pow, 260);
    t.is("August has nothing", (after.billAmounts["2026-08"] || {}).pow, undefined);
    t.eq("and August still reads the usual figure", B.billOccurrences(after, POWER, "2026-08")[0].amount, 180);
  }

  t.section("A junk amount clears rather than writing a nonsense figure");
  {
    const s = base({ bills: [POWER] });
    const over = apply(s, B.monthAmountPatch(s, "bill", POWER, 312));
    [NaN, -5].forEach(bad => {
      const after = apply(over, B.monthAmountPatch(over, "bill", POWER, bad));
      t.is(`${bad} leaves no override`, after.billAmounts["2026-08"].pow, undefined);
    });
    t.is("and a missing item is a no-op",
      Object.keys(B.monthAmountPatch(s, "bill", null, 100)).length, 0);
  }

  return t.report();
};
