const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'test-artifacts', 'session-restart-'));
const electron = require('electron');
for (const phase of ['save', 'logout', 'verify-logout']) {
  execFileSync(electron, [path.join(root, 'test/session-restart.cjs'), directory, phase], { stdio: 'inherit', timeout: 30000 });
  if (phase === 'save') {
    // Simulate a missing native Cookie DB in this isolated fixture profile only.
    const cookies = path.join(directory, 'Partitions', 'restart-fixture', 'Network', 'Cookies');
    if (!cookies.startsWith(directory + path.sep)) throw new Error('Unexpected fixture path');
    fs.renameSync(cookies, cookies + '.fixture-backup');
  }
}
console.log('Three-process recovery passed, including persistent cookies with the native Cookie DB missing, and logout retention.');
const legacyDirectory = fs.mkdtempSync(path.join(root, 'test-artifacts', 'session-upgrade-'));
for (const phase of ['save-v1', 'logout', 'verify-logout']) {
  execFileSync(electron, [path.join(root, 'test/session-restart.cjs'), legacyDirectory, phase], { stdio: 'inherit', timeout: 30000 });
}
console.log('Old encrypted snapshot upgrades without losing session or persistent cookies.');
const faultDirectory = fs.mkdtempSync(path.join(root, 'test-artifacts', 'session-faults-'));
execFileSync(electron, [path.join(root, 'test/session-faults.cjs'), faultDirectory], { stdio: 'inherit', timeout: 30000 });
