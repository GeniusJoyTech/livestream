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
    const endDate = toDate ? new Date(toDate) : new Date();
    
    console.log(`📊 [EXPORT] Buscando dados para broadcaster ${broadcasterIdInt} (${broadcaster.name}), período: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    const activities = await databaseStorage.getActivities(broadcasterIdInt, startDate, endDate);
    const stats = await databaseStorage.getStatistics(broadcasterIdInt, startDate, endDate);
    const browserHistory = await databaseStorage.getBrowserHistory(broadcasterIdInt, startDate, endDate);
    
    console.log(`📊 [EXPORT] Resultado: ${activities.length} atividades, ${browserHistory.length} histórico para broadcaster ${broadcasterIdInt}`);
    
    console.log(`📊 Dados encontrados: ${activities.length} atividades, ${browserHistory.length} histórico, stats: ${JSON.stringify(stats)}`);
    
    await userService.logAuditAction(req.user.id, 'EXCEL_EXPORTED', 'broadcaster', broadcasterIdInt, req.ip, req.get('user-agent'));
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SimplificaVideos';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Monitoramento');
    
    worksheet.columns = [
      { header: 'Data/Hora', key: 'timestamp', width: 20 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Aplicativo', key: 'app', width: 25 },
      { header: 'Titulo da Janela', key: 'title', width: 50 },
      { header: 'Em Foco', key: 'is_foreground', width: 10 },
      { header: 'Tempo Ocioso (s)', key: 'idle_seconds', width: 15 },
      { header: 'PID', key: 'pid', width: 10 }
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF667eea' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    const activitiesReversed = [...activities].reverse();
    
    activitiesReversed.forEach((activity) => {
      const apps = activity.apps || [];
      const foregroundApp = activity.foreground_app;
      const timestamp = new Date(activity.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const status = activity.idle_seconds > 60 ? 'Ocioso' : 'Ativo';
      
      if (apps.length > 0) {
        apps.forEach(app => {
          const isForeground = app.app === foregroundApp;
          worksheet.addRow({
            timestamp: timestamp,
            status: status,
            app: app.app || '-',
            title: app.title || '-',
            is_foreground: isForeground ? 'Sim' : 'Nao',
            idle_seconds: activity.idle_seconds || 0,
            pid: app.pid || '-'
          });
        });
      } else {
        worksheet.addRow({
          timestamp: timestamp,
          status: status,
          app: foregroundApp || 'Nenhum aplicativo detectado',
          title: '-',
          is_foreground: 'Sim',
          idle_seconds: activity.idle_seconds || 0,
          pid: '-'
        });
      }
    });
    
    const statsSheet = workbook.addWorksheet('Estatísticas');
    statsSheet.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 20 }
    ];
    
    statsSheet.getRow(1).font = { bold: true };
    statsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E90FF' }
    };
    
    statsSheet.addRow({ metric: 'Total de Registros', value: stats.totalActivities });
    statsSheet.addRow({ metric: 'Tempo Ocioso (segundos)', value: stats.totalIdleSeconds });
    statsSheet.addRow({ metric: 'Média de Apps Abertos', value: stats.avgAppCount.toFixed(2) });
    statsSheet.addRow({ metric: 'URLs Únicas no Histórico', value: stats.uniqueBrowserUrls });
    
    statsSheet.addRow({});
    statsSheet.addRow({ metric: 'Top URLs Acessadas' });
    stats.topUrls.forEach((urlData, index) => {
      statsSheet.addRow({ metric: `${index + 1}. ${urlData.active_url}`, value: `${urlData.count} acessos` });
    });
    
    statsSheet.addRow({});
    statsSheet.addRow({ metric: 'Top Aplicativos' });
    stats.topApps.forEach((appData, index) => {
      statsSheet.addRow({ metric: `${index + 1}. ${appData.foreground_app}`, value: `${appData.count} vezes` });
    });
    
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
    const endDate = toDate ? new Date(toDate) : new Date();
    
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
    const endDate = toDate ? new Date(toDate) : new Date();
    
    const stats = await databaseStorage.getStatistics(parseInt(broadcasterId), startDate, endDate);
    res.json(stats);
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

module.exports = router;
