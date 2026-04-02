const db = require('../database/db');

class DatabaseStorage {
  
  async saveActivity(broadcasterId, activityData) {
    const { installation_id, idle_seconds, active_url, foreground_app, app_count, apps } = activityData;
    
    try {
      await db.query(
        `INSERT INTO activities (broadcaster_id, installation_id, idle_seconds, active_url, foreground_app, app_count, apps_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [broadcasterId, installation_id || null, idle_seconds || 0, active_url, foreground_app, app_count || 0, JSON.stringify(apps || [])]
      );
    } catch (error) {
      console.error('Error saving activity:', error);
      throw error;
    }
  }
  
  async saveBrowserHistory(broadcasterId, installationId, historyEntries) {
    if (!historyEntries || historyEntries.length === 0) {
      return;
    }
    
    const crypto = require('crypto');
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      let savedCount = 0;
      let skippedCount = 0;
      
      for (const entry of historyEntries) {
        const rawTimestamp = entry.timestamp || entry.visit_time;
        
        if (!rawTimestamp) {
          skippedCount++;
          continue;
        }
        
        const parsedDate = new Date(rawTimestamp);
        if (isNaN(parsedDate.getTime())) {
          console.warn(`⚠️ Timestamp inválido ignorado: "${rawTimestamp}" para URL ${entry.url}`);
          skippedCount++;
          continue;
        }
        
        const urlHash = crypto.createHash('md5').update(entry.url).digest('hex');
        
        try {
          await client.query(
            `INSERT INTO browser_history (broadcaster_id, installation_id, browser, url, url_hash, title, visit_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (broadcaster_id, installation_id, browser, url_hash, visit_timestamp) DO NOTHING`,
            [broadcasterId, installationId || null, entry.browser, entry.url, urlHash, entry.title, parsedDate]
          );
          savedCount++;
        } catch (insertError) {
          console.warn(`⚠️ Erro ao inserir entrada de histórico: ${insertError.message}`);
          skippedCount++;
        }
      }
      
      await client.query('COMMIT');
      
      if (savedCount > 0 || skippedCount > 0) {
        console.log(`✅ Histórico salvo: ${savedCount} entradas, ${skippedCount} ignoradas`);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving browser history:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  _safeLimitClause(limit) {
    if (limit == null) return '';
    const n = parseInt(limit, 10);
    return Number.isFinite(n) && n > 0 ? `LIMIT ${n}` : '';
  }

  async getAllActivities(broadcasterIds, startDate, endDate, limit = null) {
    if (!broadcasterIds || broadcasterIds.length === 0) return [];
    const limitClause = this._safeLimitClause(limit);
    const result = await db.query(
      `SELECT a.timestamp, a.idle_seconds, a.active_url, a.foreground_app, a.app_count,
              COALESCE(bi.computer_name, b.name) AS maquina
       FROM activities a
       INNER JOIN broadcasters b ON a.broadcaster_id = b.id
       LEFT JOIN broadcaster_installations bi ON a.installation_id = bi.id
       WHERE a.broadcaster_id = ANY($1::int[])
         AND a.timestamp >= $2
         AND a.timestamp <= $3
       ORDER BY a.timestamp DESC
       ${limitClause}`,
      [broadcasterIds, startDate, endDate]
    );
    return result.rows;
  }

  async getAllBrowserHistory(broadcasterIds, startDate, endDate, limit = null) {
    if (!broadcasterIds || broadcasterIds.length === 0) return [];
    const limitClause = this._safeLimitClause(limit);
    const result = await db.query(
      `SELECT bh.browser, bh.url, bh.title, bh.visit_timestamp,
              COALESCE(bi.computer_name, b.name) AS maquina
       FROM browser_history bh
       INNER JOIN broadcasters b ON bh.broadcaster_id = b.id
       LEFT JOIN broadcaster_installations bi ON bh.installation_id = bi.id
       WHERE bh.broadcaster_id = ANY($1::int[])
         AND bh.visit_timestamp >= $2
         AND bh.visit_timestamp <= $3
       ORDER BY bh.visit_timestamp DESC
       ${limitClause}`,
      [broadcasterIds, startDate, endDate]
    );
    return result.rows.map(row => ({
      maquina: row.maquina,
      browser: row.browser,
      url: row.url,
      title: row.title,
      timestamp: row.visit_timestamp.toISOString()
    }));
  }

  async getActivities(broadcasterId, startDate, endDate, limit = null) {
    const limitClause = this._safeLimitClause(limit);
    const result = await db.query(
      `SELECT id, timestamp, idle_seconds, active_url, foreground_app, app_count, apps_data
       FROM activities
       WHERE broadcaster_id = $1 
         AND timestamp >= $2 
         AND timestamp <= $3
       ORDER BY timestamp DESC
       ${limitClause}`,
      [broadcasterId, startDate, endDate]
    );
    
    return result.rows.map(row => ({
      ...row,
      apps: row.apps_data
    }));
  }
  
  async getBrowserHistory(broadcasterId, startDate, endDate, limit = null) {
    const limitClause = this._safeLimitClause(limit);
    const result = await db.query(
      `SELECT id, browser, url, title, visit_timestamp
       FROM browser_history
       WHERE broadcaster_id = $1
         AND visit_timestamp >= $2
         AND visit_timestamp <= $3
       ORDER BY visit_timestamp DESC
       ${limitClause}`,
      [broadcasterId, startDate, endDate]
    );
    
    return result.rows.map(row => ({
      browser: row.browser,
      url: row.url,
      title: row.title,
      timestamp: row.visit_timestamp.toISOString()
    }));
  }
  
  async getTimePerApp(broadcasterIds, startDate, endDate) {
    if (!broadcasterIds || broadcasterIds.length === 0) return [];
    const result = await db.query(
      `WITH intervals AS (
         SELECT
           COALESCE(bi.computer_name, b.name) AS maquina,
           a.foreground_app,
           DATE(a.timestamp AT TIME ZONE 'America/Sao_Paulo') AS dia,
           COALESCE(a.idle_seconds, 0) AS idle_seconds,
           LEAST(300,
             EXTRACT(EPOCH FROM (
               LEAD(a.timestamp) OVER (PARTITION BY a.broadcaster_id, a.installation_id ORDER BY a.timestamp)
               - a.timestamp
             ))
           ) AS interval_seconds
         FROM activities a
         INNER JOIN broadcasters b ON a.broadcaster_id = b.id
         LEFT JOIN broadcaster_installations bi ON a.installation_id = bi.id
         WHERE a.broadcaster_id = ANY($1::int[])
           AND a.timestamp >= $2
           AND a.timestamp <= $3
       )
       SELECT
         dia,
         maquina,
         COALESCE(foreground_app, '(sem aplicativo)') AS aplicativo,
         ROUND(SUM(GREATEST(0, COALESCE(interval_seconds, 0) - LEAST(idle_seconds, COALESCE(interval_seconds, 0))))) AS tempo_ativo_seg,
         ROUND(SUM(LEAST(idle_seconds, COALESCE(interval_seconds, 0))))                                             AS tempo_inativo_seg,
         ROUND(SUM(COALESCE(interval_seconds, 0)))                                                                  AS tempo_total_seg
       FROM intervals
       WHERE interval_seconds IS NOT NULL AND interval_seconds > 0
       GROUP BY dia, maquina, foreground_app
       ORDER BY dia DESC, tempo_ativo_seg DESC`,
      [broadcasterIds, startDate, endDate]
    );
    return result.rows;
  }

  async getTimePerUrl(broadcasterIds, startDate, endDate) {
    if (!broadcasterIds || broadcasterIds.length === 0) return [];
    const result = await db.query(
      `WITH intervals AS (
         SELECT
           COALESCE(bi.computer_name, b.name) AS maquina,
           COALESCE(a.foreground_app, '(sem aplicativo)') AS aplicativo,
           a.active_url,
           DATE(a.timestamp AT TIME ZONE 'America/Sao_Paulo') AS dia,
           COALESCE(a.idle_seconds, 0) AS idle_seconds,
           LEAST(300,
             EXTRACT(EPOCH FROM (
               LEAD(a.timestamp) OVER (PARTITION BY a.broadcaster_id, a.installation_id ORDER BY a.timestamp)
               - a.timestamp
             ))
           ) AS interval_seconds
         FROM activities a
         INNER JOIN broadcasters b ON a.broadcaster_id = b.id
         LEFT JOIN broadcaster_installations bi ON a.installation_id = bi.id
         WHERE a.broadcaster_id = ANY($1::int[])
           AND a.timestamp >= $2
           AND a.timestamp <= $3
           AND a.active_url IS NOT NULL
           AND a.active_url <> ''
       )
       SELECT
         dia,
         maquina,
         aplicativo,
         active_url AS url,
         ROUND(SUM(GREATEST(0, COALESCE(interval_seconds, 0) - LEAST(idle_seconds, COALESCE(interval_seconds, 0))))) AS tempo_ativo_seg,
         ROUND(SUM(LEAST(idle_seconds, COALESCE(interval_seconds, 0))))                                             AS tempo_inativo_seg,
         ROUND(SUM(COALESCE(interval_seconds, 0)))                                                                  AS tempo_total_seg
       FROM intervals
       WHERE interval_seconds IS NOT NULL AND interval_seconds > 0
       GROUP BY dia, maquina, aplicativo, active_url
       ORDER BY dia DESC, tempo_ativo_seg DESC`,
      [broadcasterIds, startDate, endDate]
    );
    return result.rows;
  }

  async getForegroundSessions(broadcasterIds, startDate, endDate) {
    if (!broadcasterIds || broadcasterIds.length === 0) return [];
    const result = await db.query(
      `WITH all_ranked AS (
         SELECT
           a.broadcaster_id,
           a.installation_id,
           COALESCE(bi.computer_name, b.name) AS maquina,
           a.foreground_app,
           a.timestamp,
           LEAD(a.timestamp) OVER w AS next_ts,
           ROW_NUMBER() OVER w AS rn
         FROM activities a
         INNER JOIN broadcasters b ON a.broadcaster_id = b.id
         LEFT JOIN broadcaster_installations bi ON a.installation_id = bi.id
         WHERE a.broadcaster_id = ANY($1::int[])
           AND a.timestamp >= $2
           AND a.timestamp <= $3
         WINDOW w AS (PARTITION BY a.broadcaster_id, a.installation_id ORDER BY a.timestamp)
       ),
       fg_ranked AS (
         SELECT *,
           ROW_NUMBER() OVER (
             PARTITION BY broadcaster_id, installation_id, foreground_app
             ORDER BY timestamp
           ) AS rn_per_app
         FROM all_ranked
         WHERE foreground_app IS NOT NULL
       )
       SELECT
         broadcaster_id,
         installation_id,
         maquina,
         foreground_app AS aplicativo,
         DATE(MIN(timestamp) AT TIME ZONE 'America/Sao_Paulo') AS dia,
         MIN(timestamp) AS inicio_sessao,
         MAX(COALESCE(next_ts, timestamp)) AS fim_sessao,
         ROUND(SUM(LEAST(300, GREATEST(0,
           EXTRACT(EPOCH FROM (COALESCE(next_ts, timestamp) - timestamp))
         )))) AS tempo_seg
       FROM fg_ranked
       WHERE next_ts IS NOT NULL
       GROUP BY broadcaster_id, installation_id, maquina, foreground_app, (rn - rn_per_app)
       HAVING ROUND(SUM(LEAST(300, GREATEST(0,
         EXTRACT(EPOCH FROM (COALESCE(next_ts, timestamp) - timestamp))
       )))) > 0
       ORDER BY maquina, dia, inicio_sessao`,
      [broadcasterIds, startDate, endDate]
    );
    return result.rows;
  }

  async getBackgroundSessionsForInstallation(broadcasterId, installationId, startDate, endDate) {
    const result = await db.query(
      `WITH all_ranked AS (
         SELECT
           a.foreground_app,
           a.timestamp,
           a.apps_data,
           LEAD(a.timestamp) OVER (ORDER BY a.timestamp) AS next_ts,
           ROW_NUMBER() OVER (ORDER BY a.timestamp) AS rn
         FROM activities a
         WHERE a.broadcaster_id = $1
           AND a.installation_id = $2
           AND a.timestamp >= $3
           AND a.timestamp <= $4
       ),
       bg_exploded AS (
         SELECT
           app_entry->>'app' AS aplicativo,
           timestamp,
           next_ts,
           rn,
           ROW_NUMBER() OVER (
             PARTITION BY app_entry->>'app'
             ORDER BY timestamp
           ) AS rn_per_app
         FROM all_ranked
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN apps_data IS NOT NULL AND jsonb_array_length(apps_data) > 0
                THEN apps_data ELSE '[]'::jsonb END
         ) AS app_entry
         WHERE app_entry->>'app' IS DISTINCT FROM foreground_app
           AND app_entry->>'app' IS NOT NULL
       )
       SELECT
         aplicativo,
         DATE(MIN(timestamp) AT TIME ZONE 'America/Sao_Paulo') AS dia,
         MIN(timestamp) AS inicio_sessao,
         MAX(COALESCE(next_ts, timestamp)) AS fim_sessao,
         ROUND(SUM(LEAST(300, GREATEST(0,
           EXTRACT(EPOCH FROM (COALESCE(next_ts, timestamp) - timestamp))
         )))) AS tempo_seg
       FROM bg_exploded
       WHERE next_ts IS NOT NULL
       GROUP BY aplicativo, (rn - rn_per_app)
       HAVING ROUND(SUM(LEAST(300, GREATEST(0,
         EXTRACT(EPOCH FROM (COALESCE(next_ts, timestamp) - timestamp))
       )))) > 0
       ORDER BY aplicativo, inicio_sessao`,
      [broadcasterId, installationId, startDate, endDate]
    );
    return result.rows;
  }

  async getStatistics(broadcasterId, startDate, endDate) {
    const activitiesResult = await db.query(
      `SELECT 
         COUNT(*) as total_activities,
         SUM(idle_seconds) as total_idle_seconds,
         AVG(app_count) as avg_app_count,
         MAX(timestamp) as last_activity
       FROM activities
       WHERE broadcaster_id = $1
         AND timestamp >= $2
         AND timestamp <= $3`,
      [broadcasterId, startDate, endDate]
    );
    
    const urlsResult = await db.query(
      `SELECT active_url, COUNT(*) as count
       FROM activities
       WHERE broadcaster_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
         AND active_url IS NOT NULL
       GROUP BY active_url
       ORDER BY count DESC
       LIMIT 10`,
      [broadcasterId, startDate, endDate]
    );
    
    const appsResult = await db.query(
      `SELECT foreground_app, COUNT(*) as count
       FROM activities
       WHERE broadcaster_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
         AND foreground_app IS NOT NULL
       GROUP BY foreground_app
       ORDER BY count DESC
       LIMIT 10`,
      [broadcasterId, startDate, endDate]
    );
    
    const historyCountResult = await db.query(
      `SELECT COUNT(DISTINCT url) as unique_urls
       FROM browser_history
       WHERE broadcaster_id = $1
         AND visit_timestamp >= $2
         AND visit_timestamp <= $3`,
      [broadcasterId, startDate, endDate]
    );
    
    return {
      totalActivities: parseInt(activitiesResult.rows[0].total_activities) || 0,
      totalIdleSeconds: parseInt(activitiesResult.rows[0].total_idle_seconds) || 0,
      avgAppCount: parseFloat(activitiesResult.rows[0].avg_app_count) || 0,
      lastActivity: activitiesResult.rows[0].last_activity,
      topUrls: urlsResult.rows,
      topApps: appsResult.rows,
      uniqueBrowserUrls: parseInt(historyCountResult.rows[0].unique_urls) || 0
    };
  }
  
  async cleanOldData() {
    try {
      const result = await db.query('SELECT clean_old_data()');
      const deletedCount = result.rows[0].clean_old_data;
      console.log(`🧹 Cleaned ${deletedCount} old records (90+ days)`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning old data:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseStorage();
