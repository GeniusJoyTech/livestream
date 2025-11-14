# 🗄️ Configuração do Banco de Dados PostgreSQL

## ⚠️ IMPORTANTE: Banco de Dados Obrigatório para Produção

Para usar a aplicação em produção com todas as funcionalidades de segurança, você **DEVE** criar um banco de dados PostgreSQL no Replit.

## Por que o Banco de Dados é Necessário?

O sistema antigo usava arquivos JSON para armazenar dados, o que apresentava riscos graves de segurança:
- ❌ Credenciais padrão hardcoded (admin/123456)
- ❌ Dados não criptografados
- ❌ Sem controle de acesso por usuário
- ❌ Sem auditoria de acessos
- ❌ Risco de perda de dados

O novo sistema com PostgreSQL oferece:
- ✅ Sistema de usuários com senhas fortes (mínimo 8 caracteres, maiúsculas, números, caracteres especiais)
- ✅ Controle de acesso baseado em permissões (owner/viewer)
- ✅ Criptografia de dados sensíveis
- ✅ Auditoria completa de todas as ações
- ✅ Retenção de dados configurável (90 dias)
- ✅ Limpeza automática de dados antigos
- ✅ Integridade e durabilidade dos dados

## Como Criar o Banco de Dados no Replit

### Passo 1: Acessar a ferramenta Database

1. No seu projeto Replit, procure o ícone **"Database"** ou **"PostgreSQL"** na barra lateral esquerda
2. Clique nele para abrir a ferramenta de banco de dados

### Passo 2: Criar o Banco de Dados

1. Clique em **"Create Database"** ou **"+ New Database"**
2. Selecione **PostgreSQL** como o tipo de banco
3. Aguarde a criação do banco (pode levar alguns minutos)
4. A variável de ambiente `DATABASE_URL` será criada automaticamente

### Passo 3: Verificar a Configuração

Após criar o banco de dados:
1. Reinicie o workflow (o servidor vai detectar automaticamente o `DATABASE_URL`)
2. Você verá no console: `📦 Initializing database...` e depois `✅ Database schema initialized successfully`
3. Se aparecer a mensagem de aviso, significa que o banco não foi criado ainda

## Primeiro Acesso - Criar Usuário Administrador

Após configurar o banco de dados, você precisa criar o primeiro usuário:

1. Acesse a página de registro: `https://seu-projeto.replit.app/register/register.html`
2. Crie sua conta de administrador com:
   - **Usuário**: escolha um nome seguro
   - **Email**: opcional, mas recomendado
   - **Senha**: OBRIGATÓRIO senha forte com:
     - Mínimo 8 caracteres
     - Pelo menos uma letra maiúscula
     - Pelo menos uma letra minúscula
     - Pelo menos um número
     - Pelo menos um caractere especial (!@#$%^&*)
   - Marque a caixa de concordância com as políticas de privacidade

3. Após criar a conta, faça login em `/login/login.html`

## Gerenciamento de Usuários

### Como Usuário Owner (Administrador)

Após fazer login como owner, você pode:

1. **Criar Viewers (usuários que apenas visualizam)**
   - POST `/api/users/create-viewer`
   - Body: `{ "username": "nome", "password": "senha_forte", "email": "email@example.com" }`

2. **Listar seus viewers**
   - GET `/api/users/viewers`

3. **Criar Broadcasters**
   - POST `/api/broadcasters`
   - Body: `{ "name": "Nome do Broadcaster" }`
   - Retorna um token de instalação (válido por 24h) e um token de broadcaster (válido por 60 dias)

4. **Conceder permissão a um viewer para ver um broadcaster**
   - POST `/api/broadcasters/{broadcasterId}/permissions`
   - Body: `{ "viewerId": 123 }`

5. **Revogar permissão**
   - DELETE `/api/broadcasters/{broadcasterId}/permissions/{viewerId}`

### Como Viewer

Viewers só podem:
- Ver broadcasters aos quais têm permissão
- Gerar relatórios dos broadcasters permitidos
- Não podem criar usuários ou broadcasters
- Não podem conceder/revogar permissões

## Estrutura de Dados

O banco de dados criará automaticamente as seguintes tabelas:

- **users** - Usuários do sistema (owners e viewers)
- **broadcasters** - Broadcasters registrados com tokens
- **broadcaster_permissions** - Controle de quem pode ver cada broadcaster
- **activities** - Dados de monitoramento (apps, idle time, URLs)
- **browser_history** - Histórico de navegação
- **audit_log** - Log de auditoria de todas as ações

## Política de Retenção de Dados

Por padrão, os dados são mantidos por **90 dias**. Após esse período:
- Atividades antigas são automaticamente deletadas
- Histórico de navegação antigo é removido
- A limpeza automática roda a cada 24 horas

Para alterar o período de retenção, edite `database/schema.sql` e altere a função `clean_old_data()`.

## Segurança

### Senhas
- Todas as senhas são hash com bcrypt (10 rounds)
- Nunca são armazenadas em texto plano
- Validação de força obrigatória

### Tokens
- Tokens JWT com expiração
- Installation tokens: 24 horas (para instalação inicial)
- Broadcaster tokens: 60 dias (renovados automaticamente)
- User tokens: conforme configuração JWT

### Auditoria
Todas as ações importantes são registradas:
- Login de usuários
- Criação/remoção de viewers
- Criação de broadcasters
- Concessão/revogação de permissões
- Exportação de relatórios Excel

## Backup

⚠️ **IMPORTANTE**: Configure backups regulares do seu banco de dados PostgreSQL:

1. Use a ferramenta de backup do Replit
2. Exporte dados regularmente
3. Mantenha backups em local seguro
4. Teste a recuperação periodicamente

## Troubleshooting

### "DATABASE_URL not set"
- Você ainda não criou o banco de dados PostgreSQL no Replit
- Siga os passos acima para criar

### "Database initialization error"
- Verifique se o DATABASE_URL está correto
- Tente recriar o banco de dados
- Verifique os logs para mais detalhes

### "Cannot find module 'pg'"
- Execute: `npm install pg`
- Reinicie o workflow

### Esqueci minha senha
- Não há recuperação automática de senha ainda
- Como owner, você pode criar um novo usuário owner manualmente no banco
- Ou delete o banco e recrie do zero (⚠️ perde todos os dados)

## Próximos Passos

Após configurar o banco de dados:
1. ✅ Crie seu usuário administrador
2. ✅ Leia PRIVACIDADE_E_SEGURANCA.md
3. ✅ Crie broadcasters e configure tokens
4. ✅ Crie viewers para sua equipe
5. ✅ Configure permissões de acesso
6. ✅ Distribua executáveis do broadcaster com os tokens

---

**Precisa de ajuda?** Consulte a documentação em `replit.md` ou `PRIVACIDADE_E_SEGURANCA.md`.
