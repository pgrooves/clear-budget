/* The breakdown under a headline figure must add up to that figure.
 *
 * The overlay prints two totals and a LEAVES line, above the sentence
 * "EVERYTHING BELOW ADDS UP TO EXACTLY THAT". It did not, in one specific
 * shape: when the walk never dips below the balance you started with, the low
 * IS that opening balance, and it happens before the day's own movements. The
 * breakdown was cut by date, and a date cannot express "before today's
 * events", so today's paycheck and today's rent were both listed under a
 * figure that predated them. On a day you are paid and rent goes out, the
 * panel read $4,500 - $900 = $2,000.
 *
 * The walk now hands the explanation layer a cursor into its own event stream
 * rather than a date. These fixtures are the shapes that got it wrong, plus a
 * seeded sweep, because the fixture that was already here happened to miss it.
 */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

function base(over) {
  return Object.assign({
    settings: { mode: "couple", names: ["A", "B"], tithePercent: 10, titheEnabled: false, debtStrategy: "avalanche" },
    currentMonth: "2026-08",
    income: [], bills: [], spendingCategories: [], transactions: [], incomeLog: [],
    billsPaid: {}, billAmounts: {}, balanceChecks: [], categoryFunding: {},
    monthlyRollover: {}, debts: [], creditCards: [], banks: []
  }, over);
}

// available already includes the balance and everything coming in; claimed is
// everything going out. That difference is the figure the panel explains.
function reconciles(report) { return report.available - report.claimed; }

