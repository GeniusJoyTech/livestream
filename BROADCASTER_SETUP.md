# Guia de Configuração do Broadcaster

⚠️ **IMPORTANTE: Leia o arquivo `PRIVACIDADE_E_SEGURANCA.md` antes de usar esta ferramenta!**

## 🔍 Nova Funcionalidade: Histórico Completo de Navegação

O broadcaster agora coleta o **histórico completo de navegação** dos navegadores:
- Chrome, Firefox, Edge, Opera, Brave
- Últimas 24 horas de histórico por padrão
- URLs, títulos de páginas e timestamps
- Incluído automaticamente no relatório Excel

O filtro de data para download da planilha precisa afetar diretamente o dowload das urls, ou seja, se o usuário selecionar de data x até data y o relatório precisa exportar dessas datas. 
Além disso precisa dividir o botão baixar excel em dois tipos diferentes, o primeiro botão exibe atividades e estatisticas, o segundo exibe histórico de navegação e estatísticas.
Precisa melhorar a transmissão pois haverá casos em que será streaming de jogos
## Como Executar o Broadcaster (Python)

O broadcaster é um aplicativo Python que captura sua tela e envia para o servidor WebRTC.

### 1. Atualizar a URL de Conexão

Neste ponto preciso atualizar para que o servidor node rode pyinstaller --onefile --noconsole  --name=Broadcaster .\Broadcaster.py
enviando para o broadcaster a signaling url e um token com expiração de dois meses, sendo que o servidor precisa atualizar automaticamente este token com o broadcaster para um novo enquanto o broadcaster estiver ativo, por exemplo, eu pedi para o servidor criar hoje o executável, preciso que esse executável receba o primeiro token e que seja possível instalar nas máquinas que precisam fazer a transmissão por até um dia, após um dia esse primeiro token é expirado, após instalar o servidor atualiza o token em tempos intercalados para que a transmissão e a conexão se encerre apenas quando o usuário ficar muito tempo ocioso, ou seja o primeiro token é para instalação, após instalar recebe outro token para manter ativa a conexão do broadcaster com o server, ou seja é no servidor que fica a signaling url que o python acessará


### 2. Instalar Dependências Python

**⚠️ AVISO: O broadcaster agora acessa os bancos de dados SQLite dos navegadores para ler o histórico.**

### 3. Executar o Broadcaster

```bash
cd public/broadcaster
python Broadcaster.py
```

**O que acontece ao executar:**
- ✅ Captura de tela/monitor
- ✅ Detecção de ociosidade
- ✅ Monitoramento de aplicativos ativos
- ✅ **NOVO: Leitura do histórico de todos os navegadores instalados**

## Como Usar a Aplicação Web

### 1. Fazer Login
Precisa permitir criar um usuário, este usuário será uma empresa ou pai de uma criança, logo ele precisa criar outras pessoas para verificar e fazer o monitoramento, e estes usuário poderá ver apenas as transmissões que o seu broadcaster transmite, afinal eles fazem o download de um arquivo  do tipo .exe e instala nas máquinas, esses executáveis serão transmitidos apenas para seus respectivos viewers, logo seria adicionado no broadcaster algo como: permited_id e apenas os viewers com esse id poderiam acessar o broadcaster, o usuário que fez o primeiro acesso fica responsável por criar novos usuários para assistir e remover estes usuários, os usuários adicionados, podem apenas assistir o que seu superior permitir, tudo precisa estar criptografado
⚠️ **ALTERE A SENHA PADRÃO EM PRODUÇÃO!**

### 2. Conectar e Assistir
1. Clique em "Conectar" para conectar ao servidor WebSocket
2. Aguarde o broadcaster aparecer na lista (deve executar o Broadcaster.py primeiro)
3. Selecione o broadcaster da lista
4. Clique em "Assistir" para ver a transmissão

### 3. Exportar Relatórios Excel

**O relatório Excel agora inclui 3 abas:**

1. **Atividades** - Log de monitoramento com timestamps, status, apps
2. **Estatísticas** - Resumo com tempo ativo/ocioso, top URLs
3. **🆕 Histórico de Navegação** - Lista completa de URLs visitadas

