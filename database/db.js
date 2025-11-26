const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getDatabaseUrl() {
  if (fs.existsSync('/tmp/replitdb')) {
    const url = fs.readFileSync('/tmp/replitdb', 'utf8').trim();
    const hostMatch = url.match(/@([^:\/]+)/);
    console.log('📦 Using PRODUCTION database from /tmp/replitdb');
    console.log('📦 Database host:', hostMatch ? hostMatch[1] : 'unknown');
    return url;
  }
  
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    const hostMatch = url.match(/@([^:\/]+)/);
    console.log('📦 Using database from DATABASE_URL env var');
    console.log('📦 Database host:', hostMatch ? hostMatch[1] : 'unknown');
    return url;
  }
  
  throw new Error('No database configuration found');
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
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
