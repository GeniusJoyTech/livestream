const express = require('express');
const ExcelJS = require('exceljs');
const { getActivities, getStats } = require('../services/activityStorage');
const { authenticateToken } = require('../jwt/authMiddleware');

const router = express.Router();

router.get('/export/excel', authenticateToken, async (req, res) => {
  try {
    const { broadcasterId, fromDate, toDate } = req.query;
    
    if (!broadcasterId) {
      return res.status(400).json({ error: 'broadcasterId é obrigatório' });
    }
    
    const activities = await getActivities(broadcasterId, fromDate, toDate);
    const stats = await getStats(broadcasterId, fromDate, toDate);
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SimplificaVideos';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Atividades');
    
    worksheet.columns = [
      { header: 'Data/Hora', key: 'timestamp', width: 20 },
      { header: 'Host', key: 'host', width: 15 },
      { header: 'Sistema', key: 'system', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Tempo Ocioso (s)', key: 'idle_seconds', width: 18 },
      { header: 'URL Ativa', key: 'active_url', width: 50 },
      { header: 'Aplicativo', key: 'app', width: 25 },
      { header: 'Título Janela', key: 'title', width: 40 }
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E90FF' }
    };
    
    activities.forEach(activity => {
      worksheet.addRow({
        timestamp: new Date(activity.timestamp).toLocaleString('pt-BR'),
        host: activity.host,
        system: activity.system,
        status: activity.is_idle ? 'Ocioso' : 'Ativo',
        idle_seconds: activity.idle_seconds,
        active_url: activity.active_url || '-',
        app: activity.foreground?.app || '-',
        title: activity.foreground?.title || '-'
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
    
    statsSheet.addRow({ metric: 'Total de Registros', value: stats.totalRecords });
    statsSheet.addRow({ metric: 'Tempo Ativo (segundos)', value: stats.activeTime });
    statsSheet.addRow({ metric: 'Tempo Ocioso (segundos)', value: stats.totalIdleTime });
    
    const totalTime = stats.activeTime + stats.totalIdleTime;
    const idlePercentage = totalTime > 0 ? Math.round((stats.totalIdleTime / totalTime) * 100) : 0;
    statsSheet.addRow({ metric: 'Taxa de Ociosidade (%)', value: idlePercentage });
    
    statsSheet.addRow({});
    statsSheet.addRow({ metric: 'Top URLs Acessadas' });
    stats.topUrls.forEach((urlData, index) => {
      statsSheet.addRow({ metric: `${index + 1}. ${urlData.url}`, value: `${urlData.count} acessos` });
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
    const stats = await getStats(broadcasterId, fromDate, toDate);
    res.json(stats);
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

module.exports = router;
