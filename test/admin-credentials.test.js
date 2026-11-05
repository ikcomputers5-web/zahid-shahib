'use strict';

// Admin credentials must never ship with the repo: no plaintext password in
// source, on the login screen, or in any public API response. These tests run
// the real server in a throwaway directory so they never touch data/db.json.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/** A throwaway copy of the app (no node_modules, no data dir). */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ismail-admin-'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'server.js'), path.join(dir, 'server.js'));
  return dir;
}

function run(dir, script, extraEnv = {}) {
  const base = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };
  for (const key of ['VERCEL', 'ADMIN_PASSWORD', 'ADMIN_EMAIL', 'SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
    delete base[key];
  }
  const env = { ...base, ...extraEnv };
  return execFileSync(process.execPath, ['-e', script], { cwd: dir, env }).toString();
}

function withSandbox(fn) {
  const dir = sandbox();
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('nothing in the shipped source contains a default admin password', () => {
  const files = ['README.md', '.env.example', 'public/admin.html', 'public/js/admin.js', 'src/seed.js', 'src/auth.js', 'src/db.js'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/ismail2026/.test(text), `${file} must not contain the old demo password`);
    // A literal ADMIN_PASSWORD=<value> default (as opposed to documentation
    // placeholders) would leak the credential into git.
    assert.ok(!/process\.env\.ADMIN_PASSWORD\s*\|\|\s*['"][^'"]+['"]/.test(text), `${file} must not hardcode a fallback password`);
  }
});

test('a fresh install generates a password instead of using a known one', () => {
  withSandbox((dir) => {
    const out = run(
      dir,
      `const db = require('./src/db');
       const auth = require('./src/auth');
       db.read();
       console.log(JSON.stringify({
         demoStillWorks: auth.verifyCredentials('admin@ismailelegance.pk', 'ismail2026'),
         hasHash: Boolean(db.read().settings.adminPasswordHash),
         stored: JSON.stringify(db.read().settings)
       }));`
    );
    assert.match(out, /generated/i, 'the generated password is announced once');
    const result = JSON.parse(out.trim().split('\n').pop());
    assert.equal(result.demoStillWorks, false, 'the old demo password must not sign in');
    assert.equal(result.hasHash, true);
    assert.ok(!/password"\s*:\s*"(?!$)/i.test(result.stored), 'no plaintext password field in the database');
    // Announced only once: a second boot stays quiet.
    const second = run(dir, "require('./src/db').read(); console.log('booted');");
    assert.ok(!/generated/i.test(second), 'generated password is printed only once');
  });
});

test('ADMIN_PASSWORD / ADMIN_EMAIL from the environment set the credentials, once per value', () => {
  withSandbox((dir) => {
    const env = { ADMIN_PASSWORD: 'OwnerSecret#1', ADMIN_EMAIL: 'Owner@Example.com' };
    const check = (password, extraEnv = env) =>
      run(
        dir,
        `const db = require('./src/db');
         const auth = require('./src/auth');
         db.read();
         db.persistCredentialsIfChanged();
         console.log(JSON.stringify({
           ok: auth.verifyCredentials('owner@example.com', ${JSON.stringify(password)}),
           bad: auth.verifyCredentials('owner@example.com', 'wrong-password'),
           email: db.read().settings.adminEmail
         }));`,
        extraEnv
      );
    const first = JSON.parse(check('OwnerSecret#1').trim().split('\n').pop());
    assert.equal(first.ok, true);
    assert.equal(first.bad, false);
    assert.equal(first.email, 'owner@example.com', 'email is normalised');

    // A password changed in the panel survives a restart while the env var is
    // absent — the deployment must not claw back a private change. (The panel
    // writes the tag of the current env value itself; mirror that here.)
    run(
      dir,
      `const db = require('./src/db');
       const { hashPassword, adminPasswordEnvTag } = require('./src/seed');
       const { salt, hash } = hashPassword('ChangedInPanel#1');
       db.read().settings.adminPasswordSalt = salt;
       db.read().settings.adminPasswordHash = hash;
       if (process.env.ADMIN_PASSWORD) {
         db.read().settings.adminPasswordEnvTag = adminPasswordEnvTag(process.env.ADMIN_PASSWORD, db.read().settings);
       }
       db.save();`,
      env
    );
    const afterPanelChange = run(
      dir,
      `const db = require('./src/db'); const auth = require('./src/auth');
       db.read(); db.persistCredentialsIfChanged();
       console.log(JSON.stringify({ panel: auth.verifyPassword('ChangedInPanel#1'), old: auth.verifyPassword('OwnerSecret#1') }));`
    );
    const kept = JSON.parse(afterPanelChange.trim().split('\n').pop());
    assert.equal(kept.panel, true, 'panel password survives a restart without the env var');
    assert.equal(kept.old, false);

    // Changing the env var is picked up on the next boot (authoritative once),
    // and the panel password it replaced stops working.
    const changed = JSON.parse(
      check('OwnerSecret#2', { ...env, ADMIN_PASSWORD: 'OwnerSecret#2' }).trim().split('\n').pop()
    );
    assert.equal(changed.ok, true, 'a new ADMIN_PASSWORD takes effect on the next boot');
    const stillPanel = run(
      dir,
      `const db = require('./src/db'); const auth = require('./src/auth');
       db.read(); db.persistCredentialsIfChanged();
       console.log(JSON.stringify({ panel: auth.verifyPassword('ChangedInPanel#1') }));`
    );
    assert.equal(JSON.parse(stillPanel.trim().split('\n').pop()).panel, false, 'superseded password rejected');
  });
});

