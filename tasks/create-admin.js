// Creates an admin from the server, without email: verified, active and able
// to log in straight away. This is how the first admin comes to exist; admins
// can't self-register (POST /auth/register takes Property Owners only).
//
//   npm run create-admin -- <email>
//   docker exec -it <api container> node tasks/create-admin.js <email>
//
// Asks for the password twice with input hidden, so it stays out of shell
// history and the process list. Without a terminal it reads one line from
// stdin instead. Refuses an email that already has an account.
//
// Plain JS like seed/, so it runs from the production image without a build.
const bcrypt = require('bcrypt');
const pool = require('../config/database');

const USAGE = 'usage: npm run create-admin -- <email>';

// Mirrors emailPolicy() and passwordPolicy() in middleware/validations.js,
// which the image doesn't ship as source. Keep the two in step.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailProblem = (email) => {
  if (!EMAIL.test(email)) return 'Invalid email format';
  if (email.length > 100) return 'Email must be at most 100 characters';
  return null;
};
const passwordProblem = (password) => {
  if (password.length < 7 || password.length > 14) return 'Password must be 7 - 14 characters';
  if (!/[A-Z]/.test(password)) return 'Must include at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Must include at least one digit';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Must include at least one special character';
  return null;
};

const createAdmin = async ({ email, password }) => {
  email = email.trim();
  password = password.trim();
  const problem = emailProblem(email) || passwordProblem(password);
  if (problem) throw new Error(problem);

  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (rowCount) throw new Error(`${email} already has an account`);

  const hashed = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password, user_type_id, password_last_changed, is_verified)
     VALUES ($1, $2, (SELECT id FROM user_type WHERE name = 'admin'), CURRENT_TIMESTAMP, TRUE)
     RETURNING user_id`,
    [email, hashed]
  );
  return rows[0].user_id;
};

// Reads a line from the terminal without echoing it.
const askHidden = (question) =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          return resolve(value);
        }
        if (ch === '\u0003' || ch === '\u0004') {
          finish();
          return reject(new Error('Cancelled'));
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });

const readStdinLine = async () => {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.split(/\r?\n/)[0];
};

const askPassword = async () => {
  if (!process.stdin.isTTY) return readStdinLine();
  const password = await askHidden('Password: ');
  const problem = passwordProblem(password.trim());
  if (problem) throw new Error(problem);
  if ((await askHidden('Confirm password: ')) !== password) throw new Error('Passwords do not match');
  return password;
};

const main = async () => {
  const email = process.argv[2];
  if (!email || process.argv.length > 3) throw new Error(USAGE);
  const problem = emailProblem(email.trim());
  if (problem) throw new Error(problem);

  const userId = await createAdmin({ email, password: await askPassword() });
  console.log(`Created admin ${email.trim()} (${userId}).`);
};

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { createAdmin, passwordProblem };
