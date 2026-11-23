# Westline Credit Control

A credit review and 13-week cash forecast for a B2B parts distributor that sells on credit. It scores every account, recommends the right credit limit and who signs it off, forecasts cash invoice by invoice, tests that forecast against real cash, and shows what tightening credit would cost.

It runs entirely in the browser. There is no server, nothing is uploaded, and it works on your own AR export.

**Live tool:** `https://YOUR-USERNAME.github.io/westline-credit-control/`

## What it found in the Westline sample

Westline Auto Parts is a fictional four-yard distributor selling on credit to 520 body shops, repair shops, dealers and fleets. All data is synthetic.

- 57% of credit limits on file are more than 50% above or 33% below what the account needs. 399 of 481 limits have not been reviewed in over a year.
- 169 accounts owe more than their limit; 39 buy on credit with no limit at all.
- The 13-week cash forecast, run as if it were 31 July 2026, came within 2.0% of the cash that actually arrived ($2.11M forecast, $2.07M actual).
- At a 30% gross margin, refusing orders from the riskiest accounts only breaks even if 86% of them would fail within a year. Moving them to card or prepay breaks even at 43%.

## What's inside

| Screen | What it does |
| --- | --- |
| Overview | Headline findings, limit-on-file vs limit-needed map, risk bands, who set the limits |
| Accounts | Every account with risk score, balance, days late, trend and limit use; opens a printable credit memo |
| Limit review | Raise, lower, set, close or move to card/prepay, with the approver for each change; downloads as CSV |
| Cash forecast | 13 weeks, from open invoices and from new sales, plus a back-test against actual cash |
| What if | Credit loss avoided against margin given up for four policies, with the break-even failure rate |
| How it works | Every rule, threshold and assumption |
| Use your data | Load your own invoice and customer CSV files |

## Method in brief

- **Risk score (0–100):** seven capped rules: pays late (30), old balance (20), getting worse (15), over limit (15), returned payments (10), disputes (5), broken promises (5). Bands: Low 0–19, Watch 20–39, High 40–59, Severe 60+.
- **Recommended limit:** need = (average month + ¼ of the gap to the busiest month) × (terms + 15 days) ÷ 30, then × 1.1 Low, 1.0 Watch, 0.6 High. Severe accounts get no open credit; orders ship on card or prepayment. New accounts are capped at $5,000 for six months.
- **Forecast:** each open invoice is spread over the payment outcomes this customer has actually shown in the last six months that are still possible today, discounted by band, then grouped by week. New sales are each customer's recent weekly buying, paid after its usual number of days.
- **Back-test:** the same model is rebuilt using only data known 13 weeks earlier, and its forecast is compared with the cash that came in.

Full detail is on the How it works page.

## Files

```
index.html                 the page
css/styles.css             layout and design
js/engine.js               every calculation (no screen code)
js/charts.js               SVG charts, no libraries
js/app.js                  the screens
js/config.js               your name and link for the footer
data/                      Westline sample data (CSV and a bundled copy for the page)
fonts/                     IBM Plex Sans and Source Serif 4 (SIL Open Font License)
tools/generate_sample_data.py   builds the synthetic dataset
tools/check_engine.js      runs the engine on the sample and prints the key numbers
```

## Using your own data

**Invoices (required):** customer ID, invoice date and amount. Add due date and paid date (blank if open) for payment scoring and the forecast. Optional: settled_by (payment or credit), disputed (Y/N), returned_payment (Y/N). Column names are matched loosely.

**Customers (optional):** customer_id, credit_limit, terms_days, limit_set_by, limit_set_date, account_opened, card_on_file, broken_promises_90d, plus name, yard and segment.

Templates are on the Use your data page.

## Run locally

Open `index.html` in a browser. No install needed.

To rebuild the sample data and check the numbers:

```
python3 tools/generate_sample_data.py
node tools/check_engine.js
```

## Limits

This uses only the company's own invoices. A full credit review also checks trade references, a business credit report and, for large limits, financial statements. The default rates in the what-if are planning assumptions and should be replaced with the company's own write-off history.
