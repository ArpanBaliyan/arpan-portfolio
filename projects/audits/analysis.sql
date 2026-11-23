-- Synthetic case-study data. No real company records.
SELECT "status", COUNT(*) AS records, ROUND(AVG("score_pct"),2) AS value
FROM "audits"
GROUP BY "status"
ORDER BY records DESC;
