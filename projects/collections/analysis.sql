-- Synthetic case-study data. No real company records.
SELECT "status", COUNT(*) AS records, ROUND(SUM("open_usd"),2) AS value
FROM "collections"
GROUP BY "status"
ORDER BY records DESC;
