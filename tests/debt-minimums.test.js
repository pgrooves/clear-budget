/* What a debt actually asks for this month.
 *
 * Two things used to release money that was still owed:
 *
 *   1. Ticking a minimum released ALL of it, whatever was actually paid. The
 *      tick deliberately asks how much you paid rather than assuming, so a $50
 *      payment against a $200 minimum left $150 owed and the app handed all
 *      $200 back as spendable. A one cent payment cleared a $200 obligation.
 *
 *   2. A debt cleared to zero kept its minimum in every forward-looking
 *      figure. The projection excluded it correctly, but the budget, the
 *      reservation and the walk all kept charging it, so a paid-off card cost
 *      its minimum every month for ever.
 *
 * Both were found against a real household export: a card paid down to $0.00
 * that still carried a $40 minimum.
 */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B, DebtEngine: D } = require("./engine");

function household(debts, txns) {
  return {
    settings: { mode: "solo", names: ["ALEX"], tithePercent: 10, titheEnabled: false, debtStrategy: "avalanche" },
    currentMonth: "2026-08",
    income: [{ id: "i1", label: "PAY", amount: 3000, dueDateOfMonth: 25, frequency: "monthly" }],
    bills: [], spendingCategories: [], transactions: txns || [], incomeLog: [],
    billsPaid: {}, billAmounts: {},
    balanceChecks: [{ id: "a1", date: "2026-08-01", amount: 4000, createdAt: 1 }],
    categoryFunding: {}, monthlyRollover: {}, debts, creditCards: [], banks: []
  };
}
const VISA = { id: "d1", label: "VISA", balance: 5000, originalBalance: 5000, minimumPayment: 200, interestRate: 20, dueDateOfMonth: 15, cardId: null };
const tick = amount => ({ id: "t1", date: "2026-08-03", amount, categoryId: "d1", categoryType: "debt",
  note: "PAYMENT", paymentType: "cash", month: "2026-08", createdAt: 100, tickPay: true });

module.exports = function run() {
  const t = suite("debt minimums — only what is still owed gets reserved");
  setToday("2026-08-06");

  t.section("Paying part of a minimum leaves the rest of it owed");
  {
    const none = household([VISA]);
    const part = household([VISA], [tick(50)]);
    const full = household([VISA], [tick(200)]);
    const cent = household([VISA], [tick(0.01)]);

    t.eq("nothing paid: the whole minimum is reserved", B.unpaidDebtMins(none), 200);
    t.eq("paid $50 of $200: $150 is still reserved", B.unpaidDebtMins(part), 150);
    t.eq("paid in full: nothing is reserved", B.unpaidDebtMins(full), 0);
    t.eq("paid a cent: essentially all of it is still reserved", B.unpaidDebtMins(cent), 199.99);

    // Safe To Spend must not move when a payment leaves the account: the
    // balance falls and the reservation falls with it, by the same amount.
    const safeNone = B.safeToSpend(none);
    t.eq("paying $50 does not move Safe To Spend", B.safeToSpend(part), safeNone);
    t.eq("paying the full minimum does not move it either", B.safeToSpend(full), safeNone);
    t.eq("paying a cent does not move it", B.safeToSpend(cent), safeNone);
  }

  t.section("The walk charges what is left, on the day it falls due");
  {
    const part = household([VISA], [tick(50)]);
    const due = B.horizonEvents(part).filter(e => e.kind === "debt");
    t.is("one debt event this month", due.length, 1);
    // Guarded: before this was fixed the event was dropped altogether, and an
    // assertion that says so is more use than a stack trace.
    t.eq("for the unpaid remainder, not the whole minimum", due[0] ? -due[0].amount : 0, 150);
    t.is("on the due day", due[0] ? due[0].date : "(no event)", "2026-08-15");
  }

  t.section("A debt cleared to zero asks for nothing at all");
  {
    // The shape from the export: a $124.58 card cleared by a $125 payment,
    // still carrying a $40 minimum.
    const cleared = { id: "d6", label: "CARD FOUR", balance: 0, originalBalance: 124.58,
                      minimumPayment: 40, interestRate: 27.24, dueDateOfMonth: 12, cardId: "c4" };
    const withIt = household([VISA, cleared]);
    const without = household([VISA]);

    t.eq("its minimum is not counted in the monthly minimums", B.totalDebtMins(withIt), B.totalDebtMins(without));
    t.eq("nor reserved as still owed", B.unpaidDebtMins(withIt), B.unpaidDebtMins(without));
    t.eq("nor charged in the budget", B.totalBudgeted(withIt), B.totalBudgeted(without));
    t.eq("so the surplus is not eaten by it", B.extraForDebt(withIt), B.extraForDebt(without));
    t.eq("Safe To Spend is the same as if it were deleted", B.safeToSpend(withIt), B.safeToSpend(without));
    t.eq("and so is the after-payday figure", B.tightestPoint(withIt), B.tightestPoint(without));
    t.is("it puts no event in the walk",
      B.horizonEvents(withIt).filter(e => e.label === "CARD FOUR").length, 0);
    t.eq("and it adds nothing to total debt", B.totalDebt(withIt), B.totalDebt(without));

    t.section("and nothing of it shows up in where the minimum goes");
    const split = D.principalSplit(withIt.debts);
    t.is("only the debt that still has a balance is listed", split.length, 1);
    t.is("and it is the right one", split[0].id, "d1");
  }

  t.section("A debt still owed is untouched by all of this");
  {
    const s = household([VISA]);
    t.eq("its minimum still counts", B.totalDebtMins(s), 200);
    t.eq("and is still reserved", B.unpaidDebtMins(s), 200);
    const ev = B.horizonEvents(s).filter(e => e.kind === "debt");
    t.is("and it still lands in the walk", ev.length, 1);
    t.eq("at its full amount", -ev[0].amount, 200);
  }

  return t.report();
};
