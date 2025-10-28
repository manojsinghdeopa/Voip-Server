// Script to clear data from users, call_logs, or both tables in the database.
// Usage: node scripts/clear-data.js users or call_logs or all


import db from '../db.js';
import readline from 'readline';

const VALID = {
  users: 'users',
  call_logs: 'call_logs',
  all: 'all',
};

function count(table) {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
  return row ? row.cnt : 0;
}

function deleteTable(table) {
  if (table === 'all') {
    const u = db.prepare('DELETE FROM users').run();
    const c = db.prepare('DELETE FROM call_logs').run();
    return { users: u.changes, call_logs: c.changes };
  }
  const stmt = db.prepare(`DELETE FROM ${table}`);
  const info = stmt.run();
  return { [table]: info.changes };
}

function promptConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  const arg = process.argv[2] || 'users';
  if (!Object.values(VALID).includes(arg)) {
    console.error('Usage: node scripts/clear-users.js [users|call_logs|all]');
    process.exit(1);
  }

  if (arg === 'all') {
    console.log('Counts before: users=', count('users'), 'call_logs=', count('call_logs'));
  } else {
    console.log(`${arg} before:`, count(arg));
  }

  const ans = await promptConfirm(`Delete rows from ${arg}? This is permanent. Type YES to continue: `);
  if (ans !== 'YES') {
    console.log('Aborted. No changes made.');
    try { db.close(); } catch (e) {}
    process.exit(0);
  }

  const result = deleteTable(arg);
  console.log('Deleted rows:', result);

  if (arg === 'all') {
    console.log('Counts after: users=', count('users'), 'call_logs=', count('call_logs'));
  } else {
    console.log(`${arg} after:`, count(arg));
  }

  try { db.close(); } catch (e) {}
}

main();