test('the admin CLI sets a password that signs in, and stores no plaintext', () => {
  withSandbox((dir) => {
    run(dir, "require('./src/db').read();");
    execFileSync(process.execPath, ['src/admin-cli.js', 'CliSetPassword#1'], { cwd: dir, env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') } });
    const stored = fs.readFileSync(path.join(dir, 'data', 'db.json'), 'utf8');
    assert.ok(!stored.includes('CliSetPassword#1'), 'password must never be written to the database');
    const result = JSON.parse(
      run(
        dir,
        `const db = require('./src/db'); const auth = require('./src/auth');
         console.log(JSON.stringify({ ok: auth.verifyCredentials(db.read().settings.adminEmail, 'CliSetPassword#1') }));`
      ).trim().split('\n').pop()
    );
    assert.equal(result.ok, true);
  });
});

test('login works over HTTP and the login page / public API leak nothing', () => {
  withSandbox((dir) => {
    const script = `
      const app = require('./server');
      const server = app.listen(0, '127.0.0.1', async () => {
        const base = 'http://127.0.0.1:' + server.address().port;
        const post = (body) => fetch(base + '/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const good = await post({ email: 'admin@ismailelegance.pk', password: 'HttpTestPassword#1' });
        const bad = await post({ email: 'admin@ismailelegance.pk', password: 'nope' });
        const wrongEmail = await post({ email: 'intruder@example.com', password: 'HttpTestPassword#1' });
        const page = await (await fetch(base + '/admin')).text();
        const boot = await (await fetch(base + '/api/bootstrap')).json();
        server.close();
        console.log(JSON.stringify({
          good: good.status, bad: bad.status, wrongEmail: wrongEmail.status,
          cookie: (good.headers.get('set-cookie') || '').includes('ie_admin='),
          pageLeaks: /HttpTestPassword|ismail2026|adminPasswordHash/i.test(page),
          apiLeaks: /adminPassword(Hash|Salt|EnvTag)/.test(JSON.stringify(boot))
        }));
      });
    `;
    const out = run(dir, script, { ADMIN_PASSWORD: 'HttpTestPassword#1' });
    const result = JSON.parse(out.trim().split('\n').pop());
    assert.equal(result.good, 200, 'correct credentials sign in');
    assert.equal(result.bad, 401, 'wrong password rejected');
    assert.equal(result.wrongEmail, 401, 'wrong email rejected');
    assert.equal(result.cookie, true, 'session cookie issued');
    assert.equal(result.pageLeaks, false, 'login page contains no credentials');
    assert.equal(result.apiLeaks, false, 'public bootstrap contains no credential fields');
  });
});
