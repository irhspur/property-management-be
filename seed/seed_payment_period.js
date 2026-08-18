const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "payment_period",
    columns: ["id", "payment_period", "created_at", "updated_at"],
    filePath: "./data/payment_period.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
