-- SimplificaVideos Database Schema
-- Production-ready schema with security and privacy in mind

-- Users table with role-based access control
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'viewer')),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Broadcasters table - logical broadcaster entities (can have multiple installations)
CREATE TABLE IF NOT EXISTS broadcasters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    installation_token VARCHAR(512) UNIQUE,
    installation_token_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, name)
);

-- Broadcaster installations - physical computers/installations per broadcaster
CREATE TABLE IF NOT EXISTS broadcaster_installations (
    id SERIAL PRIMARY KEY,
    broadcaster_id INTEGER NOT NULL REFERENCES broadcasters(id) ON DELETE CASCADE,
    computer_name VARCHAR(255) NOT NULL,
    jwt_token VARCHAR(512) UNIQUE,
    jwt_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    last_connected_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(broadcaster_id, computer_name)
);

-- Broadcaster permissions - defines which viewers can watch which broadcasters
CREATE TABLE IF NOT EXISTS broadcaster_permissions (
    id SERIAL PRIMARY KEY,
    broadcaster_id INTEGER NOT NULL REFERENCES broadcasters(id) ON DELETE CASCADE,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER NOT NULL REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(broadcaster_id, viewer_id)
);

-- Activities table - stores monitoring data (linked to installation for computer identification)
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    broadcaster_id INTEGER NOT NULL REFERENCES broadcasters(id) ON DELETE CASCADE,
    installation_id INTEGER REFERENCES broadcaster_installations(id) ON DELETE SET NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idle_seconds INTEGER DEFAULT 0,
    active_url TEXT,
    foreground_app VARCHAR(500),
    app_count INTEGER DEFAULT 0,
    apps_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Browser history table - stores encrypted navigation history (linked to installation)
CREATE TABLE IF NOT EXISTS browser_history (
    id SERIAL PRIMARY KEY,
    broadcaster_id INTEGER NOT NULL REFERENCES broadcasters(id) ON DELETE CASCADE,
    installation_id INTEGER REFERENCES broadcaster_installations(id) ON DELETE SET NULL,
    browser VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    visit_timestamp TIMESTAMP NOT NULL,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(broadcaster_id, installation_id, browser, url, visit_timestamp)
);

-- Audit log table - tracks who accessed what data
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_broadcaster_timestamp ON activities(broadcaster_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activities_installation_timestamp ON activities(installation_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_browser_history_broadcaster_timestamp ON browser_history(broadcaster_id, visit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_browser_history_installation_timestamp ON browser_history(installation_id, visit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_broadcaster_permissions_viewer ON broadcaster_permissions(viewer_id);
CREATE INDEX IF NOT EXISTS idx_broadcaster_installations_broadcaster ON broadcaster_installations(broadcaster_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_broadcasters_updated_at ON broadcasters;
CREATE TRIGGER update_broadcasters_updated_at BEFORE UPDATE ON broadcasters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_broadcaster_installations_updated_at ON broadcaster_installations;
CREATE TRIGGER update_broadcaster_installations_updated_at BEFORE UPDATE ON broadcaster_installations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean old data (90 days retention policy)
CREATE OR REPLACE FUNCTION clean_old_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete activities older than 90 days
    DELETE FROM activities WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete browser history older than 90 days
    DELETE FROM browser_history WHERE visit_timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';
