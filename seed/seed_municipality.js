const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "municipality",
    columns: ["id", "name", "district_id", "created_at", "updated_at"],
    filePath: "./data/municipality.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
