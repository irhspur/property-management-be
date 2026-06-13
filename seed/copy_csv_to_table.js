const fs = require("fs");
const path = require("path");
const copyFrom = require("pg-copy-streams").from;
const pool = require("../config/database");

/**
 * Copy CSV into a table using PostgreSQL COPY
 *
 * @param {Object} options
 * @param {string} options.table - target table name
 * @param {string[]} options.columns - column names in correct order
 * @param {string} options.filePath - relative or absolute path to CSV
 * @param {string} [options.conflictColumn] - optional column for ON CONFLICT DO NOTHING
 */
async function copyCsvToTable({ table, columns, filePath, conflictColumn }) {
  const client = await pool.connect();

  console.log(filePath)

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  const tempTable = conflictColumn ? `${table}_import_temp` : null;

  try {
    await client.query("BEGIN");

    if (conflictColumn) {
      await client.query(`
        CREATE TEMP TABLE ${tempTable}
        (LIKE ${table} INCLUDING ALL)
        ON COMMIT DROP
      `);
    }

    const targetTable = tempTable || table;

    const copyQuery = `
      COPY ${targetTable} (${columns.join(", ")})
      FROM STDIN
      WITH (FORMAT csv, HEADER true)
    `;

    const stream = client.query(copyFrom(copyQuery));
    const fileStream = fs.createReadStream(absolutePath);

    fileStream.pipe(stream);

    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    if (conflictColumn) {
      await client.query(`
        INSERT INTO ${table}
        SELECT * FROM ${tempTable}
        ON CONFLICT (${conflictColumn}) DO NOTHING
      `);
    }

    await client.query("COMMIT");

    console.log(`✅ Successfully copied ${filePath} into ${table}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ COPY failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = copyCsvToTable;
