/**
 * Script de limpeza de duplicatas no histórico de navegação
 * 
 * Execute este script ANTES de usar os relatórios em produção:
 * node scripts/cleanup_history_duplicates.js
 */

const fs = require('fs').promises;
const path = require('path');

const BROWSER_HISTORY_FILE = path.join(__dirname, '../data/browser_history.json');

async function cleanupDuplicates() {
  try {
    console.log('📚 Lendo arquivo de histórico...');
    const data = await fs.readFile(BROWSER_HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    
    console.log(`📊 Total de registros antes da limpeza: ${history.length}`);
    
    const uniqueKeys = new Set();
    const cleanedHistory = [];
    let duplicateCount = 0;
    
    for (const entry of history) {
      const key = `${entry.broadcasterId}|${entry.visitTime}|${entry.url}`;
      
      if (!uniqueKeys.has(key)) {
        uniqueKeys.add(key);
        cleanedHistory.push(entry);
      } else {
        duplicateCount++;
      }
    }
    
    console.log(`✅ Registros únicos mantidos: ${cleanedHistory.length}`);
    console.log(`🗑️ Duplicatas removidas: ${duplicateCount}`);
    
    const backup = `${BROWSER_HISTORY_FILE}.backup.${Date.now()}`;
    await fs.copyFile(BROWSER_HISTORY_FILE, backup);
    console.log(`💾 Backup criado: ${backup}`);
    
    await fs.writeFile(BROWSER_HISTORY_FILE, JSON.stringify(cleanedHistory, null, 2));
    console.log(`✨ Arquivo limpo salvo com sucesso!`);
    
    console.log('\n📈 Resumo:');
    console.log(`   - Registros originais: ${history.length}`);
    console.log(`   - Registros limpos: ${cleanedHistory.length}`);
    console.log(`   - Redução: ${((duplicateCount / history.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️ Arquivo de histórico não encontrado. Nada para limpar.');
    } else {
      console.error('❌ Erro ao limpar duplicatas:', error);
      process.exit(1);
    }
  }
}

cleanupDuplicates().then(() => {
  console.log('\n✅ Limpeza concluída com sucesso!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
