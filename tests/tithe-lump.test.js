/* Tithe can be ticked two ways, and only one of them can count.
 *
 * The Bills tab offers a share per pay day AND a single GIVEN AS ONE LUMP tick
 * in the same expanded panel. Nothing clears the other, so tapping both leaves
 * records describing the same giving twice. The lump means "the whole month, in
 * one go" and wins outright.
 *
 * That rule used to live only in the Bills tab renderer. The screen therefore
 * showed the tithe covered once while projectedBalance subtracted it twice, and
 * Safe To Spend silently lost the difference. It lives in BudgetEngine now, so
 * the display and the math cannot disagree.
 */
const { setToday, suite } = require("./harness");
const { BudgetEngine: B } = require("./engine");

function household() {
  return {
    settings: { mode: "couple", names: ["A", "B"], tithePercent: 10, titheEnabled: true, debtStrategy: "avalanche" },
    currentMonth: "2026-08",
    // Fortnightly pay, so the month has two landings and the expanded panel
    // shows both the per-pay-day ticks and the lump tick together.
    income: [{ id: "inc1", label: "SALARY", amount: 1500, dueDateOfMonth: 7, frequency: "biweekly" }],
    incomeLog: [
      { id: "L0", incomeId: "inc1", label: "SALARY", amount: 1500, date: "2026-08-07", month: "2026-08", createdAt: 10, landingIndex: 0 },
      { id: "L1", incomeId: "inc1", label: "SALARY", amount: 1500, date: "2026-08-21", month: "2026-08", createdAt: 20, landingIndex: 1 }
    ],
    bills: [], spendingCategories: [], transactions: [],
    billsPaid: { "2026-08": {} }, billAmounts: {},
    balanceChecks: [{ id: "a1", date: "2026-08-01", amount: 4000, createdAt: 1 }],
    categoryFunding: {}, monthlyRollover: {}, debts: [], creditCards: [], banks: []
  };
}

module.exports = function run() {
  const t = suite("tithe ticked as a lump and per pay day is still one tithe");
  setToday("2026-08-20");

  const shares = B.titheLandings(household(), "2026-08");
  const owed = B.tithe(household());

  t.section("the shares still add up to the row above them");
  t.is("two pay days this month", shares.length, 2);
  t.eq("and their shares sum to the TITHE row", shares.reduce((a, l) => a + l.share, 0), owed, 0.005);

  // Every pay day ticked: the tithe has been given in full.
  const byShares = household();
  shares.forEach(l => {
    byShares.billsPaid["2026-08"][l.key] =
      { paid: true, paidDate: l.date, amount: l.share, source: "tick", createdAt: 3000 };
  });

  // The lump ticked instead: the same real-world fact, recorded the other way.
  const byLump = household();
  byLump.billsPaid["2026-08"]["tithe"] =
    { paid: true, paidDate: "2026-08-07", amount: owed, source: "tick", createdAt: 3000 };

  // Both tapped, which the panel allows and nothing prevents.
  const byBoth = household();
  shares.forEach(l => {
    byBoth.billsPaid["2026-08"][l.key] =
      { paid: true, paidDate: l.date, amount: l.share, source: "tick", createdAt: 3000 };
  });
  byBoth.billsPaid["2026-08"]["tithe"] =
    { paid: true, paidDate: "2026-08-07", amount: owed, source: "tick", createdAt: 3100 };

  t.section("the two ways of recording it agree");
  t.eq("given per pay day", B.tithePaidIn(byShares, "2026-08"), owed);
  t.eq("given as one lump", B.tithePaidIn(byLump, "2026-08"), owed);
  t.eq("recorded both ways, still one tithe", B.tithePaidIn(byBoth, "2026-08"), owed);

  t.section("so the balance is carried forward by the same amount either way");
  const anchorOf = s => B.latestAnchor(s);
  t.eq("per pay day", B.billPaymentsSinceAnchor(byShares, anchorOf(byShares)), owed);
  t.eq("as one lump", B.billPaymentsSinceAnchor(byLump, anchorOf(byLump)), owed);
  t.eq("both ways, not twice", B.billPaymentsSinceAnchor(byBoth, anchorOf(byBoth)), owed);

  t.section("and Safe To Spend does not move when the second tick is added");
  const safeShares = B.safeToSpend(byShares);
  t.eq("lump matches per pay day", B.safeToSpend(byLump), safeShares);
  t.eq("ticking both changes nothing", B.safeToSpend(byBoth), safeShares);
  t.eq("nothing is left owing in any of them", B.unpaidTithe(byBoth), 0);

  t.section("a pre-split record still answers for the first pay day");
  {
    const legacy = household();
    legacy.billsPaid["2026-08"]["tithe:inc1"] =
      { paid: true, paidDate: "2026-08-07", amount: shares[0].share, source: "tick", createdAt: 2500 };
    t.eq("counted once, under the old key", B.tithePaidIn(legacy, "2026-08"), shares[0].share);
    t.eq("and it leaves the rest of the month owing", B.unpaidTithe(legacy), owed - shares[0].share);
  }

  t.section("a tick against an income source that has since been deleted still counts");
  {
    const orphan = household();
    orphan.billsPaid["2026-08"]["tithe:gone:0"] =
      { paid: true, paidDate: "2026-08-07", amount: 40, source: "tick", createdAt: 2600 };
    t.eq("the money left the account, so it keeps counting", B.tithePaidIn(orphan, "2026-08"), 40);
  }

  t.section("a record written by an import is not counted twice");
  {
    const imported = household();
    imported.billsPaid["2026-08"]["tithe"] =
      { paid: true, paidDate: "2026-08-07", amount: owed, source: "import", txnId: "t-import", createdAt: 3000 };
    t.eq("the transaction already carries it", B.billPaymentsSinceAnchor(imported, anchorOf(imported)), 0);
    t.eq("but it still reads as given", B.tithePaidIn(imported, "2026-08"), owed);
  }

  return t.report();
};
