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
    const { rows } = await client.query(`SELECT 1 FROM ${table} LIMIT 1`);
    if (rows.length > 0) {
      console.log(`⏭️  Skipping ${table} — already seeded`);
      return;
    }

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

    // COPY writes explicit ids without advancing the id sequence, so the next
    // insert that relies on the default would collide with a seeded row.
    const { rows: seqRows } = await client.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS seq
       WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id')`,
      [table]
    );
    if (seqRows[0]?.seq) {
      await client.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1))`, [seqRows[0].seq]);
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