**Para exportar:**
1. Certifique-se de que você está assistindo um broadcaster ativo
2. Selecione o intervalo de datas (padrão: última semana)
3. Clique em "📊 Baixar Excel"
4. O arquivo será baixado com todas as 3 planilhas

**O relatório de Histórico de Navegação inclui:**
- Data/Hora da visita
- Navegador utilizado
- URL completa
- Título da página
- Ordenado por data (mais recente primeiro)

## Configurações de Privacidade

### Frequência de Coleta de Histórico

Por padrão, o histórico é coletado a cada **60 segundos** (30 ciclos × 2 segundos).

Para alterar, edite `Broadcaster.py` linha 170:
```python
self.history_interval = 30  # Coletar histórico a cada 60 segundos (30 × 2s)
```

Valores recomendados:
- `15` = A cada 30 segundos (mais frequente, mais impacto)
- `30` = A cada 60 segundos (padrão, equilibrado)
- `60` = A cada 2 minutos (menos frequente, menos impacto)

### Período de Histórico Coletado

Por padrão, coleta últimas **24 horas**.

Para alterar, edite `Broadcaster.py` linha 310:
```python
self.browser_history_cache = get_browser_history(hours_back=24)
```

Valores possíveis:
- `1` = Última hora
- `6` = Últimas 6 horas
- `24` = Últimas 24 horas (padrão)
- `168` = Última semana

⚠️ **Quanto maior o período, mais dados são coletados e enviados.**

## Troubleshooting

### Broadcaster não conecta (404 Error)
- ✅ Verifique se a URL em `Broadcaster.py` está correta
- ✅ Certifique-se de que o servidor está rodando no Replit
- ✅ Confirme que está usando `wss://` (não `ws://`)

### Excel vem vazio
- ✅ Certifique-se de que o broadcaster está conectado e enviando dados
- ✅ Aguarde pelo menos 60 segundos para o histórico ser coletado
- ✅ Verifique se o intervalo de datas inclui atividades recentes
- ✅ Lembre-se: apenas atividades da sessão ATUAL do broadcaster serão incluídas

### Histórico de Navegação vazio no Excel
- ✅ Aguarde 60 segundos após conectar o broadcaster (primeira coleta)
- ✅ Verifique se você tem navegadores instalados (Chrome, Firefox, Edge, Opera, Brave)
- ✅ Certifique-se de que navegou na web nas últimas 24 horas
- ✅ Verifique os logs do broadcaster para mensagens de erro
- ✅ No Windows, execute como administrador se necessário

### Erro ao ler histórico do navegador
- ✅ Navegadores podem bloquear acesso ao banco de dados se estiverem abertos
- ✅ Tente fechar o navegador antes de executar o broadcaster
- ✅ Verifique permissões de arquivo no Windows
- ✅ Execute o broadcaster como administrador

## Notas de Segurança e Privacidade

⚠️ **LEIA COM ATENÇÃO O ARQUIVO `PRIVACIDADE_E_SEGURANCA.md`**

**Resumo das preocupações:**
1. ✅ Esta ferramenta coleta dados sensíveis de navegação
2. ✅ Requer consentimento explícito do usuário monitorado
3. ✅ Pode estar sujeita a leis de privacidade (LGPD, GDPR)
4. ✅ Dados devem ser armazenados de forma segura
5. ✅ Uso inadequado pode ser ilegal

**ANTES DE USAR EM PRODUÇÃO:**
- [ ] Obtenha consentimento por escrito
- [ ] Consulte advogado sobre conformidade legal
- [ ] Altere credenciais padrão
- [ ] Configure HTTPS e criptografia
- [ ] Implemente controles de acesso adequados
- [ ] Defina política de retenção de dados

## Desempenho e Otimização

### Impacto no Sistema
- Leitura de histórico: Operação leve, ~100-500ms
- Frequência padrão: A cada 60 segundos
- Copia temporária do banco de dados (não bloqueia navegador)

### Reduzindo o Impacto
1. Aumente `history_interval` para coletar menos frequentemente
2. Reduza `hours_back` para coletar menos dados
3. Execute apenas durante horário de expediente

---

**Este broadcaster coleta dados sensíveis. Use de forma responsável, ética e legal.**
