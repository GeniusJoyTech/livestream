const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function createPool() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')) {
    const url = process.env.DATABASE_URL;
    const hostMatch = url.match(/@([^:\/]+)/);
    console.log('📦 Using Replit PostgreSQL (Neon)');
    console.log('📦 Database host:', hostMatch ? hostMatch[1] : 'unknown');
    
    return new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 20,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 60000,
      allowExitOnIdle: false
    });
  }
  
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    const hostMatch = url.match(/@([^:\/]+)/);
    console.log('📦 Using database from DATABASE_URL');
    console.log('📦 Database host:', hostMatch ? hostMatch[1] : 'unknown');
    
    return new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 20,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 60000,
      allowExitOnIdle: false
    });
  }
  
  throw new Error('No database configuration found. Set DATABASE_URL.');
}

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle DB client (continuando):', err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

async function getClient() {
  const client = await pool.connect();
  return client;
}

async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await query(schema);
    console.log('✅ Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    return false;
  }
}

module.exports = {
  query,
  getClient,
  pool,
  initializeDatabase
};
