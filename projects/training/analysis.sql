-- Synthetic case-study data. No real company records.
SELECT "module", COUNT(*) AS records, ROUND(AVG("score_pct"),2) AS value
FROM "training"
GROUP BY "module"
ORDER BY records DESC;
