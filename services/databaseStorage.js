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
         maquina,
         COALESCE(foreground_app, '(sem aplicativo)') AS aplicativo,
         ROUND(SUM(GREATEST(0, COALESCE(interval_seconds, 0) - LEAST(idle_seconds, COALESCE(interval_seconds, 0))))) AS tempo_ativo_seg,
         ROUND(SUM(LEAST(idle_seconds, COALESCE(interval_seconds, 0))))                                             AS tempo_inativo_seg,
         ROUND(SUM(COALESCE(interval_seconds, 0)))                                                                  AS tempo_total_seg
       FROM intervals
       WHERE interval_seconds IS NOT NULL AND interval_seconds > 0
       GROUP BY maquina, foreground_app
       ORDER BY tempo_ativo_seg DESC`,
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
           a.active_url,
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
         maquina,
         active_url AS url,
         ROUND(SUM(GREATEST(0, COALESCE(interval_seconds, 0) - LEAST(idle_seconds, COALESCE(interval_seconds, 0))))) AS tempo_ativo_seg,
         ROUND(SUM(LEAST(idle_seconds, COALESCE(interval_seconds, 0))))                                             AS tempo_inativo_seg,
         ROUND(SUM(COALESCE(interval_seconds, 0)))                                                                  AS tempo_total_seg
       FROM intervals
       WHERE interval_seconds IS NOT NULL AND interval_seconds > 0
       GROUP BY maquina, active_url
       ORDER BY tempo_ativo_seg DESC`,
      [broadcasterIds, startDate, endDate]
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
