# Guia de Configuração do Broadcaster

## Como Executar o Broadcaster (Python)

O broadcaster é um aplicativo Python que captura sua tela e envia para o servidor WebRTC.

### 1. Atualizar a URL de Conexão

Antes de executar o broadcaster, você precisa atualizar a URL de conexão no arquivo `public/broadcaster/Broadcaster.py`.

**Encontre seu domínio Replit:**
```bash
echo $REPLIT_DOMAINS
```

**Edite o arquivo Broadcaster.py** (linha 372):
```python
signaling_url = "wss://[SEU-DOMINIO-AQUI]?role=broadcaster"
```

**Exemplo:**
```python
signaling_url = "wss://cfdafce5-b982-4750-82b6-dc2185ad7fad-00-1egd469xx08mp.spock.replit.dev?role=broadcaster"
```

### 2. Instalar Dependências Python

```bash
pip install asyncio websockets aiortc mss opencv-python numpy psutil pywin32
```

### 3. Executar o Broadcaster

```bash
cd public/broadcaster
python Broadcaster.py
```

## Como Usar a Aplicação Web

### 1. Fazer Login
- Acesse a aplicação web (ela abre automaticamente no Replit)
- Use as credenciais padrão:
  - **Usuário:** admin
  - **Senha:** 123456

### 2. Conectar e Assistir
1. Clique em "Conectar" para conectar ao servidor WebSocket
2. Aguarde o broadcaster aparecer na lista (deve executar o Broadcaster.py primeiro)
3. Selecione o broadcaster da lista
4. Clique em "Assistir" para ver a transmissão

### 3. Exportar Relatórios Excel

**IMPORTANTE:** Os relatórios Excel só incluirão atividades da sessão ATUAL do broadcaster.

Cada vez que o broadcaster se conecta, ele recebe um novo ID único. As atividades antigas (de sessões anteriores) terão IDs diferentes e não aparecerão no relatório da sessão atual.

**Para exportar:**
1. Certifique-se de que você está assistindo um broadcaster ativo
2. Selecione o intervalo de datas (padrão: última semana)
3. Clique em "📊 Baixar Excel"
4. O arquivo será baixado com estatísticas e log detalhado de atividades

**O relatório inclui:**
- Total de registros
- Tempo ativo vs tempo ocioso
- Taxa de ociosidade
- Top URLs acessadas
- Log detalhado com timestamp, status, URLs, aplicativos

## Troubleshooting

### Broadcaster não conecta (404 Error)
- ✅ Verifique se a URL em `Broadcaster.py` está correta
- ✅ Certifique-se de que o servidor está rodando no Replit
- ✅ Confirme que está usando `wss://` (não `ws://`)

### Excel vem vazio
- ✅ Certifique-se de que o broadcaster está conectado e enviando dados
- ✅ Aguarde alguns segundos para dados serem coletados
- ✅ Verifique se o intervalo de datas inclui atividades recentes
- ✅ Lembre-se: apenas atividades da sessão ATUAL do broadcaster serão incluídas

### Broadcaster ID diferente
- Isso é normal! Cada sessão de broadcaster recebe um novo ID único
- As atividades antigas permanecem no banco de dados mas com IDs diferentes
- Para relatórios históricos completos, considere migrar para PostgreSQL (recomendado)

## Notas de Segurança

⚠️ **ANTES DE PUBLICAR EM PRODUÇÃO:**
- Altere o usuário e senha padrão (admin/123456)
- Use um JWT_SECRET forte (já configurado via Replit Secrets)
- Considere implementar rate limiting
- Migre para PostgreSQL para melhor durabilidade de dados
