const copyCsvToTable = require("./copy_csv_to_table");
const pool = require("../config/database");

async function run() {
  await copyCsvToTable({
    table: "bs_month",
    columns: ["id", "bs_year", "bs_month", "month_name", "ad_start_date", "days", "created_at", "updated_at"],
    filePath: "./data/bs_month.csv",
  });

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
