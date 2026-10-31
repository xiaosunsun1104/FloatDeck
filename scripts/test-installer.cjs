const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { buildInstaller } = require('./build-installer.cjs');

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: 'ignore' });
    const timeout = setTimeout(() => reject(new Error('Installer timed out')), 120000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(path.basename(executable) + ' exited with ' + code));
    });
  });
}
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function waitUntil(check) {
  const deadline = Date.now() + 30000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Uninstall did not finish');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
async function main() {
  const result = await buildInstaller({ fixture: true });
  const destination = path.join(result.work, 'installed');
  const shortcutName = 'FloatDeck Installer QA ' + path.basename(result.work) + '.lnk';
  const desktop = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
  const shortcuts = [path.join(desktop, shortcutName), path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs', shortcutName)];
  const config = require('../installer.config.cjs');
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.runAfterFinish, false);
  const executable = path.join(destination, 'FloatDeckInstallerQA.exe');
  const checks = [];
  // A unique app ID, executable and shortcut name isolate the test from the user's installation.
  for (let pass = 1; pass <= 2; pass++) {
    await run(result.installer, ['/S', '/D=' + destination]);
    assert.equal(digest(executable), digest(path.join(result.appDirectory, 'FloatDeckInstallerQA.exe')));
    for (const file of ['main.cjs', 'session-state.cjs', 'session-files.cjs']) {
      assert.equal(digest(path.join(destination, 'resources/app/src', file)), digest(path.join(result.appDirectory, 'resources/app/src', file)));
    }
    for (const shortcut of shortcuts) assert.ok(fs.existsSync(shortcut), 'Missing shortcut: ' + shortcut);
    assert.ok(!fs.existsSync(path.join(destination, 'resources/app/node_modules')), 'Build dependencies must not ship');
    checks.push(pass === 1 ? 'install-payload-and-shortcuts' : 'reinstall-same-location');
  }
  const uninstaller = fs.readdirSync(destination).find(name => /^Uninstall.*\.exe$/i.test(name));
  assert.ok(uninstaller, 'Uninstaller missing');
  await run(path.join(destination, uninstaller), ['/S']);
  await waitUntil(() => !fs.existsSync(executable) && shortcuts.every(file => !fs.existsSync(file)));
  checks.push('uninstall-removes-test-payload-and-shortcuts');
  const report = { checks, fixtureDirectory: result.work, realProfileLaunched: false, appDataDeletionEnabled: false };
  fs.writeFileSync(path.join(__dirname, '../test-artifacts/installer-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
