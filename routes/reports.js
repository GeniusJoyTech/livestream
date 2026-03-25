const express = require('express');
const ExcelJS = require('exceljs');
const databaseStorage = require('../services/databaseStorage');
const broadcasterService = require('../services/broadcasterService');
const userService = require('../services/userService');
const { authenticateToken } = require('../jwt/authMiddleware');

const router = express.Router();

router.get('/export/excel', authenticateToken, async (req, res) => {
  try {
    const { broadcasterId, fromDate, toDate } = req.query;
    
    console.log(`📊 [EXPORT] Requisição recebida - broadcasterId: "${broadcasterId}", fromDate: "${fromDate}", toDate: "${toDate}"`);
    
    if (!broadcasterId) {
      return res.status(400).json({ error: 'broadcasterId é obrigatório' });
    }
    
    const broadcasterIdInt = parseInt(broadcasterId);
    console.log(`📊 [EXPORT] Broadcaster ID parseado: ${broadcasterIdInt}`);
    
    const broadcaster = await broadcasterService.getBroadcasterById(broadcasterIdInt);
    if (!broadcaster) {
      return res.status(404).json({ error: 'Broadcaster não encontrado' });
    }
    
    console.log(`📊 [EXPORT] Broadcaster encontrado: "${broadcaster.name}" (ID: ${broadcaster.id})`);
    
    if (req.user.role === 'owner' && broadcaster.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este broadcaster' });
    }
    
    if (req.user.role === 'viewer') {
      const hasPermission = await broadcasterService.hasViewerPermission(broadcasterIdInt, req.user.id);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Você não tem permissão para acessar este broadcaster' });
      }
    }
    
    const startDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);
    
    console.log(`📊 [EXPORT] Buscando dados para broadcaster ${broadcasterIdInt} (${broadcaster.name}), período: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    const activities = await databaseStorage.getActivities(broadcasterIdInt, startDate, endDate, 50000);
    
    console.log(`📊 [EXPORT] Resultado: ${activities.length} atividades para broadcaster ${broadcasterIdInt}`);
    
    await userService.logAuditAction(req.user.id, 'EXCEL_EXPORTED', 'broadcaster', broadcasterIdInt, req.ip, req.get('user-agent'));
    
    function formatDuration(seconds) {
      if (seconds < 60) return `${Math.floor(seconds)}s`;
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      if (mins < 60) return `${mins}m ${secs}s`;
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}h ${remainMins}m`;
    }
    
    function toBrazilTime(date) {
      const d = new Date(date);
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      return formatter.format(d);
    }
    
    const sortedActivities = [...activities].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    const sessions = [];
    const windowStates = new Map();
    
    for (let i = 0; i < sortedActivities.length; i++) {
      const activity = sortedActivities[i];
      const apps = activity.apps || [];
      const foregroundApp = activity.foreground_app;
      const timestamp = new Date(activity.timestamp);
      
      let elapsed = 2;
      if (i < sortedActivities.length - 1) {
        const nextActivity = sortedActivities[i + 1];
        elapsed = (new Date(nextActivity.timestamp) - timestamp) / 1000;
        if (elapsed > 300) elapsed = 2;
      }
      
      const currentApps = new Set();
      
      apps.forEach(app => {
        const windowKey = `${app.app}|||${app.title}`;
        currentApps.add(windowKey);
        const isActive = app.app === foregroundApp;
        
        if (!windowStates.has(windowKey)) {
          windowStates.set(windowKey, {
            app: app.app,
            title: app.title,
            startTime: timestamp,
            isActive: isActive,
            accumulatedTime: elapsed
          });
        } else {
          const state = windowStates.get(windowKey);
          
          if (state.isActive !== isActive) {
            sessions.push({
              app: state.app,
              title: state.title,
              startTime: state.startTime,
              duration: state.accumulatedTime,
              isActive: state.isActive
            });
            
            state.startTime = timestamp;
            state.isActive = isActive;
            state.accumulatedTime = elapsed;
          } else {
            state.accumulatedTime += elapsed;
          }
        }
      });
      
      for (const [key, state] of windowStates) {
        if (!currentApps.has(key)) {
          sessions.push({
            app: state.app,
            title: state.title,
            startTime: state.startTime,
            duration: state.accumulatedTime,
            isActive: state.isActive
          });
          windowStates.delete(key);
        }
      }
    }
    
    for (const [key, state] of windowStates) {
      sessions.push({
        app: state.app,
        title: state.title,
        startTime: state.startTime,
        duration: state.accumulatedTime,
        isActive: state.isActive
      });
    }
    
    sessions.sort((a, b) => a.startTime - b.startTime);
    
    console.log(`📊 [EXPORT] ${sessions.length} sessões geradas`);
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SimplificaVideos';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Atividades');
    
    worksheet.columns = [
      { header: 'Inicio', key: 'start_time', width: 20 },
      { header: 'Titulo da Janela', key: 'title', width: 50 },
      { header: 'Aplicativo', key: 'app', width: 25 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Duracao', key: 'duration', width: 12 }
    ];
    
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF667eea' }
    };
    
    sessions.forEach(session => {
      const row = worksheet.addRow({
        start_time: toBrazilTime(session.startTime),
        title: session.title || '-',
        app: session.app || '-',
        status: session.isActive ? 'Ativo' : 'Inativo',
        duration: formatDuration(session.duration)
      });
      
      if (session.isActive) {
        row.getCell('status').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFd4edda' }
        };
      } else {
        row.getCell('status').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFf8d7da' }
        };
      }
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_${broadcasterId}_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Erro ao gerar Excel:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

