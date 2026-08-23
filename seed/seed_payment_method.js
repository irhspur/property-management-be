const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "payment_method",
    columns: ["id", "payment_method", "created_at", "updated_at"],
    filePath: "./data/payment_method.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
