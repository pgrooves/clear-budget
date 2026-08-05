/* Marking income received is bookkeeping, not a change in your circumstances.
 * It must never lower either headline figure.
 *
 * This guards a real bug: the pre-payday window used to be read off the
 * UNLOGGED income events, so ticking your next paycheck removed it from the
 * list, pushed "your next payday" out to the one after it, and dragged another
 * fortnight of bills into the window. Logging money you had actually received
 * made Safe To Spend go DOWN. Tick the last one and the window vanished
 * entirely. The window now comes from the pay schedule, which no amount of
 * ticking can move.
 */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("monotonicity — logging income can only ever help");
  setToday("2026-08-04");

  const bills = [
    ["rent", 1400, 1], ["power", 180, 2], ["gym", 20, 3], ["water", 70, 5], ["ins", 110, 7],
    ["net", 125, 12], ["phone", 95, 14], ["car", 430, 15], ["daycare", 600, 16],
    ["trash", 45, 20], ["gas", 130, 21], ["life", 38, 23], ["pet", 30, 26], ["misc", 20, 28]
  ].map(([id, amount, d]) => ({ id, label: id.toUpperCase(), amount, dueDateOfMonth: d }));

  const household = (frequency, dueDateOfMonth, anchor, titheEnabled) => ({
    currentMonth: "2026-08",
    settings: { titheEnabled, tithePercent: 10 },
    balanceChecks: [{ id: "a", date: "2026-08-04", amount: anchor, createdAt: 1 }],
    income: [{ id: "i1", label: "PAYCHECK", amount: 1530, dueDateOfMonth, frequency }],
    incomeLog: [], bills, billsPaid: {}, debts: [], transactions: [],
    spendingCategories: [], categoryFunding: {}, creditCards: []
  });

  // Mirrors exactly what the checkbox writes, including the entry-date rule:
  // a pay day that has already been and gone keeps its own date.
  const tickEntry = (s, idx) => {
    const l = B.landingsForMonth(s, s.income[0], "2026-08")[idx];
    const today = "2026-08-04";
    return {
      id: "e" + idx, incomeId: "i1", landingIndex: idx, amount: l.amount,
      month: "2026-08", date: l.date < today ? l.date : today, createdAt: 100 + idx, tithe: true
    };
  };

  const shapes = [];
  ["weekly", "biweekly", "semimonthly", "monthly"].forEach(frequency => {
    [1, 4, 12, 28].forEach(dueDateOfMonth => {
      [true, false].forEach(titheEnabled => {
        [200, 2400].forEach(anchor => shapes.push({ frequency, dueDateOfMonth, anchor, titheEnabled }));
      });
    });
  });

  t.section(`Ticking paychecks across ${shapes.length} household shapes`);
  {
    let worstSafe = 0, worstAfter = 0, transitions = 0;
    shapes.forEach(sh => {
      const base = household(sh.frequency, sh.dueDateOfMonth, sh.anchor, sh.titheEnabled);
      const n = B.landingsForMonth(base, base.income[0], "2026-08").length;
      // Every starting position, ticked cumulatively — order must not matter.
      for (let start = 0; start < n; start++) {
        const s = JSON.parse(JSON.stringify(base));
        let prev = B.cashFlowOutlook(s);
        for (let k = 0; k < n; k++) {
          s.incomeLog.push(tickEntry(s, (start + k) % n));
          const now = B.cashFlowOutlook(s);
          transitions++;
          worstSafe = Math.min(worstSafe, now.windowLow - prev.windowLow);
          worstAfter = Math.min(worstAfter, now.afterLow - prev.afterLow);
          prev = now;
        }
      }
    });
    t.note(`${transitions} transitions checked`);
    t.ok("safe to spend never falls", worstSafe > -0.01, `worst move ${worstSafe.toFixed(2)}`);
    t.ok("the after-payday figure never falls", worstAfter > -0.01, `worst move ${worstAfter.toFixed(2)}`);
  }

  t.section("The payday window belongs to the calendar, not to the log");
  {
    let moved = 0;
    shapes.forEach(sh => {
      const base = household(sh.frequency, sh.dueDateOfMonth, sh.anchor, sh.titheEnabled);
      const before = B.cashFlowOutlook(base).windowEnd;
      const s = JSON.parse(JSON.stringify(base));
      B.landingsForMonth(s, s.income[0], "2026-08").forEach((l, i) => s.incomeLog.push(tickEntry(s, i)));
      if (B.cashFlowOutlook(s).windowEnd !== before) moved++;
    });
    t.is("logging every paycheck moves the window in no shape", moved, 0);

    const s = household("biweekly", 12, 536, true);
    B.landingsForMonth(s, s.income[0], "2026-08").forEach((l, i) => s.incomeLog.push(tickEntry(s, i)));
    t.ok("and the window never disappears", !!B.cashFlowOutlook(s).windowEnd,
      String(B.cashFlowOutlook(s).windowEnd));
  }

  t.section("The originally reported case, end to end");
  {
    // $536 confirmed, fortnightly wage, a month of bills. Logging the first
    // paycheck used to move the balance +$1,530 and the figure -$91.
    const s = household("biweekly", 12, 536, true);
    const before = B.cashFlowOutlook(s).windowLow;
    s.incomeLog.push(tickEntry(s, 0));
    const after = B.cashFlowOutlook(s).windowLow;
    t.note(`safe to spend ${Math.round(before)} -> ${Math.round(after)}`);
    t.ok("logging a paycheck raises it", after > before, `moved +${Math.round(after - before)}`);
  }

  return t.report();
};
