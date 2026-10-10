// Applies (or reverts) schema migrations from migrations/ — ADR-0012.
//
//   node scripts/migrate.js up                   apply every pending migration
//   node scripts/migrate.js up 1                 apply the next one only
//   node scripts/migrate.js down                 revert the last one
//   node scripts/migrate.js up --fake --file <name>
//                                                record <name> as applied without
//                                                running it (adopting an existing DB)
//
// Connects with the app's own DB_* variables, so there is no DATABASE_URL to
// keep in step with them. Exits non-zero on failure: in the prod stack the API
// waits on this container and does not start.

require('dotenv').config();

const USAGE = 'usage: node scripts/migrate.js <up|down> [count] [--fake] [--file <migration-name>]';

function parseArgs(argv) {
  const [direction, ...rest] = argv;
  if (direction !== 'up' && direction !== 'down') throw new Error(USAGE);

  const args = { direction, count: undefined, fake: false, file: undefined };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--fake') args.fake = true;
    else if (arg === '--file') args.file = rest[++i];
    else if (/^\d+$/.test(arg)) args.count = Number(arg);
    else throw new Error(`unknown argument "${arg}"\n${USAGE}`);
  }
  if (rest.includes('--file') && !args.file) throw new Error(`--file needs a migration name\n${USAGE}`);

  // --fake with no target would mark every pending migration as applied,
  // including real ones nobody has run. Make the caller say which.
  if (args.fake && args.file === undefined && args.count === undefined) {
    throw new Error(`--fake needs --file <name> or a count, so only the intended migration is marked\n${USAGE}`);
  }

  // `down` with no count reverts one migration, as the node-pg-migrate CLI does.
  if (direction === 'down' && args.count === undefined) args.count = 1;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // node-pg-migrate v8 is ESM-only.
  const { runner } = await import('node-pg-migrate');

  await runner({
    databaseUrl: {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
    },
    dir: 'migrations',
    migrationsTable: 'pgmigrations',
    direction: args.direction,
    count: args.count,
    file: args.file,
    fake: args.fake,
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
