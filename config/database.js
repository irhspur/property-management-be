const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Opt-in SQL logging for local debugging: LOG_SQL=true. Logs the statement
// text only, never the bound values — those carry password hashes, emails and
// other personal details. Only covers pool.query; queries on a client from
// pool.connect() (withTransaction) aren't logged.
if (process.env.LOG_SQL === 'true') {
  const originalQuery = pool.query.bind(pool);
  pool.query = (...args) => {
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text;
    console.log('SQL:', text);
    return originalQuery(...args);
  };
}

module.exports = pool;
