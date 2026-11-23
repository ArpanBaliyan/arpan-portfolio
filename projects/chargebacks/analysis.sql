-- Synthetic case-study data. No real company records.
SELECT "status", COUNT(*) AS records, ROUND(SUM("amount_usd"),2) AS value
FROM "chargebacks"
GROUP BY "status"
ORDER BY records DESC;