router.get('/export/excel-urls', authenticateToken, async (req, res) => {
  try {
    const { broadcasterId, fromDate, toDate } = req.query;
    
    console.log(`📊 [EXPORT-URLS] Requisição recebida - broadcasterId: "${broadcasterId}", fromDate: "${fromDate}", toDate: "${toDate}"`);
    
    if (!broadcasterId) {
      return res.status(400).json({ error: 'broadcasterId é obrigatório' });
    }
    
    const broadcasterIdInt = parseInt(broadcasterId);
    
    const broadcaster = await broadcasterService.getBroadcasterById(broadcasterIdInt);
    if (!broadcaster) {
      return res.status(404).json({ error: 'Broadcaster não encontrado' });
    }
    
    console.log(`📊 [EXPORT-URLS] Broadcaster encontrado: "${broadcaster.name}" (ID: ${broadcaster.id})`);
    
    if (req.user.role === 'owner' && broadcaster.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este broadcaster' });
    }
    
    if (req.user.role === 'viewer') {
      const hasPermission = await broadcasterService.hasViewerPermission(broadcasterIdInt, req.user.id);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Você não tem permissão para acessar este broadcaster' });
      }
    }
    
    const startDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const browserHistory = await databaseStorage.getBrowserHistory(broadcasterIdInt, startDate, endDate);
    const stats = await databaseStorage.getStatistics(broadcasterIdInt, startDate, endDate);
    
    console.log(`📊 [EXPORT-URLS] Resultado: ${browserHistory.length} URLs para broadcaster ${broadcasterIdInt} (${broadcaster.name})`);
    
    await userService.logAuditAction(req.user.id, 'EXCEL_URLS_EXPORTED', 'broadcaster', broadcasterIdInt, req.ip, req.get('user-agent'));
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SimplificaVideos';
    workbook.created = new Date();
    
    const historySheet = workbook.addWorksheet('Histórico de Navegação');
    historySheet.columns = [
      { header: 'Data/Hora da Visita', key: 'visitTime', width: 20 },
      { header: 'Navegador', key: 'browser', width: 12 },
      { header: 'URL', key: 'url', width: 60 },
      { header: 'Título da Página', key: 'title', width: 40 }
    ];
    
    historySheet.getRow(1).font = { bold: true };
    historySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E90FF' }
    };
    
    browserHistory.forEach(entry => {
      historySheet.addRow({
        visitTime: new Date(entry.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        browser: entry.browser,
        url: entry.url,
        title: entry.title || '-'
      });
    });
    
    const statsSheet = workbook.addWorksheet('Estatísticas de URLs');
    statsSheet.columns = [
      { header: 'Métrica', key: 'metric', width: 50 },
      { header: 'Valor', key: 'value', width: 20 }
    ];
    
    statsSheet.getRow(1).font = { bold: true };
    statsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E90FF' }
    };
    
    statsSheet.addRow({ metric: 'Total de Registros de Navegação', value: browserHistory.length });
    statsSheet.addRow({ metric: 'URLs Únicas no Histórico', value: stats.uniqueBrowserUrls });
    
    statsSheet.addRow({});
    statsSheet.addRow({ metric: 'Top URLs Acessadas' });
    stats.topUrls.forEach((urlData, index) => {
      statsSheet.addRow({ metric: `${index + 1}. ${urlData.active_url}`, value: `${urlData.count} acessos` });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=urls_${broadcasterId}_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Erro ao gerar Excel de URLs:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de URLs' });
  }
});

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { broadcasterId, fromDate, toDate } = req.query;
    
    if (!broadcasterId) {
      return res.status(400).json({ error: 'broadcasterId é obrigatório' });
    }
    
    const broadcaster = await broadcasterService.getBroadcasterById(parseInt(broadcasterId));
    if (!broadcaster) {
      return res.status(404).json({ error: 'Broadcaster não encontrado' });
    }
    
    if (req.user.role === 'owner' && broadcaster.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este broadcaster' });
    }
    
    if (req.user.role === 'viewer') {
      const hasPermission = await broadcasterService.hasViewerPermission(parseInt(broadcasterId), req.user.id);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Você não tem permissão para acessar este broadcaster' });
      }
    }
    
    const startDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const stats = await databaseStorage.getStatistics(parseInt(broadcasterId), startDate, endDate);
    res.json(stats);
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

