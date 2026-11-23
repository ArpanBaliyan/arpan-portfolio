-- Synthetic case-study data. No real company records.
SELECT "week", COUNT(*) AS records, ROUND(SUM("receipts_usd"),2) AS value
FROM "cash_flow"
GROUP BY "week"
ORDER BY records DESC;
