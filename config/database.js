const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Store the original query method
const originalQuery = pool.query.bind(pool);

// Overwrite the query method with your logging logic
pool.query = (text, values, callback) => {
  console.log('EXECUTING QUERY:', text, values);
  return originalQuery(text, values, callback);
};


module.exports = pool;