function authenticateTokenQuery(req, res, next) {
  const { verifyToken } = require('../jwt/jwtUtils');
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const queryToken = req.query.token;
  const token = headerToken || queryToken;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  const user = verifyToken(token);
  if (!user) return res.status(403).json({ error: 'Token inválido' });
  req.user = user;
  next();
}

router.get('/power-query/activities', authenticateTokenQuery, async (req, res) => {
  try {
    const { broadcasterId, fromDate, toDate } = req.query;

    if (!broadcasterId) {
      return res.status(400).json({ error: 'broadcasterId é obrigatório' });
    }

    const broadcasterIdInt = parseInt(broadcasterId);
    const broadcaster = await broadcasterService.getBroadcasterById(broadcasterIdInt);
    if (!broadcaster) {
      return res.status(404).json({ error: 'Broadcaster não encontrado' });
    }

    if (req.user.role === 'owner' && broadcaster.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    if (req.user.role === 'viewer') {
      const hasPermission = await broadcasterService.hasViewerPermission(broadcasterIdInt, req.user.id);
      if (!hasPermission) return res.status(403).json({ error: 'Sem permissão' });
    }

    const startDate = fromDate ? new Date(fromDate) : new Date('2000-01-01');
    let endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const activities = await databaseStorage.getActivities(broadcasterIdInt, startDate, endDate, 50000);

    const result = activities.map(a => ({
      timestamp: a.timestamp,
      aplicativo: a.foreground_app || '',
      url_ativa: a.active_url || '',
      tempo_ocioso_seg: a.idle_seconds || 0,
      qtd_apps_abertos: a.app_count || 0
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      broadcaster: broadcaster.name,
      periodo_inicio: startDate.toISOString(),
      periodo_fim: endDate.toISOString(),
      total_registros: result.length,
      dados: result
    });
  } catch (error) {
    console.error('Erro no power-query/activities:', error);
    res.status(500).json({ error: 'Erro ao obter atividades' });
  }
});

router.get('/power-query/urls', authenticateTokenQuery, async (req, res) => {
  try {
    const { broadcasterId, fromDate, toDate } = req.query;

    if (!broadcasterId) {
      return res.status(400).json({ error: 'broadcasterId é obrigatório' });
    }

    const broadcasterIdInt = parseInt(broadcasterId);
    const broadcaster = await broadcasterService.getBroadcasterById(broadcasterIdInt);
    if (!broadcaster) {
      return res.status(404).json({ error: 'Broadcaster não encontrado' });
    }

    if (req.user.role === 'owner' && broadcaster.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    if (req.user.role === 'viewer') {
      const hasPermission = await broadcasterService.hasViewerPermission(broadcasterIdInt, req.user.id);
      if (!hasPermission) return res.status(403).json({ error: 'Sem permissão' });
    }

    const startDate = fromDate ? new Date(fromDate) : new Date('2000-01-01');
    let endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const history = await databaseStorage.getBrowserHistory(broadcasterIdInt, startDate, endDate, 5000);

    const result = history.map(h => ({
      data_hora: h.timestamp,
      navegador: h.browser || '',
      url: h.url || '',
      titulo_pagina: h.title || ''
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      broadcaster: broadcaster.name,
      periodo_inicio: startDate.toISOString(),
      periodo_fim: endDate.toISOString(),
      total_registros: result.length,
      dados: result
    });
  } catch (error) {
    console.error('Erro no power-query/urls:', error);
    res.status(500).json({ error: 'Erro ao obter URLs' });
  }
});

module.exports = router;
