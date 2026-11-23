-- Synthetic case-study data. No real company records.
SELECT "agent", COUNT(*) AS records, ROUND(AVG("quality_pct"),2) AS value
FROM "reviews"
GROUP BY "agent"
ORDER BY records DESC;
