-- Synthetic case-study data. No real company records.
SELECT "stage", COUNT(*) AS records, ROUND(AVG("elapsed_hours"),2) AS value
FROM "operations"
GROUP BY "stage"
ORDER BY records DESC;
