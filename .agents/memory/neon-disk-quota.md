---
name: Neon disk quota overflow
description: The activities table can fill Neon's 10 GB free-plan limit; how we detected it and the fix.
---

# Neon disk quota overflow

## The rule
Any schema that logs per-second activity from multiple machines will hit Neon's 10 GB free-plan limit. Always use a short retention policy (30 days max) + batch-deletion cleanup on startup.

**Why:** At ~1.4 KB/row and ~10k rows/day the table grows ~14 MB/day; 30 days = ~420 MB, well within the limit. Without cleanup, 7M rows = 10 GB in ~2 months.

**How to apply:** `cleanOldData()` in `services/databaseStorage.js` runs in batches of 50k with 200ms pauses. It is called via `setImmediate()` on every server startup AND daily via `setInterval`. `schema.sql` `clean_old_data()` function is kept in sync at 30 days.

## Recovery procedure when disk is full
1. Neon error code `53100` = `disk_full`. DELETE still works (doesn't extend files). INSERT/UPDATE fail.
2. Run batched DELETEs via `psql "$DATABASE_URL"`:
   ```sql
   DELETE FROM activities WHERE id IN (
     SELECT id FROM activities WHERE timestamp < NOW() - INTERVAL '30 days' LIMIT 100000
   );
   ```
   Repeat until `DELETE 0`.
3. Run `VACUUM (VERBOSE, ANALYZE) activities` — marks freed pages as reusable.
4. Test INSERT to confirm space is available: pages are reused before the file extends, so INSERT succeeds even if `pg_total_relation_size()` still shows the old size.

## Key insight
`pg_total_relation_size()` does NOT shrink after DELETE+VACUUM in the short term — the file size stays the same but freed pages are reused for new INSERTs. New data does NOT trigger disk_full as long as vacuumed free space covers it.
