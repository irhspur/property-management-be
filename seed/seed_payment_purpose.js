const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "payment_purpose",
    columns: ["id", "payment_purpose", "created_at", "updated_at"],
    filePath: "./data/payment_purpose.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
