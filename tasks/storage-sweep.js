// Finds stored files that no row points at, and rows that point at missing
// files (ADR-0010). Reports by default; deletes the unreferenced files only
// with --delete. Never touches rows.
//
//   npm run storage:sweep               # report
//   npm run storage:sweep -- --delete   # report, then delete unreferenced files
//
// Plain JS like seed/, so it runs from the production image without a build.
// The root default must match services/fileStore.ts.
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const root = path.resolve(process.env.UPLOAD_ROOT || 'uploads');
const shouldDelete = process.argv.includes('--delete');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const pruneEmptyDirs = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  if (dir !== root && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
};

const main = async () => {
  if (!fs.existsSync(root)) {
    console.log(`No storage root at ${root}; nothing to sweep.`);
    return;
  }

  const { rows } = await pool.query(
    `SELECT file_path AS p FROM files
     UNION
     SELECT profile_photo_path FROM users WHERE profile_photo_path IS NOT NULL`
  );
  // Rows hold the path as written, relative to the app's working directory.
  const referenced = new Set(rows.map((r) => path.resolve(r.p)));

  const stored = walk(root);
  const unreferenced = stored.filter((p) => !referenced.has(p));
  const missing = [...referenced].filter((p) => p.startsWith(root + path.sep) && !fs.existsSync(p));

  const bytes = unreferenced.reduce((sum, p) => sum + fs.statSync(p).size, 0);
  console.log(`Root: ${root}`);
  console.log(`Stored files: ${stored.length}, referenced paths: ${referenced.size}`);
  console.log(`\nUnreferenced files (${unreferenced.length}, ${(bytes / 1024 / 1024).toFixed(2)} MB):`);
  for (const p of unreferenced) console.log(`  ${path.relative(root, p)}`);
  console.log(`\nRows pointing at missing files (${missing.length}) — not changed, check by hand:`);
  for (const p of missing) console.log(`  ${path.relative(root, p)}`);

  if (!shouldDelete) {
    if (unreferenced.length) console.log('\nReport only. Re-run with --delete to remove the unreferenced files.');
    return;
  }
  for (const p of unreferenced) fs.rmSync(p, { force: true });
  pruneEmptyDirs(root);
  console.log(`\nDeleted ${unreferenced.length} unreferenced files.`);
};

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
