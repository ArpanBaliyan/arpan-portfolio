-- Synthetic case-study data. No real company records.
SELECT "issue", COUNT(*) AS records
FROM "customer_data"
GROUP BY "issue"
ORDER BY records DESC;
