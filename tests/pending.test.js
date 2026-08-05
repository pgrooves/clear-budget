/* Pending transactions. The money leaves when the card is swiped, not when
 * the bank gets round to posting it, so Safe To Spend has to know about it. */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("pending — spent the day it was swiped");
  setToday("2026-08-20");

  const base = (txns) => ({
    currentMonth: "2026-08",
    settings: { titheEnabled: false, tithePercent: 10 },
    // Balance confirmed on the 18th: it knows about everything POSTED up to
    // then, and nothing that is still pending.
    balanceChecks: [{ id: "a", date: "2026-08-18", amount: 1000, createdAt: 100 }],
    income: [{ id: "i1", label: "PAY", amount: 2000, dueDateOfMonth: 28, frequency: "monthly" }],
    incomeLog: [], bills: [], billsPaid: {}, billAmounts: {},
    debts: [], transactions: txns || [], spendingCategories: [], categoryFunding: {}, creditCards: []
  });
  const txn = over => Object.assign({
    id: "t" + Math.random(), amount: 120, paymentType: "cash",
    month: "2026-08", date: "2026-08-19", createdAt: 200, note: "FUEL"
  }, over);

  t.section("A pending charge comes off the balance");
  {
    const none = B.projectedBalance(base([]));
    const one = B.projectedBalance(base([txn({ pending: true })]));
    t.eq("nothing logged", none, 1000);
    t.eq("one pending charge", one, 880);
  }

  t.section("It counts even when it predates the confirmed balance");
  {
    // Swiped on the 15th, still not posted on the 18th when the balance was
    // read. The bank's figure does not include it, so the app must.
    const s = base([txn({ date: "2026-08-15", createdAt: 1, pending: true })]);
    t.eq("still subtracted", B.projectedBalance(s), 880);
    // A POSTED charge from before the anchor is a different matter: the
    // balance already reflects it, so counting it again would double it.
    const posted = base([txn({ date: "2026-08-15", createdAt: 1 })]);
    t.eq("a posted one from the same day is not", B.projectedBalance(posted), 1000);
  }

  t.section("It flows through to Safe To Spend");
  {
    const before = B.cashFlowOutlook(base([])).windowLow;
    const after = B.cashFlowOutlook(base([txn({ pending: true })])).windowLow;
    t.eq("the figure drops by the amount swiped", before - after, 120);
  }

  t.section("Credit is still handled by the card's due date, pending or not");
  {
    // A pending card purchase does not touch checking at all; it rides on the
    // card's due day like every other credit row.
    const s = base([txn({ paymentType: "credit", cardId: null, pending: true })]);
    t.eq("checking is untouched", B.projectedBalance(s), 1000);
    const credit = B.horizonEvents(s).filter(e => e.kind === "credit");
    t.is("it is still a dated credit claim", credit.length, 1);
    t.is("on the 1st of next month", credit[0].date, "2026-09-01");
  }

  t.section("Once it posts there must be exactly one of it");
  {
    // What settling produces: the same row, updated in place with the final
    // date and amount, no longer pending.
    const settled = base([txn({ id: "keep", date: "2026-08-21", amount: 126.40 })]);
    t.eq("counted once, at the final amount", B.projectedBalance(settled), 1000 - 126.40);
    // What a failure to settle would have produced.
    const doubled = base([
      txn({ id: "old", date: "2026-08-19", amount: 120, pending: true }),
      txn({ id: "new", date: "2026-08-21", amount: 126.40 })
    ]);
    t.eq("not settling would have counted both", B.projectedBalance(doubled), 1000 - 246.40);
    t.ok("which is the drift the settle step exists to prevent",
      B.projectedBalance(settled) - B.projectedBalance(doubled) > 100);
  }

  t.section("Ordinary transactions are unaffected");
  {
    const s = base([txn({ date: "2026-08-19" }), txn({ date: "2026-08-17", createdAt: 1 })]);
    t.eq("only the one after the anchor counts", B.projectedBalance(s), 880);
  }

  return t.report();
};
