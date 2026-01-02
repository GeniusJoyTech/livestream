-- SimplificaVideos Billing Schema
-- Sistema de cobrança por broadcaster, viewer e grupo de broadcasters

-- Configuração de preços (gerenciado pelo usuário master)
CREATE TABLE IF NOT EXISTS pricing_config (
    id SERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('broadcaster', 'viewer', 'broadcaster_group')),
    daily_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    monthly_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    annual_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_type)
);

-- Configuração de datas de cobrança (gerenciado pelo usuário master)
CREATE TABLE IF NOT EXISTS billing_dates_config (
    id SERIAL PRIMARY KEY,
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('monthly', 'annual')),
    invoice_open_days_before INTEGER NOT NULL DEFAULT 7,
    due_day INTEGER NOT NULL,
    grace_period_days INTEGER NOT NULL DEFAULT 8,
    discount_deadline_day INTEGER NOT NULL,
    inactivation_day INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plan_type)
);

-- Usuário master (administrador do sistema de cobrança)
CREATE TABLE IF NOT EXISTS master_users (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usuários isentos de cobrança
CREATE TABLE IF NOT EXISTS exempt_users (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    exempted_by INTEGER REFERENCES master_users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assinaturas/Contratos dos owners
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (plan_type IN ('monthly', 'annual')),
    broadcaster_limit INTEGER NOT NULL DEFAULT 0,
    viewer_limit INTEGER NOT NULL DEFAULT 0,
    broadcaster_group_limit INTEGER NOT NULL DEFAULT 0,
    stripe_customer_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'cancelled')),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    suspended_at TIMESTAMP,
    consecutive_unpaid_months INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Faturas
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    broadcaster_count INTEGER NOT NULL DEFAULT 0,
    viewer_count INTEGER NOT NULL DEFAULT 0,
    broadcaster_group_count INTEGER NOT NULL DEFAULT 0,
    contracted_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    final_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount_deadline TIMESTAMP,
    due_date TIMESTAMP NOT NULL,
    grace_period_end TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'overdue', 'cancelled')),
    paid_at TIMESTAMP,
    stripe_invoice_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    payment_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de pagamentos
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('credit_card', 'pix')),
    stripe_payment_id VARCHAR(255),
    pix_code TEXT,
    pix_qr_code TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de alterações de limites
CREATE TABLE IF NOT EXISTS limit_changes (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('broadcaster', 'viewer', 'broadcaster_group')),
    old_value INTEGER NOT NULL,
    new_value INTEGER NOT NULL,
    daily_value_at_change DECIMAL(10, 2) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grupos de broadcasters (broadcaster groups para cobrança)
CREATE TABLE IF NOT EXISTS broadcaster_groups (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, name)
);

-- Relação broadcaster <-> grupo
CREATE TABLE IF NOT EXISTS broadcaster_group_members (
    id SERIAL PRIMARY KEY,
    broadcaster_group_id INTEGER NOT NULL REFERENCES broadcaster_groups(id) ON DELETE CASCADE,
    broadcaster_id INTEGER NOT NULL REFERENCES broadcasters(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(broadcaster_group_id, broadcaster_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_owner ON invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_limit_changes_subscription ON limit_changes(subscription_id);
CREATE INDEX IF NOT EXISTS idx_broadcaster_groups_owner ON broadcaster_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_broadcaster_group_members_group ON broadcaster_group_members(broadcaster_group_id);

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_pricing_config_updated_at ON pricing_config;
CREATE TRIGGER update_pricing_config_updated_at BEFORE UPDATE ON pricing_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_dates_config_updated_at ON billing_dates_config;
CREATE TRIGGER update_billing_dates_config_updated_at BEFORE UPDATE ON billing_dates_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_master_users_updated_at ON master_users;
CREATE TRIGGER update_master_users_updated_at BEFORE UPDATE ON master_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_exempt_users_updated_at ON exempt_users;
CREATE TRIGGER update_exempt_users_updated_at BEFORE UPDATE ON exempt_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_broadcaster_groups_updated_at ON broadcaster_groups;
CREATE TRIGGER update_broadcaster_groups_updated_at BEFORE UPDATE ON broadcaster_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir configurações padrão de preços
INSERT INTO pricing_config (resource_type, daily_value, monthly_discount_percent, annual_discount_percent)
VALUES 
    ('broadcaster', 1.00, 10.00, 20.00),
    ('viewer', 0.50, 10.00, 20.00),
    ('broadcaster_group', 2.00, 10.00, 20.00)
ON CONFLICT (resource_type) DO NOTHING;

-- Inserir configurações padrão de datas de cobrança
INSERT INTO billing_dates_config (plan_type, invoice_open_days_before, due_day, grace_period_days, discount_deadline_day, inactivation_day)
VALUES 
    ('monthly', 7, 20, 8, 20, 28),
    ('annual', 45, 10, 11, 15, 21)
ON CONFLICT (plan_type) DO NOTHING;
