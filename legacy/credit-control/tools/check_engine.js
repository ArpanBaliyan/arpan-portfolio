// Runs the engine on the sample data and prints the key numbers.
// Usage: node tools/check_engine.js
const fs = require("fs");
const path = require("path");
const E = require("../js/engine.js");

const dir = path.join(__dirname, "..", "data");
const inv = E.readInvoices(fs.readFileSync(path.join(dir, "invoices.csv"), "utf8"));
const cus = E.readCustomers(fs.readFileSync(path.join(dir, "customers.csv"), "utf8"));
if (inv.error || cus.error) { console.error(inv.error || cus.error); process.exit(1); }

const t0 = Date.now();
const m = E.buildModel(inv.invoices, cus.customers, {});
const f = E.forecast(m);
const bt = E.backtest(inv.invoices, cus.customers, m.asOf);
console.log("time ms", Date.now() - t0, "as of", new Date(m.asOf).toISOString().slice(0, 10));
const s = m.summary;
console.log("accounts", s.accounts, "open", E.money(s.open), "past due", E.money(s.pastDue), "60+", E.money(s.over60));
for (const [k, v] of Object.entries(s.bands)) console.log(" ", k, v.accounts, E.money(v.open), "EL", E.money(v.expectedLoss));
console.log("actions", s.actions);
console.log("no limit", s.noLimit, "over limit", s.overLimit, E.money(s.overLimitAmount), "buys >3x limit", s.over3x, "limit >3x need", s.under3x, "dormant", s.dormant, E.money(s.dormantAmount));
console.log("limits on file", E.money(s.limitsOnFile), "recommended", E.money(s.recommendedTotal), "stale", s.staleLimits, "/", s.limitsCount);
console.log("setters", s.setters.map(x => `${x.name}: ${x.off}/${x.count}`).join(" | "));
console.log("forecast open", E.money(f.totalOpen), "new", E.money(f.totalNew));
console.log("weeks", f.fromOpen.map((v, i) => Math.round((v + f.fromNew[i]) / 1000)).join(" "));
if (bt) {
  console.log("backtest from", new Date(bt.start).toISOString().slice(0, 10), "pred", E.money(bt.totalPredicted), "actual", E.money(bt.totalActual),
    "total err", (bt.totalError * 100).toFixed(1) + "%", "weekly MAPE", (bt.weeklyMape * 100).toFixed(1) + "%", "first4", (bt.first4Error * 100).toFixed(1) + "%");
  console.log(" pred", bt.predicted.map(v => Math.round(v / 1000)).join(" "));
  console.log(" act ", bt.actual.map(v => Math.round(v / 1000)).join(" "));
}
const sc = E.scenario(m, { severe: "card", capHigh: true, lostShare: 0.4 });
console.log("scenario", Object.fromEntries(Object.entries(sc).filter(([k, v]) => typeof v === "number").map(([k, v]) => [k, Math.round(v)])));
// archetype check: show top 8 by score
m.accounts.filter(a => a.active).sort((a, b) => b.score - a.score).slice(0, 8).forEach(a =>
  console.log(a.id, a.name, a.score, a.band, a.action, "dbt", a.effectiveDbt && a.effectiveDbt.toFixed(0), "trend", a.trend && a.trend.toFixed(0), "open", E.money(a.open), "lim", E.money(a.limit), "rec", E.money(a.recLimit)));
