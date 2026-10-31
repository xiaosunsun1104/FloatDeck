const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(root, 'test-artifacts', 'packaged-profile-'));
// Hardlink immutable runtime files, but copy the app's source into each installation.
function runtime(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) runtime(source, target);
    else if (entry.name !== 'default_app.asar') fs.linkSync(source, target);
  }
}
async function run(executable, phase, origin, args = []) {
  const child = spawn(executable, args, { env: { ...process.env, FLOATDECK_FIXTURE: JSON.stringify({ testRoot: directory, phase, origin }) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged fixture timed out: ' + phase + '\n' + output)); }, 25000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); if (code !== (phase === 'crash' ? 73 : 0)) reject(new Error(output)); else resolve(); });
  });
  console.log(output.split('\n').filter(line => line.includes('Packaged lifecycle passed:')).join('\n'));
}
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Local account fixture</title><body data-ready="yes" data-auth="' + (req.headers.cookie?.includes('session_fixture=invented-session') ? 'yes' : 'no') + '">Invented account fixture</body>'); });
(async () => {
  const applications = [];
  for (const folder of ['首次安装', '更新并移动到另一个目录']) {
    const install = path.join(directory, folder);
    runtime(path.dirname(require('electron')), install);
    fs.renameSync(path.join(install, 'electron.exe'), path.join(install, 'FloatDeck.exe'));
    const appDir = path.join(install, 'resources', 'app');
    fs.mkdirSync(appDir, { recursive: true });
    for (const item of ['src', 'assets/icon']) fs.cpSync(path.join(root, item), path.join(appDir, item), { recursive: true });
    fs.copyFileSync(path.join(root, 'test/packaged-session.cjs'), path.join(appDir, 'fixture.cjs'));
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ ...require('../package.json'), main: 'fixture.cjs' }));
    applications.push(path.join(install, 'FloatDeck.exe'));
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  await run(applications[0], 'save', origin);
  await run(applications[0], 'crash', origin);
  // Damage only isolated fixture data, forcing the new copy-recovery path.
  const profile = path.resolve(directory, '模拟用户 甲', 'duoview');
  if (!profile.startsWith(path.resolve(directory) + path.sep)) throw new Error('Unexpected fixture profile');
  fs.writeFileSync(path.join(profile, 'login-session.encrypted'), 'invented truncated primary');
  const database = path.join(profile, 'Partitions', 'duoview-video', 'Network', 'Cookies');
  fs.renameSync(database, database + '.fixture-loss-backup');
  await run(require('electron'), 'verify', origin, [path.join(path.dirname(applications[0]), 'resources/app/fixture.cjs')]);
  await run(applications[1], 'fresh', origin);
  await run(applications[1], 'logout', origin);
  await run(applications[0], 'verify-logout', origin);
  console.log('Passed: packaged/development launch, second instance, changed install path, separate local users, shutdown notification, abrupt exit, damaged-primary recovery, cookies reaching the server, localStorage, IndexedDB, final close writes and logout.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
