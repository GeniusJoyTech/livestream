# SimplificaVideos Broadcaster - Guia de Configuração

## 📋 Requisitos do Sistema

### Windows
- Python 3.7 ou superior
- Bibliotecas necessárias (veja seção de instalação)

### Linux/Mac
- Python 3.7 ou superior
- Bibliotecas necessárias

## 📦 Instalação

### 1. Instalar Python
Baixe e instale Python 3.7+ de [python.org](https://python.org)

### 2. Instalar Dependências

```bash
pip install asyncio websockets aiortc mss opencv-python-headless numpy psutil pywin32 aiohttp
```

**Nota**: No Linux/Mac, substitua `pywin32` por bibliotecas equivalentes se necessário.

## 🔐 Configuração Segura (Recomendado)

### Passo 1: Obter Token JWT

1. **Faça login no sistema** como usuário owner (administrador)
2. **Obtenha seu token de login**:
   ```bash
   curl -X POST https://seu-dominio.replit.dev/login \
     -H "Content-Type: application/json" \
     -d '{"username":"suporte-admin","password":"sua-senha"}'
   ```
   
   Copie o `token` retornado.

3. **Crie um broadcaster**:
   ```bash
   curl -X POST https://seu-dominio.replit.dev/api/broadcasters \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer SEU_TOKEN_DE_LOGIN" \
     -d '{"name":"Meu Computador"}'
   ```
   
   Resposta esperada:
   ```json
   {
     "id": 1,
     "name": "Meu Computador",
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "installationToken": "inst_abc123...",
     "tokenExpiresAt": "2025-01-13T..."
   }
   ```

4. **Copie o token do broadcaster** (campo `token`, não o `installationToken`)

### Passo 2: Configurar o Script

Edite o arquivo `Broadcaster.py`:

```python
# Substitua esta URL pelo domínio do seu Replit
signaling_url = "wss://SEU-DOMINIO.replit.dev?role=broadcaster"

# Cole o token do broadcaster aqui
broadcaster_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Passo 3: Executar

```bash
python Broadcaster.py
```

## ⚠️ Modo Legado (Não Recomendado)

Se você não configurar um token JWT, o broadcaster funcionará em **modo legado**:

```python
broadcaster_token = None  # Modo legado
```

**Limitações do modo legado**:
- Menor segurança
- Sem controle de expiração
- Dados atribuídos ao owner padrão (ID 1)
- Recomendamos migrar para JWT o quanto antes

## 🎯 Funcionalidades

### Monitoramento Implementado

1. **Aplicações Abertas**: Lista de apps rodando
2. **Janela Ativa**: App em primeiro plano
3. **Tempo de Inatividade**: Detecta quanto tempo sem uso do mouse/teclado
4. **URL Ativa**: Detecta URL aberta em navegadores
5. **Histórico de Navegação**: Coleta histórico dos navegadores a cada 30 ciclos (~1 minuto)

### Navegadores Suportados

- Google Chrome
- Microsoft Edge
- Mozilla Firefox
- Opera
- Brave

## 🔄 Renovação de Token

Os tokens JWT expiram em **60 dias**. Para renovar:

```bash
curl -X POST https://seu-dominio.replit.dev/api/broadcasters/{BROADCASTER_ID}/refresh-token \
  -H "Authorization: Bearer SEU_TOKEN_DE_LOGIN"
```

Atualize o `broadcaster_token` no script com o novo token.

## 🐛 Solução de Problemas

### Erro de Conexão
```
⚠️ Conexão perdida: tentando reconectar...
```
**Solução**: Verifique se o domínio está correto e se o servidor está rodando.

### Erro de Autenticação
```
❌ Token inválido ou expirado
```
**Solução**: Renove seu token JWT (veja seção acima).

### Histórico de Navegação Vazio
```
⚠️ Erro ao ler histórico do Chrome: [PermissionError]
```
**Solução**: 
- Feche o navegador antes de executar
- Execute como Administrador (Windows)
- Verifique permissões de arquivo

### Captura de Tela Não Funciona
**Solução**:
- Verifique se `mss` e `opencv-python` estão instalados
- No Linux, pode precisar de bibliotecas X11 adicionais

## 📊 Dados Coletados

Os seguintes dados são enviados ao servidor a cada **2 segundos**:

1. Nome do computador
2. Sistema operacional
3. Lista de aplicações abertas (até 10)
4. Aplicação em primeiro plano
5. Tempo de inatividade (em segundos)
6. URL ativa em navegadores
7. Histórico de navegação (últimas 24 horas, enviado a cada ~1 minuto)

**Privacidade**: Todos os dados são criptografados em trânsito (WSS) e armazenados com controle de acesso. Veja `PRIVACIDADE_E_SEGURANCA.md` para detalhes.

## 📝 Logs do Sistema

O broadcaster exibe logs detalhados:

```
🚀 SimplificaVideos Broadcaster v2.0
📡 Nome: MEU-PC
🔒 Modo: JWT Autenticado (Seguro)
============================================================
🔌 Tentando conectar ao servidor de sinalização...
✅ Conectado ao servidor de sinalização.
🔐 Autenticando com token JWT...
📡 Registrado como: MEU-PC
🔄 Iniciando envio de dados de monitoramento...
📤 Enviando dados: 12 apps, idle: 5.2s, URL: https://exemplo.com
```

## 🔒 Segurança

- ✅ Use sempre tokens JWT para autenticação
- ✅ Tokens expiram em 60 dias (renove periodicamente)
- ✅ Conexão criptografada WSS (WebSocket Secure)
- ✅ Dados armazenados com criptografia no servidor
- ✅ Controle de acesso por permissões de usuário

## 📞 Suporte

Para mais informações, consulte:
- `PRODUCTION_READY.md` - Guia completo do sistema
- `DATABASE_SETUP.md` - Configuração do banco de dados
- `PRIVACIDADE_E_SEGURANCA.md` - Políticas de privacidade
