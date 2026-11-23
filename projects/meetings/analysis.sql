-- Synthetic case-study data. No real company records.
SELECT "status", COUNT(*) AS records
FROM "meetings"
GROUP BY "status"
ORDER BY records DESC;
