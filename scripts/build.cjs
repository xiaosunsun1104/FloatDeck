const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareApp } = require('./package-app.cjs');

async function build() {
  const root = path.resolve(__dirname, '..');
  const { version } = require('../package.json');
  const destination = path.join(root, 'dist', 'FloatDeck-win32-x64');
  await prepareApp(destination);
  console.log(`Portable app: ${destination}`);
  const archive = path.join(root, 'dist', `FloatDeck-${version}-windows-x64.zip`);
  execFileSync('tar.exe', ['-a', '-cf', archive, '-C', path.dirname(destination), path.basename(destination)], { stdio: 'inherit' });
  console.log(`Archive: ${archive}`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
