# Westline AR Command Center

Phase 3 of the Westline collections portfolio. A collections, credit and chargeback system for a fictional four-yard parts distributor in California, built on Google Sheets and Apps Script.

**Live page:** `https://YOUR-USERNAME.github.io/westline-command-center/` · **All three phases:** `portfolio.html`

## What it does every morning

| Output | What it is |
| --- | --- |
| Owner brief | Promises due today, deadlines, accounts still ordering while late, and a meeting agenda, by email and in a sheet |
| Call lists | One ranked list per agent, cut at their daily capacity, each row with the reason and the next action |
| Account 360 | One row per account joining eight sources: AR, customer master, calls, requests, escalations, chargebacks, alerts, sales |
| Management review | Accounts out of normal options, with the rules that put them there and a recommended route |
| Credit review | A limit for every account sized to one buying cycle, a seven-part risk score, gates, and reasons in plain words |
| Chargebacks | Reason-code map across Visa, Mastercard, Amex and Discover, deadline control, root cause, rebuttal drafts as Google Docs |
| Team scorecards | Aging-weighted, compared with the team rate for the same mix of buckets; weekly random audit sample |
| Allocation | A proposal that balances workload by difficulty while keeping existing owners |
| Data cleaning | A clean customer master, every change explained, probable duplicates, and a fix queue that remembers corrections |

## How it stays accurate

Every run reconciles before it publishes. The AR export, the cleaned invoices and the sum of every account must agree to the cent; buckets are totalled two independent ways; every call must belong to a known agent; every worklist may hold only its own agent's accounts. If a blocking check fails, nothing is overwritten. Credit limits, data fixes and reassignments change only when a person approves them, and each decision is logged.

## Files

```
index.html, portfolio.html     the pages
css/, js/                      design and rendering (SVG charts, no libraries)
data/command-center.js         the engine output shown on the page
engine/core.js                 parsers, data contracts, cleaners
engine/engine.js               Account 360, scoring, lanes, credit, team, allocation, chargebacks, reconciliation
engine/demo.js                 seeded generator for the synthetic exports
engine/tests.js                44 tests on hand-calculated examples
apps-script/gas.js             the Google layer: reads sheets, writes tabs, emails, Docs, charts, menu
apps-script/Westline_AR_Command_Center.gs   everything above in one file to paste into Apps Script
```

## Run it

In Google Sheets: Extensions → Apps Script, paste `apps-script/Westline_AR_Command_Center.gs`, save, reload, then **AR Center → 1. Set up and run the demo**. Locally: `node engine/tests.js`.

## Data

Westline is fictional and every record is synthetic. The phase 1 workbook supplies the accounts, open invoices, call log and requests; the generator builds the remaining exports from them so every source agrees.
