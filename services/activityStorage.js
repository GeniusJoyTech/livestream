const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '../data');
const ACTIVITY_FILE = path.join(STORAGE_DIR, 'activities.json');
const BROWSER_HISTORY_FILE = path.join(STORAGE_DIR, 'browser_history.json');
const MAX_ENTRIES = 10000;
const MAX_HISTORY_ENTRIES = 20000;
const RETENTION_DAYS = 30;

let activitiesCache = [];
let browserHistoryCache = [];
let browserHistoryKeys = new Set();
let isReady = false;
let readyPromise;

async function ensureDataDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.error('Erro ao criar diretório de dados:', err);
  }
}

async function loadActivities() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(ACTIVITY_FILE, 'utf8');
    activitiesCache = JSON.parse(data);
    console.log(`📂 Carregadas ${activitiesCache.length} atividades do disco`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      activitiesCache = [];
      console.log('📂 Nenhum arquivo de atividades encontrado, iniciando novo');
    } else {
      console.error('Erro ao carregar atividades:', err);
    }
  }

  try {
    const historyData = await fs.readFile(BROWSER_HISTORY_FILE, 'utf8');
    browserHistoryCache = JSON.parse(historyData);
    browserHistoryKeys.clear();
    browserHistoryCache.forEach(entry => {
      const key = `${entry.broadcasterId}|${entry.visitTime}|${entry.url}`;
      browserHistoryKeys.add(key);
    });
    console.log(`📚 Carregadas ${browserHistoryCache.length} entradas de histórico do disco`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      browserHistoryCache = [];
      browserHistoryKeys.clear();
      console.log('📚 Nenhum arquivo de histórico encontrado, iniciando novo');
    } else {
      console.error('Erro ao carregar histórico:', err);
    }
  } finally {
    isReady = true;
  }
}

async function waitForReady() {
  if (isReady) return;
  await readyPromise;
}

let activitySaveInFlight = false;
let activitySaveDirty = false;

async function saveActivities() {
  if (activitySaveInFlight) {
    activitySaveDirty = true;
    return;
  }
  activitySaveInFlight = true;
  try {
    await ensureDataDir();
    await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activitiesCache));
  } catch (err) {
    console.error('Erro ao salvar atividades:', err);
  } finally {
    activitySaveInFlight = false;
    if (activitySaveDirty) {
      activitySaveDirty = false;
      scheduleSave();
    }
  }
}

let historySaveInFlight = false;
let historySaveDirty = false;

async function saveBrowserHistory() {
  if (historySaveInFlight) {
    historySaveDirty = true;
    return;
  }
  historySaveInFlight = true;
  try {
    await ensureDataDir();
    await fs.writeFile(BROWSER_HISTORY_FILE, JSON.stringify(browserHistoryCache));
  } catch (err) {
    console.error('Erro ao salvar histórico de navegação:', err);
  } finally {
    historySaveInFlight = false;
    if (historySaveDirty) {
      historySaveDirty = false;
      setTimeout(() => saveBrowserHistory().catch(console.error), HISTORY_SAVE_INTERVAL);
    }
  }
}

function cleanOldEntries() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  const before = activitiesCache.length;
  activitiesCache = activitiesCache.filter(activity => {
    return new Date(activity.timestamp) > cutoffDate;
  });
  
  const removed = before - activitiesCache.length;
  if (removed > 0) {
    console.log(`🧹 Removidas ${removed} atividades antigas (>${RETENTION_DAYS} dias)`);
    saveActivities().catch(console.error);
  }

  const histBefore = browserHistoryCache.length;
  browserHistoryCache = browserHistoryCache.filter(entry => {
    const t = new Date(entry.visitTime || entry.receivedAt);
    return !isNaN(t.getTime()) && t > cutoffDate;
  });
  const histRemoved = histBefore - browserHistoryCache.length;
  if (histRemoved > 0) {
    browserHistoryKeys = new Set(
      browserHistoryCache.map(e => `${e.broadcasterId}|${e.visitTime}|${e.url}`)
    );
    console.log(`🧹 Removidas ${histRemoved} entradas de histórico antigas (>${RETENTION_DAYS} dias)`);
    saveBrowserHistory().catch(console.error);
  }
}

let saveTimer = null;
const SAVE_INTERVAL = 60000;
const HISTORY_SAVE_INTERVAL = 60000;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveActivities().catch(console.error);
  }, SAVE_INTERVAL);
}

let historySaveTimer = null;

function scheduleHistorySave() {
  if (historySaveTimer) return;
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null;
    saveBrowserHistory().catch(console.error);
  }, HISTORY_SAVE_INTERVAL);
}

process.on('SIGTERM', () => {
  console.log('💾 Salvando dados antes de encerrar (SIGTERM)...');
  Promise.all([saveActivities(), saveBrowserHistory()])
    .then(() => console.log('✅ Dados salvos'));
});

