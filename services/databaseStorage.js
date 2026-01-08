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
  
  async getActivities(broadcasterId, startDate, endDate, limit = 1000) {
    const result = await db.query(
      `SELECT id, timestamp, idle_seconds, active_url, foreground_app, app_count, apps_data
       FROM activities
       WHERE broadcaster_id = $1 
         AND timestamp >= $2 
         AND timestamp <= $3
       ORDER BY timestamp DESC
       LIMIT $4`,
      [broadcasterId, startDate, endDate, limit]
    );
    
    return result.rows.map(row => ({
      ...row,
      apps: row.apps_data
    }));
  }
  
  async getBrowserHistory(broadcasterId, startDate, endDate, limit = 5000) {
    const result = await db.query(
      `SELECT id, browser, url, title, visit_timestamp
       FROM browser_history
       WHERE broadcaster_id = $1
         AND visit_timestamp >= $2
         AND visit_timestamp <= $3
       ORDER BY visit_timestamp DESC
       LIMIT $4`,
      [broadcasterId, startDate, endDate, limit]
    );
    
    return result.rows.map(row => ({
      browser: row.browser,
      url: row.url,
      title: row.title,
      timestamp: row.visit_timestamp.toISOString()
    }));
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
