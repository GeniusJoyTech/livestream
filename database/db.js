const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function isProduction() {
  return fs.existsSync('/tmp/replitdb') || process.env.REPL_DEPLOYMENT === '1';
}

function createPool() {
  if (isProduction()) {
    console.log('📦 Using PRODUCTION database (Supabase)');
    return new Pool({
      host: 'db.gglqmmgbvnbvkfguhqyj.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });
  }
  
  console.log('📦 Using DEVELOPMENT database (Replit)');
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

const pool = createPool();

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