process.on('SIGINT', () => {
  console.log('💾 Salvando dados antes de encerrar (SIGINT)...');
  Promise.all([saveActivities(), saveBrowserHistory()])
    .then(() => console.log('✅ Dados salvos'));
});

async function addActivity(broadcasterId, data) {
  await waitForReady();
  
  const activity = {
    broadcasterId,
    timestamp: data.timestamp || new Date().toISOString(),
    host: data.host,
    system: data.system,
    idle_seconds: data.idle_seconds || 0,
    is_idle: data.is_idle || false,
    active_url: data.active_url || null,
    foreground: data.foreground || null,
    apps_count: data.apps ? data.apps.length : 0
  };
  
  activitiesCache.push(activity);
  
  if (activitiesCache.length > MAX_ENTRIES) {
    activitiesCache.shift();
  }
  
  scheduleSave();
}

async function getActivities(broadcasterId, fromDate, toDate) {
  await waitForReady();
  
  let filtered = activitiesCache;
  
  if (broadcasterId) {
    filtered = filtered.filter(a => a.broadcasterId === broadcasterId);
  }
  
  if (fromDate) {
    const from = new Date(fromDate);
    filtered = filtered.filter(a => new Date(a.timestamp) >= from);
  }
  
  if (toDate) {
    const to = new Date(toDate);
    filtered = filtered.filter(a => new Date(a.timestamp) <= to);
  }
  
  return filtered;
}

async function getStats(broadcasterId, fromDate, toDate) {
  const activities = await getActivities(broadcasterId, fromDate, toDate);
  
  const urlCounts = {};
  let totalIdleTime = 0;
  let activeTime = 0;
  
  activities.forEach(activity => {
    if (activity.active_url) {
      urlCounts[activity.active_url] = (urlCounts[activity.active_url] || 0) + 1;
    }
    
    if (activity.is_idle) {
      totalIdleTime += 2;
    } else {
      activeTime += 2;
    }
  });
  
  const topUrls = Object.entries(urlCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([url, count]) => ({ url, count }));
  
  return {
    totalRecords: activities.length,
    totalIdleTime: Math.round(totalIdleTime),
    activeTime: Math.round(activeTime),
    topUrls
  };
}

async function addBrowserHistory(broadcasterId, historyEntries) {
  await waitForReady();
  
  const timestamp = new Date().toISOString();
  let addedCount = 0;
  let duplicateCount = 0;
  
  for (const entry of historyEntries) {
    const uniqueKey = `${broadcasterId}|${entry.visit_time}|${entry.url}`;
    
    if (!browserHistoryKeys.has(uniqueKey)) {
      const historyRecord = {
        broadcasterId,
        receivedAt: timestamp,
        browser: entry.browser,
        url: entry.url,
        title: entry.title,
        visitTime: entry.visit_time
      };
      
      browserHistoryCache.push(historyRecord);
      browserHistoryKeys.add(uniqueKey);
      addedCount++;
    } else {
      duplicateCount++;
    }
  }
  
  if (browserHistoryCache.length > MAX_HISTORY_ENTRIES) {
    const removed = browserHistoryCache.length - MAX_HISTORY_ENTRIES;
    const removedEntries = browserHistoryCache.splice(0, removed);
    removedEntries.forEach(entry => {
      const key = `${entry.broadcasterId}|${entry.visitTime}|${entry.url}`;
      browserHistoryKeys.delete(key);
    });
  }
  
  if (addedCount > 0) {
    scheduleHistorySave();
    console.log(`💾 Registrados ${addedCount} novos registros de histórico (${duplicateCount} duplicatas ignoradas)`);
  } else if (duplicateCount > 0) {
    console.log(`ℹ️ ${duplicateCount} duplicatas ignoradas, nenhum novo registro`);
  }
}

async function getBrowserHistory(broadcasterId, fromDate, toDate) {
  await waitForReady();
  
  let filtered = browserHistoryCache;
  
  if (broadcasterId) {
    filtered = filtered.filter(h => h.broadcasterId === broadcasterId);
  }
  
  if (fromDate) {
    const from = new Date(fromDate);
    filtered = filtered.filter(h => new Date(h.visitTime) >= from);
  }
  
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    filtered = filtered.filter(h => new Date(h.visitTime) <= to);
  }
  
  return filtered.sort((a, b) => new Date(b.visitTime) - new Date(a.visitTime));
}

setInterval(cleanOldEntries, 24 * 60 * 60 * 1000);

readyPromise = loadActivities().catch(console.error);

module.exports = {
  addActivity,
  getActivities,
  getStats,
  saveActivities,
  waitForReady,
  addBrowserHistory,
  getBrowserHistory
};
