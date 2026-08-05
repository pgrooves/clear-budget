/* The cash-flow walk: the rolling horizon, credit timing, and the two
 * headline figures with the breakdown behind each of them. */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

module.exports = function run() {
  const t = suite("walk — horizon, credit timing, and the two figures");
  setToday("2026-08-22");

  const base = () => ({
    currentMonth: "2026-08",
    settings: { titheEnabled: false, tithePercent: 10 },
    balanceChecks: [{ id: "a", date: "2026-08-22", amount: 300, createdAt: 1 }],
    income: [{ id: "inc1", label: "PAYCHECK", amount: 1500, dueDateOfMonth: 1, frequency: "semimonthly" }],
    incomeLog: [
      { id: "l1", incomeId: "inc1", amount: 1500, month: "2026-08", date: "2026-08-01", createdAt: 0 },
      { id: "l2", incomeId: "inc1", amount: 1500, month: "2026-08", date: "2026-08-16", createdAt: 0 }
    ],
    bills: [
      { id: "rent", label: "RENT", amount: 1200, dueDateOfMonth: 1 },
      { id: "car", label: "CAR", amount: 400, dueDateOfMonth: 25 },
      { id: "net", label: "INTERNET", amount: 80, dueDateOfMonth: 28 }
    ],
    billsPaid: { "2026-08": { rent: { paid: true, amount: 1200, paidDate: "2026-08-01", createdAt: 0 } } },
    debts: [], transactions: [], spendingCategories: [], categoryFunding: {}, creditCards: []
  });

  t.section("Late in the month, bills before payday — the originally reported complaint");
  {
    const s = base();
    const o = B.cashFlowOutlook(s);
    // Aug 22 balance 300; CAR -400 on the 25th; INTERNET -80 on the 28th -> -180.
    // The horizon rolls past month end: Sep 1 brings +1500 then RENT -1200.
    t.eq("safe to spend, through the next payday", o.windowLow, -180);
    t.is("dated to the deepest day before payday", o.windowLowDate, "2026-08-28");
    t.is("window ends on the next scheduled payday", o.windowEnd, "2026-09-01");
    t.eq("month end counts August only", o.monthEnd, -180);
  }

  t.section("Same month, but the account actually has money");
  {
    const s = base();
    s.balanceChecks[0].amount = 1400;
    const o = B.cashFlowOutlook(s);
    t.eq("safe to spend", o.windowLow, 920);
    t.is("no red date", o.windowLowDate, "2026-08-28");
  }

  t.section("Rent on payday must not invent a dip");
  {
    // Income lands before bills within a day, so rent paid out of that day's
    // paycheck does not first drive the balance through the floor.
    const s = base();
    s.balanceChecks[0].amount = 2000;
    s.bills.push({ id: "big", label: "MORTGAGE", amount: 1800, dueDateOfMonth: 1 });
    s.billsPaid["2026-08"].big = { paid: true, amount: 1800, paidDate: "2026-08-01", createdAt: 0 };
    const o = B.cashFlowOutlook(s);
    t.eq("safe to spend", o.windowLow, 20);
    t.is("the low lands on the 1st, after the money arrived", o.windowLowDate, "2026-09-01");
  }

  t.section("Credit is dated to the card's due day, not to the day you swiped");
  {
    const s = base();
    s.balanceChecks[0].amount = 1400;
    s.creditCards = [{ id: "cardA", label: "VISA", debtId: "debtA" }];
    s.debts = [{ id: "debtA", label: "VISA", balance: 2000, minimumPayment: 0, dueDateOfMonth: 20, cardId: "cardA" }];
    s.transactions = [{ id: "t1", amount: 600, paymentType: "credit", cardId: "cardA", month: "2026-08", date: "2026-08-10" }];
    const o = B.cashFlowOutlook(s);
    t.eq("safe to spend is untouched by a card due next month", o.windowLow, 920);
    const ev = B.horizonEvents(s).filter(e => e.kind === "credit");
    t.is("one credit event", ev.length, 1);
    t.is("dated to the linked card's due day", ev[0].date, "2026-09-20");
  }

  t.section("Credit on an unlinked card falls to the 1st of next month");
  {
    const s = base();
    s.transactions = [{ id: "t1", amount: 600, paymentType: "credit", cardId: null, month: "2026-08", date: "2026-08-10" }];
    const ev = B.horizonEvents(s).filter(e => e.kind === "credit");
    t.is("one credit event", ev.length, 1);
    t.is("dated the 1st of next month — the earliest a statement could bite", ev[0].date, "2026-09-01");
    t.eq("for the full amount", ev[0].amount, -600);
  }

  t.section("cashToCover is the headroom with credit suppressed");
  {
    const s = base();
    s.balanceChecks[0].amount = 1400;
    s.transactions = [{ id: "t1", amount: 600, paymentType: "credit", cardId: null, month: "2026-08", date: "2026-08-10" }];
    t.eq("cover equals the low with credit taken out",
      B.cashToCover(s), B.cashFlowOutlook(s, { excludeCredit: true }).low);
  }

  t.section("An overdue unticked bill is held against today");
  {
    setToday("2026-08-27");
    const s = base();
    s.balanceChecks[0].date = "2026-08-27";
    s.balanceChecks[0].amount = 1000;
    const o = B.cashFlowOutlook(s);
    const ev = B.horizonEvents(s).find(e => e.label === "CAR");
    t.is("the 25th's bill is pinned to today", ev.date, "2026-08-27");
    t.eq("and comes straight off safe to spend", o.windowLow, 1000 - 400 - 80);
    const late = B.shortfallReport(s, "safe").notes.find(n => n.kind === "lateBills");
    t.is("the note carries ids so it can be ticked in place", late && late.bills[0].id, "car");
    t.ok("and appears on both panels", !!B.shortfallReport(s, "tight").notes.find(n => n.kind === "lateBills"));
    setToday("2026-08-22");
  }

  t.section("Both breakdowns reconcile to their own figure, exactly");
  {
    const s = base();
    s.spendingCategories = [{ id: "c1", label: "GROCERIES", budgeted: 400 }];
    s.categoryFunding = { "2026-08": { c1: 200 } };
    s.transactions = [{ id: "t1", amount: 300, paymentType: "credit", cardId: null, month: "2026-08", date: "2026-08-10" }];
    const o = B.cashFlowOutlook(s);
    const safe = B.shortfallReport(s, "safe");
    const after = B.shortfallReport(s, "tight");
    t.eq("safe: what you have minus what claims it === the figure", safe.available - safe.claimed, safe.amount);
    t.eq("safe figure is the pre-payday low", safe.amount, o.windowLow);
    t.eq("after payday: same identity holds", after.available - after.claimed, after.amount);
    t.eq("after-payday figure is the post-payday low", after.amount, o.afterLow);
    t.is("each is dated to its own low", safe.date === o.windowLowDate && after.date === o.afterLowDate, true);
    t.is("the two never report the same moment",
      o.windowLowDate === o.afterLowDate && o.hasAfter, false);
    t.is("credit is a dated claim, never also a flat one",
      after.claims.filter(c => c.kind === "credit" && c.date == null).length, 0);
  }

  t.section("The panels own different stretches, so a pile-up is never blamed twice");
  {
    const s = base();
    s.balanceChecks[0].amount = 2000;
    s.bills.push({ id: "big", label: "MORTGAGE", amount: 1800, dueDateOfMonth: 1 });
    s.bills.push({ id: "ins", label: "INSURANCE", amount: 500, dueDateOfMonth: 10 });
    s.billsPaid["2026-08"].big = { paid: true, amount: 1800, paidDate: "2026-08-01", createdAt: 0 };
    s.billsPaid["2026-08"].ins = { paid: true, amount: 500, paidDate: "2026-08-10", createdAt: 0 };
    s.transactions = [{ id: "t1", amount: 300, paymentType: "credit", cardId: null, month: "2026-08", date: "2026-08-10" }];
    const safe = B.shortfallReport(s, "safe");
    const after = B.shortfallReport(s, "tight");
    const kinds = r => r.notes.map(n => n.kind);
    t.note(`safe:  ${kinds(safe).join(", ") || "(none)"}`);
    t.note(`after: ${kinds(after).join(", ") || "(none)"}`);
    t.ok("safe hands off to the after-payday figure", kinds(safe).includes("seeTightest"));
    t.ok("after-payday says where the paychecks sit", kinds(after).includes("payPosition"));
    t.ok("only after-payday reports where it recovers to",
      kinds(after).includes("recovery") && !kinds(safe).includes("recovery"));
    // Sep 1 is payday, which sits INSIDE the safe window, so that panel owns it.
    const heavy = safe.notes.find(n => n.kind === "heaviestDay");
    t.is("safe names the payday pile-up", heavy && heavy.date, "2026-09-01");
    t.eq("totalling rent + mortgage + credit", heavy.amount, 1200 + 1800 + 300);
    t.is("after-payday does not blame the same day again", kinds(after).includes("heaviestDay"), false);
    const pay = after.notes.find(n => n.kind === "payPosition");
    t.is("one paycheck already counted in the figure", pay.count, 1);
  }

  t.section("A pile-up after payday belongs to the after-payday panel");
  {
    const s = base();
    s.balanceChecks[0].amount = 2000;
    s.bills.push({ id: "ins", label: "INSURANCE", amount: 900, dueDateOfMonth: 10 });
    s.bills.push({ id: "tax", label: "TAX", amount: 700, dueDateOfMonth: 10 });
    s.billsPaid["2026-08"].ins = { paid: true, amount: 900, paidDate: "2026-08-10", createdAt: 0 };
    s.billsPaid["2026-08"].tax = { paid: true, amount: 700, paidDate: "2026-08-10", createdAt: 0 };
    const safe = B.shortfallReport(s, "safe");
    const after = B.shortfallReport(s, "tight");
    const heavy = after.notes.find(n => n.kind === "heaviestDay");
    t.is("it names the post-payday pile-up", heavy && heavy.date, "2026-09-10");
    t.eq("totalling both bills", heavy.amount, 1600);
    t.ok("safe blames its own day, not that one",
      (safe.notes.find(n => n.kind === "heaviestDay") || {}).date !== "2026-09-10");
    t.is("the columns open at the payday balance", after.balanceDate, "2026-09-01");
    t.eq("and still reconcile", after.available - after.claimed, after.amount);
    t.ok("listing only post-payday claims", after.claims.every(c => c.date > "2026-09-01"));
  }

  t.section("Costed notes are read off the figure that was tapped");
  {
    const s = base();
    s.income.push({ id: "inc2", label: "SIDE JOB", amount: 500, dueDateOfMonth: 10, frequency: "monthly" });
    const safeNote = B.shortfallReport(s, "safe").notes.find(n => n.kind === "income");
    const afterNote = B.shortfallReport(s, "tight").notes.find(n => n.kind === "income");
    t.ok("both panels raise the unlogged paycheck", !!safeNote && !!afterNote);
    // The what-if dates the entry to the landing's own pay day (Aug 10), which
    // predates the Aug 22 balance check — the money is already inside that
    // balance, so logging it correctly moves nothing.
    const logIt = c => {
      c.incomeLog = (c.incomeLog || []).concat([{
        id: "w", incomeId: "inc2", landingIndex: 0, amount: 500,
        month: "2026-08", date: "2026-08-10", createdAt: Date.now(), tithe: true
      }]);
    };
    t.eq("safe's what-if reads safe to spend", safeNote.after, B.whatIfSafeToSpend(s, logIt));
    t.eq("after-payday's reads the after-payday figure", afterNote.after, B.whatIfTightest(s, logIt));

    // Same paycheck, balance confirmed BEFORE that pay day: now it really does add.
    const s2 = JSON.parse(JSON.stringify(s));
    s2.balanceChecks = [{ id: "a", date: "2026-08-05", amount: 300, createdAt: 1 }];
    const n2 = B.shortfallReport(s2, "safe").notes.find(n => n.kind === "income");
    t.eq("logging lifts the figure when the balance predates the pay day",
      n2.after - B.cashFlowOutlook(s2).windowLow, 500);
  }

  t.section("A single bill on a day is not called a pile-up");
  {
    const s = base();
    s.balanceChecks[0].amount = 5000;
    s.bills = [{ id: "car", label: "CAR", amount: 400, dueDateOfMonth: 25 }];
    s.billsPaid = {};
    const kinds = B.shortfallReport(s, "tight").notes.map(n => n.kind);
    t.is("no heaviest-day note for a lone bill", kinds.includes("heaviestDay"), false);
    t.is("no biggest-claim note with fewer than two outflows", kinds.includes("biggestClaim"), false);
  }

  t.section("The two figures split the horizon at the next payday");
  {
    const s = base();
    const o = B.cashFlowOutlook(s);
    t.eq("safe carries the pre-payday dip", o.windowLow, -180);
    t.ok("after-payday reports a different day", o.afterLowDate !== o.windowLowDate);
    t.ok("on the far side of payday", o.afterLowDate >= o.windowEnd);
    t.is("the whole-horizon low is still there for other callers", o.low, o.windowLow);
    t.is("but it is not what the right-hand figure shows", o.afterLow === o.low, false);
  }
  {
    const s = base();
    s.balanceChecks[0].amount = 2000;
    s.bills.push({ id: "ins", label: "INSURANCE", amount: 3000, dueDateOfMonth: 10 });
    s.billsPaid["2026-08"].ins = { paid: true, amount: 3000, paidDate: "2026-08-10", createdAt: 0 };
    const o = B.cashFlowOutlook(s);
    t.ok("a dip past payday is caught by the right-hand figure", o.afterLowDate > o.windowEnd);
    t.eq("and it equals the whole-horizon low", o.afterLow, o.low);
  }
  {
    // Nothing goes out after payday: that stretch is at its lowest on payday.
    const s = base();
    s.balanceChecks[0].amount = 5000;
    s.bills = [];
    s.billsPaid = {};
    const o = B.cashFlowOutlook(s);
    t.is("dated to the payday itself", o.afterLowDate, o.windowEnd);
  }
  {
    // No paycheck at all in the horizon: there is no "after" to report.
    const s = base();
    s.income = [];
    const o = B.cashFlowOutlook(s);
    t.is("hasAfter is false", o.hasAfter, false);
    t.is("and there is no window end", o.windowEnd, null);
    t.eq("the figure falls back to the plain low", o.afterLow, o.low);
  }

  t.section("Tithe rides on the next pay day, never dumped on today");
  {
    const s = base();
    s.settings.titheEnabled = true;
    s.balanceChecks[0].amount = 1400;
    s.incomeLog.forEach(e => { e.tithe = true; });
    const o = B.cashFlowOutlook(s);
    t.eq("owed on this month's income", B.unpaidTithe(s), 300);
    // Nothing left to land in August, so August's tithe rides on Sep 1 rather
    // than being knocked off today. 1400 -400 -80 = 920; Sep 1 +1500,
    // -150 September tithe, -300 August tithe, -1200 rent = 770.
    const titheEvents = B.horizonEvents(s).filter(e => e.kind === "tithe");
    t.is("nothing is charged against today", titheEvents.some(e => e.date === o.startISO), false);
    t.is("it rides on the next pay day", titheEvents[0].date, "2026-09-01");
    t.eq("safe to spend after tithe", o.windowLow, 770);
    // Deferred, never forgiven: August's 300 plus September's own 150 x 2.
    t.eq("the whole amount is still in the walk",
      titheEvents.reduce((a, e) => a + -e.amount, 0), 600);
  }

  t.section("Degenerate states do not crash");
  {
    const s = base();
    s.currentMonth = "2026-07";
    s.billsPaid = {};
    s.incomeLog = [];
    t.is("browsing a past month starts at its 1st", B.cashFlowOutlook(s).startISO, "2026-07-01");
  }
  {
    const o = B.cashFlowOutlook({ currentMonth: "2026-08", settings: {} });
    t.eq("no balance, no income, no bills", o.low, 0);
    t.is("no anchor", B.hasAnchor({ currentMonth: "2026-08", settings: {} }), false);
  }

  return t.report();
};
