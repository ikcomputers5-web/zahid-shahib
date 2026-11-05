'use strict';

/**
 * Admin credential helper — for the login you keep for yourself, not in git.
 *
 *   npm run admin:password -- "new-password"     change the password
 *   npm run admin:password -- --email you@x.com  change the sign-in email
 *   npm run admin:password -- --show             show email + where the hash lives
 *
 * The password is never printed by this tool (except the generated one) and is
 * never written back to the repository: only its scrypt hash is stored in the
 * database, exactly like a password set from the admin panel.
 */

const crypto = require('crypto');
const { read, save, READ_ONLY } = require('./db');
const { hashPassword } = require('./seed');

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function usage() {
  console.log(`
  Usage:
    npm run admin:password -- "<new password>"        set a new admin password
    npm run admin:password -- --generate              generate and print one
    npm run admin:password -- --email you@example.com change the sign-in email
    npm run admin:password -- --show                  show the current sign-in email

  Minimum 6 characters. Only a scrypt hash is stored — the password itself is
  never written to the database or to git.
`);
}

async function main() {
  const args = process.argv.slice(2);
  const settings = read().settings;

  if (!args.length || args[0] === '--help' || args[0] === '-h') return usage();

  if (READ_ONLY) {
    fail('This checkout is running in read-only preview mode, so there is nothing to write.');
  }

  if (args[0] === '--show') {
    console.log(`\n  Admin email:    ${settings.adminEmail || '(not set)'}`);
    console.log(`  Password hash:  ${settings.adminPasswordHash ? 'set (scrypt)' : 'MISSING — run this script with a new password'}`);
    console.log(`  Database:       data/db.json (git-ignored)\n`);
    return;
  }

  if (args[0] === '--email') {
    const email = String(args[1] || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
    settings.adminEmail = email;
    await save();
    console.log(`\n  Sign-in email updated to ${email}.\n`);
    return;
  }

  let password;
  if (args[0] === '--generate') {
    password = crypto.randomBytes(9).toString('base64url');
  } else {
    password = args.join(' ');
  }
  if (String(password).length < 6) fail('The password must be at least 6 characters.');

  const { salt, hash } = hashPassword(password);
  settings.adminPasswordSalt = salt;
  settings.adminPasswordHash = hash;
  // If ADMIN_PASSWORD is set on the deployment it is authoritative on the next
  // boot, so keep the stored tag in sync only when it matches this password.
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD === password) {
    settings.adminPasswordEnvTag = require('./seed').adminPasswordEnvTag(password, settings);
  }
  await save();

  console.log('\n  Admin password updated. Sign-in details:');
  console.log(`    email:    ${settings.adminEmail}`);
  if (args[0] === '--generate') console.log(`    password: ${password}`);
  else console.log('    password: (the one you just entered — not stored anywhere in plain text)');
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD !== password) {
    console.log('\n  Note: ADMIN_PASSWORD is set in this environment and takes priority on restart.');
    console.log('  Update or remove it if you want this new password to stick.');
  }
  console.log('');
}

main().catch((err) => fail(err.message));
