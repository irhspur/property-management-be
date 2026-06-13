const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "property_types",
    columns: ["id", "name", "created_at", "updated_at"],
    filePath: "./data/property_types.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
