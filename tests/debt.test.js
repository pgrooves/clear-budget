/* The payoff projection. It used to read years early on a real book, in three
 * compounding ways: it assumed the whole budget surplus went at the debt, it
 * charged interest after the payment landed, and it held card minimums flat. */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B, DebtEngine: D } = require("./engine");

module.exports = function run() {
  const t = suite("debt — a payoff date you can plan around");
  setToday("2026-08-04");

  // ~$50k: four cards around 25%, two loans. Minimums are ~2.5% of balance on
  // the cards, which is what a real statement asks for.
  const book = () => [
    { id: "c1", label: "CARD 1", balance: 9800, originalBalance: 9800, minimumPayment: 245, interestRate: 26.9, cardId: "x1" },
    { id: "c2", label: "CARD 2", balance: 7400, originalBalance: 7400, minimumPayment: 185, interestRate: 24.5, cardId: "x2" },
    { id: "c3", label: "CARD 3", balance: 6100, originalBalance: 6100, minimumPayment: 155, interestRate: 28.9, cardId: "x3" },
    { id: "c4", label: "CARD 4", balance: 4700, originalBalance: 4700, minimumPayment: 120, interestRate: 22.9, cardId: "x4" },
    { id: "l1", label: "CAR LOAN", balance: 14200, originalBalance: 20000, minimumPayment: 430, interestRate: 7.4 },
    { id: "l2", label: "PERSONAL LOAN", balance: 7800, originalBalance: 10000, minimumPayment: 260, interestRate: 11.9 }
  ];
  const opts = extra => Object.assign({ startMonth: "2026-08", strategy: "avalanche" }, extra);

  t.section("Interest is charged before the payment lands, as lenders do");
  {
    // $1,000 at 12% is 1% a month. Month one owes $10, so a $110 payment
    // leaves $900 — not $899.10, which is what charging interest on the
    // post-payment balance would give. Ten months, $53.78 of interest, worked
    // by hand and matched below.
    const one = [{ id: "d", label: "D", balance: 1000, minimumPayment: 110, interestRate: 12 }];
    const r = D.project(one, opts({ extraPerMonth: 0 }));
    t.is("ten months", r.months, 10);
    t.eq("interest is charged on the balance carried into each month", r.totalInterest, 53.78, 0.01);
    t.is("and it does pay off", r.neverPaysOff, false);
  }

  t.section("Card minimums decline with the balance; loan installments do not");
  {
    const card = [{ id: "c", label: "C", balance: 5000, minimumPayment: 125, interestRate: 24, cardId: "z" }];
    const loan = [{ id: "l", label: "L", balance: 5000, minimumPayment: 125, interestRate: 24 }];
    const cardRun = D.project(card, opts({ extraPerMonth: 0 }));
    const loanRun = D.project(loan, opts({ extraPerMonth: 0 }));
    t.ok("the same balance and rate take longer on a card than on a loan",
      cardRun.months == null || loanRun.months == null || cardRun.months > loanRun.months,
      `card ${cardRun.months}, loan ${loanRun.months}`);
    t.is("a card minimum is treated as revolving", D.isRevolving(card[0]), true);
    t.is("a loan is not", D.isRevolving(loan[0]), false);
  }

  t.section("A minimum that cannot cover its own interest never pays off");
  {
    const stuck = [{ id: "s", label: "STUCK", balance: 10000, minimumPayment: 100, interestRate: 24, cardId: "z" }];
    const r = D.project(stuck, opts({ extraPerMonth: 0 }));
    t.is("no debt-free date is offered", r.debtFreeDate, null);
    t.is("it is reported as never paying off", r.neverPaysOff, true);
    t.is("and the debt is named", r.stuck[0], "s");
    // principalSplit is what explains it on screen.
    const split = D.principalSplit(stuck);
    t.is("flagged as underwater", split[0].underwater, true);
    t.eq("because the interest exceeds the minimum", split[0].interest, 200, 1);
  }

  t.section("Where a minimum actually goes");
  {
    const split = D.principalSplit(book());
    const c3 = split.find(x => x.id === "c3");
    t.eq("CARD 3 interest this month", c3.interest, 146.9, 1);
    t.eq("so only this much of the $155 minimum reaches the balance", c3.principal, 8.1, 1);
    t.ok("less than a tenth of the payment is progress", c3.share < 0.1, c3.share.toFixed(3));
    const loan = split.find(x => x.id === "l1");
    t.ok("the car loan is the other way round", loan.share > 0.75, loan.share.toFixed(3));
    t.is("sorted worst-first so the stuck ones surface", split[0].id, "c3");
  }

  t.section("The whole book: minimums only is years from the old projection");
  {
    const mins = D.project(book(), opts({ extraPerMonth: 0 }));
    t.note(`minimums only: ${mins.months} months, ${Math.round(mins.totalInterest).toLocaleString()} interest`);
    t.ok("it takes over five years", mins.months > 60, `${mins.months} months`);
    t.ok("and costs more in interest than half the balance",
      mins.totalInterest > 25000, `$${Math.round(mins.totalInterest).toLocaleString()}`);

    // What the app used to show: the whole budget surplus assumed as payment.
    const asSurplus = D.project(book(), opts({ extraPerMonth: 1500 }));
    t.note(`assuming a $1,500 surplus: ${asSurplus.months} months`);
    t.ok("the old basis was more than three years early",
      mins.months - asSurplus.months > 36, `${mins.months - asSurplus.months} months apart`);
  }

  t.section("More money always helps, and never by less than nothing");
  {
    let prev = D.project(book(), opts({ extraPerMonth: 0 }));
    [100, 300, 500, 800, 1200].forEach(extra => {
      const r = D.project(book(), opts({ extraPerMonth: extra }));
      t.ok(`+$${extra}/mo is no slower than the step below`, r.months <= prev.months,
        `${prev.months} -> ${r.months} months`);
      t.ok(`   and costs no more interest`, r.totalInterest <= prev.totalInterest + 0.01);
      prev = r;
    });
  }

  t.section("A one-off lump helps once, not every month");
  {
    const once = D.project(book(), opts({ extraOnce: 5000 }));
    const every = D.project(book(), opts({ extraPerMonth: 5000 }));
    t.ok("a single $5,000 beats doing nothing",
      once.months < D.project(book(), opts({ extraPerMonth: 0 })).months);
    t.ok("but is far behind $5,000 every month", once.months > every.months,
      `once ${once.months} vs monthly ${every.months}`);
  }

  t.section("What it takes, worked backwards");
  {
    [24, 36].forEach(target => {
      const need = D.extraNeededForMonths(book(), target, { startMonth: "2026-08", strategy: "avalanche" });
      const check = D.project(book(), opts({ extraPerMonth: need }));
      t.ok(`$${need}/mo really does clear it inside ${target} months`,
        check.months != null && check.months <= target, `${check.months} months`);
      const short = D.project(book(), opts({ extraPerMonth: Math.max(0, need - 40) }));
      t.ok(`   and $40 less does not`, short.months == null || short.months > target,
        `${short.months} months`);
    });
  }

  t.section("The projection runs on what you paid, not on what you could spare");
  {
    const s = {
      currentMonth: "2026-08",
      settings: { titheEnabled: false, tithePercent: 10 },
      income: [{ id: "i", label: "PAY", amount: 6200, dueDateOfMonth: 1, frequency: "monthly" }],
      incomeLog: [], bills: [], billsPaid: {}, spendingCategories: [], categoryFunding: {},
      balanceChecks: [], creditCards: [], debts: book(),
      transactions: []
    };
    // No history at all: minimums, and the label says so.
    const cold = B.debtPace(s);
    t.is("with no payment history the basis is minimums", cold.basis, "minimums");
    t.eq("and there is no assumed extra", cold.extra, 0);
    t.ok("even though the budget could spare a lot",
      B.extraForDebt(s) > 3000, `$${Math.round(B.extraForDebt(s))}`);

    // Three months of paying exactly the minimums.
    const mins = book().reduce((a, d) => a + d.minimumPayment, 0);
    ["2026-05", "2026-06", "2026-07"].forEach((m, i) => {
      s.transactions.push({ id: "p" + i, categoryType: "debt", categoryId: "c1", amount: mins, month: m, date: m + "-05" });
    });
    const paid = B.debtPace(s);
    t.is("with history the basis is what was observed", paid.basis, "observed");
    t.eq("paying the minimums reads as no extra", paid.extra, 0, 1);
    t.is("over three months", paid.months, 3);

    // Now three months of paying $400 over.
    s.transactions.forEach(t2 => { t2.amount = mins + 400; });
    t.eq("paying more reads as more", B.debtPace(s).extra, 400, 1);

    // The month in progress is excluded — it is half finished.
    s.transactions.push({ id: "now", categoryType: "debt", categoryId: "c1", amount: 5, month: "2026-08", date: "2026-08-02" });
    t.eq("a part-paid current month does not drag the average down", B.debtPace(s).extra, 400, 1);

    // Underpaying never projects faster than the minimums.
    s.transactions.forEach(t2 => { t2.amount = 100; });
    t.eq("a missed month floors at the minimums, never below", B.debtPace(s).extra, 0);
  }

  t.section("Degenerate books do not crash");
  {
    t.is("no debts", D.project([], opts({})).debtFreeDate, null);
    t.is("zero balances", D.project([{ id: "z", balance: 0, minimumPayment: 10, interestRate: 5 }], opts({})).months, 0);
    const noRate = D.project([{ id: "n", balance: 600, minimumPayment: 100, interestRate: 0 }], opts({}));
    t.is("a 0% debt pays off in balance/payment months", noRate.months, 6);
    t.eq("with no interest at all", noRate.totalInterest, 0);
  }

  return t.report();
};
