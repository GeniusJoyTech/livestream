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
    
    const activities = await databaseStorage.getActivities(parseInt(broadcasterId), startDate, endDate);
    const stats = await databaseStorage.getStatistics(parseInt(broadcasterId), startDate, endDate);
    const browserHistory = await databaseStorage.getBrowserHistory(parseInt(broadcasterId), startDate, endDate);
    
    await userService.logAuditAction(req.user.id, 'EXCEL_EXPORTED', 'broadcaster', parseInt(broadcasterId), req.ip, req.get('user-agent'));
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SimplificaVideos';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Atividades');
    
    worksheet.columns = [
      { header: 'Data/Hora', key: 'timestamp', width: 20 },
      { header: 'Nome do App', key: 'app', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Tempo Ocioso (s)', key: 'idle_seconds', width: 18 },
      { header: 'Tempo de Uso (s)', key: 'active_seconds', width: 18 }
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E90FF' }
    };
    
    const activitiesReversed = [...activities].reverse();
    
    activitiesReversed.forEach((activity, index) => {
      let activeSeconds = 0;
      
      if (index > 0) {
        const prevActivity = activitiesReversed[index - 1];
        const timeDiff = (new Date(activity.timestamp) - new Date(prevActivity.timestamp)) / 1000;
        
        if (timeDiff > 0) {
          activeSeconds = Math.max(0, Math.round(timeDiff - (activity.idle_seconds || 0)));
        }
      }
      
      worksheet.addRow({
        timestamp: new Date(activity.timestamp).toLocaleString('pt-BR'),
        app: activity.foreground_app || 'Nenhum aplicativo detectado',
        status: activity.idle_seconds > 60 ? 'Ocioso' : 'Ativo',
        idle_seconds: activity.idle_seconds || 0,
        active_seconds: activeSeconds
      });
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
        visitTime: new Date(entry.timestamp).toLocaleString('pt-BR'),
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
