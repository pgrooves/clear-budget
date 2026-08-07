/* The anonymized export handed to an AI.
 *
 * Two things have to hold at once, and they pull against each other:
 *
 *   1. It must carry enough history to answer "what is keeping me from being
 *      debt free" — three months of transactions, per-category trends, and what
 *      was actually paid to debt each month.
 *   2. It must never carry a merchant, a note, an account, or a name. Widening
 *      the window widens the blast radius of a leak, so the privacy assertions
 *      below run over every month in the window, not just the current one.
 */
const { setToday, suite } = require("./harness");
const { AnonExport: A } = require("./engine");

module.exports = function run() {
  const t = suite("anon export — three months of history, none of the identity");
  // Early in August, so August is a part-month and June/July are complete.
  setToday("2026-08-06");

  // Sentinels. Every one of these is real user text the export reads past on
  // its way to something else; if any appears in the output, something started
  // copying rows wholesale again.
  const LEAKS = [
    "WALMART SUPERCENTER", "CHEVRON 4471", "DR NGUYEN DDS", "AT&T",
    "birthday gift for mom", "loan from dad", "TREY", "SAVANNAH", "H7K2P9QX4M",
    // Per-occurrence notes are free text the user types against one landing of
    // a bill — "9 HRS, MARIA OFF SICK" is exactly the kind of thing that ends
    // up in there. The export reads occurrences for their amounts, so this is
    // one field away from being copied out with them.
    "9 HRS, MARIA OFF SICK"
  ];

  const txn = (o) => Object.assign({
    id: "t" + Math.random().toString(36).slice(2, 9),
    amount: 0, paymentType: "debit", person: "JOINT",
    merchant: "WALMART SUPERCENTER", note: "birthday gift for mom", createdAt: 1
  }, o);

  const base = () => ({
    householdCode: "H7K2P9QX4M",
    currentMonth: "2026-08",
    settings: {
      mode: "couple", names: ["TREY", "SAVANNAH"],
      titheEnabled: false, tithePercent: 10, debtStrategy: "avalanche"
    },
    balanceChecks: [{ id: "a", date: "2026-08-04", amount: 1800, createdAt: 1 }],
    income: [{ id: "inc1", label: "TREY PAYCHECK", amount: 3000, dueDateOfMonth: 1, frequency: "semimonthly" }],
    incomeLog: [
      { id: "l1", incomeId: "inc1", amount: 3000, month: "2026-06", date: "2026-06-01", createdAt: 0 },
      { id: "l2", incomeId: "inc1", amount: 3000, month: "2026-06", date: "2026-06-16", createdAt: 0 },
      { id: "l3", incomeId: "inc1", amount: 3000, month: "2026-07", date: "2026-07-01", createdAt: 0 },
      { id: "l4", incomeId: "inc1", amount: 3000, month: "2026-07", date: "2026-07-16", createdAt: 0 },
      { id: "l5", incomeId: "inc1", amount: 3000, month: "2026-08", date: "2026-08-01", createdAt: 0 }
    ],
    bills: [
      { id: "rent", label: "RENT", amount: 1500, dueDateOfMonth: 1 },
      { id: "net", label: "AT&T INTERNET", amount: 90, dueDateOfMonth: 12 }
    ],
    billsPaid: {
      "2026-06": { rent: { paid: true, amount: 1500, paidDate: "2026-06-01", createdAt: 0 },
                   net: { paid: true, amount: 90, paidDate: "2026-06-12", createdAt: 0 } },
      "2026-07": { rent: { paid: true, amount: 1500, paidDate: "2026-07-01", createdAt: 0 } },
      "2026-08": { rent: { paid: true, amount: 1500, paidDate: "2026-08-01", createdAt: 0 } }
    },
    billAmounts: {},
    billOccEdits: {
      "2026-06": { rent: { day: 3, note: "9 HRS, MARIA OFF SICK" } },
      "2026-07": { rent: { note: "9 HRS, MARIA OFF SICK" } },
      "2026-08": { rent: { day: 2, note: "9 HRS, MARIA OFF SICK" } }
    },
    spendingCategories: [
      { id: "cat-food", label: "GROCERIES", budgeted: 600 },
      { id: "cat-out", label: "EATING OUT", budgeted: 200 },
      { id: "cat-fun", label: "TREY FUN MONEY", budgeted: 150 }
    ],
    monthlyRollover: {},
    categoryFunding: {},
    debts: [
      { id: "d-card", label: "CHASE FREEDOM", balance: 6200, originalBalance: 8000, minimumPayment: 155, interestRate: 26.9, cardId: "card1" },
      { id: "d-car", label: "CAR LOAN", balance: 11000, originalBalance: 20000, minimumPayment: 380, interestRate: 6.9 }
    ],
    creditCards: [{ id: "card1", label: "CHASE FREEDOM", debtId: "d-card", dueDateOfMonth: 20 }],
    banks: [{ id: "b1", label: "TREY CHECKING" }],
    transactions: [
      // Outside the window: May. Uniquely-sized so it is findable by amount.
      txn({ amount: 987.65, month: "2026-05", date: "2026-05-14", categoryId: "cat-food", categoryType: "spending" }),
      // June — complete.
      txn({ amount: 420.11, month: "2026-06", date: "2026-06-03", categoryId: "cat-food", categoryType: "spending" }),
      txn({ amount: 188.40, month: "2026-06", date: "2026-06-09", categoryId: "cat-out", categoryType: "spending", merchant: "CHEVRON 4471" }),
      txn({ amount: 90.00, month: "2026-06", date: "2026-06-12", categoryId: "net", categoryType: "bill" }),
      txn({ amount: 535.00, month: "2026-06", date: "2026-06-20", categoryId: "d-card", categoryType: "debt" }),
      txn({ amount: 380.00, month: "2026-06", date: "2026-06-22", categoryId: "d-car", categoryType: "debt" }),
      // July — complete, and worse: eating out doubles, debt payment drops.
      txn({ amount: 512.30, month: "2026-07", date: "2026-07-02", categoryId: "cat-food", categoryType: "spending" }),
      txn({ amount: 402.75, month: "2026-07", date: "2026-07-11", categoryId: "cat-out", categoryType: "spending", note: "loan from dad" }),
      txn({ amount: 100.00, month: "2026-07", date: "2026-07-20", categoryId: "d-card", categoryType: "debt", paymentType: "debit" }),
      txn({ amount: 380.00, month: "2026-07", date: "2026-07-22", categoryId: "d-car", categoryType: "debt" }),
      txn({ amount: 61.25, month: "2026-07", date: "2026-07-25", source: "import" }),
      // A row assigned to a category that has since been deleted.
      txn({ amount: 240.00, month: "2026-07", date: "2026-07-28", categoryId: "cat-gone", categoryType: "spending", merchant: "DR NGUYEN DDS" }),
      // August — part-month.
      txn({ amount: 130.05, month: "2026-08", date: "2026-08-02", categoryId: "cat-food", categoryType: "spending", person: "TREY" }),
      txn({ amount: 75.50, month: "2026-08", date: "2026-08-04", categoryId: "cat-fun", categoryType: "spending", person: "SAVANNAH", paymentType: "credit", cardId: "card1" })
    ]
  });

  const s = base();
  const out = A.buildAnonymizedExport(s);

  t.section("The window is three months, oldest first, ending on the month in view");
  {
    t.is("three months wide", A.ANON_WINDOW_MONTHS, 3);
    const w = A.anonMonthWindow("2026-08");
    t.is("oldest first", w.join(","), "2026-06,2026-07,2026-08");
    t.is("a malformed month falls back to today's rather than repeating itself",
      new Set(A.anonMonthWindow("nonsense")).size, 3);
    t.is("and it steps across a year boundary correctly",
      A.anonMonthWindow("2027-01").join(","), "2026-11,2026-12,2027-01");
  }

  t.section("All three months are actually in the file");
  {
    ["June 2026", "July 2026", "August 2026"].forEach(m => {
      t.ok(m + " has its own transaction block", out.indexOf("--- " + m) >= 0);
    });
    // One line per transaction in the window, and none from outside it.
    const rows = out.split("\n").filter(l => /^(Day \d+|Day unknown|Dated )/.test(l));
    const inWindow = s.transactions.filter(x => x.month !== "2026-05").length;
    t.is("every transaction in the window is itemized", rows.length, inWindow);
    t.ok("and the month before the window is not", out.indexOf("987.65") < 0);
  }

  t.section("Nothing identifying survives, in any month");
  {
    LEAKS.forEach(leak => {
      t.ok("no sign of " + JSON.stringify(leak),
        out.toLowerCase().indexOf(leak.toLowerCase()) < 0);
    });
    t.ok("a category named after a person is renamed", out.indexOf("Person A Fun Money") >= 0);
    t.ok("and the people are only ever A and B", out.indexOf("Person B") >= 0);
    t.ok("a bill with a carrier's name in it is genericized", out.indexOf("Internet:") >= 0);
    t.ok("a card debt is typed even though its label says nothing", out.indexOf("(credit card)") >= 0);
  }

  t.section("Every month's buckets add up to that month's total");
  {
    ["2026-06", "2026-07", "2026-08"].forEach(m => {
      const f = A.anonMonthFacts(s, m);
      t.eq(m + ": bills + debt + variable + unassigned = total",
        f.billSpend + f.debtSpend + f.variableSpend + f.unassignedSpend, f.total, 0.005);
      t.eq(m + ": checking + credit = total", f.debit + f.credit, f.total, 0.005);
    });
    const july = A.anonMonthFacts(s, "2026-07");
    t.eq("July's debt payments", july.debtSpend, 480, 0.005);
    t.eq("July's income logged", july.income, 6000, 0.005);
    t.eq("July's unassigned spending", july.unassignedSpend, 61.25, 0.005);
    // The deleted category's row is spending, not unassigned: the money was
    // attributed, the category just no longer exists.
    t.eq("July's variable spending includes the deleted category's row",
      july.variableSpend, 512.30 + 402.75 + 240, 0.005);
  }

  t.section("A part-month is labelled as one everywhere it appears");
  {
    t.ok("the preamble says August is still running", /August 2026 is still running: day 6 of 31/.test(out));
    t.ok("its transaction block says so too", out.indexOf("--- August 2026 (still running)") >= 0);
    t.ok("a completed month is marked complete", out.indexOf("--- July 2026 (complete)") >= 0);
    t.ok("the category trend tags it", out.indexOf("August 2026 (partial)") >= 0);
    t.ok("averages are taken over the completed months only",
      out.indexOf("Averages over the 2 completed month(s):") >= 0);
  }

  t.section("The trend sections say what the trend actually is");
  {
    const line = out.split("\n").find(l => l.indexOf("Eating Out: budget $") === 0);
    t.ok("each category prints all three months", !!line && /June 2026 \$188\.40/.test(line)
      && /July 2026 \$402\.75/.test(line) && /August 2026 \(partial\) \$0\.00/.test(line), line);
    t.ok("with the average of the completed months against its budget",
      !!line && /average of completed months \$295\.5\d, \$95\.5\d over budget/.test(line), line);
    t.ok("categories are ranked by what they took", /1\. Groceries: \$932\.41/.test(out));
    t.ok("debt payments are given month by month", /June 2026: \$915\.00 paid/.test(out));
    t.ok("and a month that fell short of the minimums says so", /July 2026: \$480\.00 paid.*\$55\.00 short/.test(out));
    t.ok("a row assigned to a deleted category is not called uncategorized",
      out.indexOf("Assigned to a spending category no longer in the budget") >= 0);
  }

  t.section("The prompt asks the question the file was widened to answer");
  {
    const p = A.COACH_PROMPT.toLowerCase();
    t.ok("it mentions the three months of transactions", p.indexOf("three months") >= 0);
    t.ok("it asks what the trends are", p.indexOf("trend") >= 0);
    t.ok("it asks what is keeping them from being debt free",
      p.indexOf("keeping me from being debt free") >= 0);
    t.ok("it asks for what should follow", p.indexOf("what should follow") >= 0);
    t.ok("it warns that the current month is partial", p.indexOf("part-way through") >= 0);
  }

  t.section("Degenerate states do not throw");
  {
    const empty = {
      currentMonth: "2026-08", settings: {}, income: [], incomeLog: [], bills: [], billsPaid: {},
      spendingCategories: [], debts: [], transactions: [], creditCards: [], banks: [], balanceChecks: []
    };
    let ok = true, why = "";
    try { A.buildAnonymizedExport(empty); } catch (e) { ok = false; why = String(e && e.message); }
    t.ok("an empty household still exports", ok, why);
    let ok2 = true, why2 = "";
    try { A.buildAnonymizedExport({}); } catch (e) { ok2 = false; why2 = String(e && e.message); }
    t.ok("so does a state with nothing in it at all", ok2, why2);
  }

  return t.report();
};
