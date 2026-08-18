const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "agreement_duration",
    columns: ["id", "duration_in_years", "created_at", "updated_at"],
    filePath: "./data/agreement_duration.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
