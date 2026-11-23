-- Synthetic case-study data. No real company records.
SELECT "stage", COUNT(*) AS records, ROUND(SUM("opportunity_usd"),2) AS value
FROM "clients"
GROUP BY "stage"
ORDER BY records DESC;