module.exports = function run() {
  const t = suite("every breakdown adds up to the figure above it");
  setToday("2026-08-06");

  t.section("payday is today and the paycheck has not been logged yet");
  {
    const s = base({
      balanceChecks: [{ id: "a1", date: "2026-08-05", amount: 500, createdAt: 1000 }],
      income: [{ id: "i1", label: "SALARY", amount: 3000, dueDateOfMonth: 6, frequency: "monthly" }],
      bills: [{ id: "b1", label: "RENT", amount: 200, dueDateOfMonth: 20, frequency: "monthly" }]
    });
    const r = B.safeToSpendReport(s);
    t.eq("the figure is the balance you have now", r.amount, 500);
    t.eq("and the columns add up to it", reconciles(r), r.amount);
    t.is("nothing from later today is listed as already arrived", r.incoming.length, 0);
  }

  t.section("an overdue bill pinned to today, and income landing today");
  {
    const s = base({
      balanceChecks: [{ id: "a1", date: "2026-08-05", amount: 2000, createdAt: 1000 }],
      income: [{ id: "i1", label: "SALARY", amount: 2500, dueDateOfMonth: 6, frequency: "monthly" }],
      bills: [
        { id: "b1", label: "RENT", amount: 900, dueDateOfMonth: 1, frequency: "monthly" },
        { id: "b2", label: "POWER", amount: 150, dueDateOfMonth: 25, frequency: "monthly" }
      ]
    });
    const r = B.safeToSpendReport(s);
    t.eq("the balance never actually dips, so the low is today", r.amount, 2000);
    t.eq("the columns add up to it", reconciles(r), r.amount);
    t.ok("the overdue bill is still surfaced as a note",
      r.notes.some(n => n.kind === "lateBills"), "noteLateBills");
  }

  t.section("the same rule on the after-payday panel");
  {
    const s = base({
      settings: { mode: "couple", names: ["A", "B"], tithePercent: 10, titheEnabled: true, debtStrategy: "avalanche" },
      balanceChecks: [{ id: "a1", date: "2026-08-03", amount: 1800, createdAt: 1000 }],
      income: [{ id: "i1", label: "SALARY", amount: 1400, dueDateOfMonth: 7, frequency: "biweekly" }],
      bills: [{ id: "b1", label: "RENT", amount: 1100, dueDateOfMonth: 1, frequency: "monthly" }],
      spendingCategories: [{ id: "c1", label: "GROCERIES", budgeted: 600, type: "spending" }],
      categoryFunding: { "2026-08": { c1: 300 } },
      debts: [{ id: "d1", label: "VISA", balance: 4000, minimumPayment: 120, interestRate: 22, dueDateOfMonth: 18, cardId: "cc1" }],
      creditCards: [{ id: "cc1", label: "VISA", debtId: "d1" }],
      transactions: [
        { id: "t1", date: "2026-08-04", amount: 90, categoryId: "c1", paymentType: "debit", month: "2026-08", createdAt: 1500 },
        { id: "t2", date: "2026-08-05", amount: 210, categoryId: "c1", paymentType: "credit", cardId: "cc1", month: "2026-08", createdAt: 1600 }
      ]
    });
    const safe = B.safeToSpendReport(s);
    const tight = B.tightestPointReport(s);
    t.eq("safe to spend reconciles", reconciles(safe), safe.amount);
    t.eq("after payday reconciles", reconciles(tight), tight.amount);
    t.ok("the two report different moments", safe.date !== tight.date || safe.amount !== tight.amount,
      `${safe.date} ${safe.amount} vs ${tight.date} ${tight.amount}`);
  }

  t.section("no paycheck anywhere in the horizon");
  {
    const s = base({
      balanceChecks: [{ id: "a1", date: "2026-08-05", amount: 1200, createdAt: 1000 }],
      bills: [{ id: "b1", label: "RENT", amount: 400, dueDateOfMonth: 20, frequency: "monthly" }]
    });
    const safe = B.safeToSpendReport(s);
    const tight = B.tightestPointReport(s);
    t.eq("safe to spend reconciles", reconciles(safe), safe.amount);
    t.eq("the fallback figure reconciles too", reconciles(tight), tight.amount);
    t.is("and it says there is no payday to speak of", tight.hasAfter, false);
  }

  t.section("a seeded sweep, because one fixture is not a proof");
  {
    let seed = 20260806;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const FREQ = ["weekly", "biweekly", "semimonthly", "monthly"];
    const DAYS = ["2026-01-31", "2026-02-28", "2026-03-08", "2026-06-30", "2026-08-06", "2026-10-31", "2026-12-15"];

    let checked = 0, off = 0, worst = 0, corrections = 0;
    for (let n = 0; n < 400; n++) {
      const today = pick(DAYS);
      setToday(today);
      const ym = today.slice(0, 7);
      const s = base({ currentMonth: ym });
      s.settings.titheEnabled = rnd() < 0.5;
      s.balanceChecks = [{ id: "a", date: today, amount: int(-200, 5000), createdAt: 1000 }];
      for (let i = 0, k = int(0, 2); i < k; i++)
        s.income.push({ id: "i" + i, label: "INC" + i, amount: int(200, 3000), dueDateOfMonth: int(1, 31), frequency: pick(FREQ) });
      for (let i = 0, k = int(0, 4); i < k; i++)
        s.bills.push({ id: "b" + i, label: "BILL" + i, amount: int(20, 900), dueDateOfMonth: int(1, 31), frequency: pick(FREQ) });
      for (let i = 0, k = int(0, 2); i < k; i++)
        s.debts.push({ id: "d" + i, label: "DEBT" + i, balance: int(500, 9000), minimumPayment: int(0, 250),
                       interestRate: int(0, 29), dueDateOfMonth: int(1, 31), cardId: null });
      // Per-occurrence and per-pay-day corrections: a different amount, a
      // different day, or both, on any given landing. These move dated events
      // around inside the walk, which is exactly where a breakdown that is
      // built separately from the walk would drift away from it.
      s.billOccEdits = { [ym]: {} };
      s.incomeLandingEdits = { [ym]: {} };
      s.bills.forEach(b => B.billOccurrences(s, b, ym).forEach(o => {
        if (rnd() >= 0.3) return;
        const e = {};
        if (rnd() < 0.6) e.amount = int(20, 900);
        if (rnd() < 0.6) e.day = int(1, 31);
        if (Object.keys(e).length) {
          // Amount overrides live in billAmounts; day and note alongside.
          if (e.amount != null) {
            s.billAmounts[ym] = s.billAmounts[ym] || {};
            s.billAmounts[ym][o.key] = e.amount;
          }
          if (e.day != null) s.billOccEdits[ym][o.key] = { day: e.day };
          corrections++;
        }
      }));
      s.income.forEach(i => B.landingsForMonth(s, i, ym).forEach(l => {
        if (rnd() >= 0.3) return;
        const e = {};
        if (rnd() < 0.6) e.amount = int(200, 3000);
        if (rnd() < 0.6) e.day = int(1, 31);
        if (Object.keys(e).length) { s.incomeLandingEdits[ym][l.key] = e; corrections++; }
      }));
      // Logged AFTER the corrections, so an entry records what that landing is
      // actually worth on the day it actually lands.
      s.income.forEach(i => B.landingsForMonth(s, i, ym).forEach(l => {
        if (rnd() < 0.4) s.incomeLog.push({ id: "L" + i.id + l.index, incomeId: i.id, amount: l.amount,
          date: l.date, month: ym, createdAt: 2000 + l.index, landingIndex: l.index });
      }));
      [B.safeToSpendReport(s), B.tightestPointReport(s)].forEach(r => {
        checked++;
        const gap = Math.abs(reconciles(r) - r.amount);
        if (gap > worst) worst = gap;
        if (gap >= 0.005) off++;
      });
    }
    t.is(`${checked} breakdowns across 400 households, none off by a cent`, off, 0);
    t.ok("worst discrepancy is zero", worst < 0.005, `worst ${Math.round(worst * 100) / 100}`);
    // Without this the sweep could quietly stop generating corrections — a
    // renamed state key, say — and go on passing while testing none of them.
    t.ok("and the sweep actually corrected some landings", corrections > 200,
      `${corrections} per-landing corrections generated`);
  }

  t.section("a stored month that is not a month cannot poison a date");
  {
    setToday("2026-08-06");
    const s = base({
      currentMonth: "not-a-month",
      balanceChecks: [{ id: "a1", date: "2026-08-05", amount: 900, createdAt: 1 }],
      income: [{ id: "i1", label: "PAY", amount: 1000, dueDateOfMonth: 5, frequency: "monthly" }]
    });
    const o = B.cashFlowOutlook(s);
    t.ok("the horizon has real dates at both ends",
      /^\d{4}-\d{2}-\d{2}$/.test(o.startISO) && /^\d{4}-\d{2}-\d{2}$/.test(o.horizonEnd),
      `${o.startISO} to ${o.horizonEnd}`);
    t.ok("no event carries a NaN date",
      B.horizonEvents(s).every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
    t.ok("the figures are still numbers", Number.isFinite(o.windowLow) && Number.isFinite(o.afterLow));
  }

  return t.report();
};
