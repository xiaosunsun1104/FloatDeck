const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function build() {
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const destination = path.join(root, 'dist', 'FloatDeck-win32-x64');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This prototype build script supports Windows x64');
if (fs.existsSync(destination)) throw new Error('Build directory already exists; choose a fresh output directory before building again');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), destination, { recursive: true });
fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, 'FloatDeck.exe'));
const { rcedit } = await import('rcedit');
await rcedit(path.join(destination, 'FloatDeck.exe'), { icon: path.join(root, 'assets', 'icon', 'floatdeck.ico') });
// Electron chooses resources/app.asar before resources/app. Remove its bundled demo only.
const bundledDemo = path.join(destination, 'resources', 'default_app.asar');
if (fs.existsSync(bundledDemo)) fs.unlinkSync(bundledDemo);
const appDirectory = path.join(destination, 'resources', 'app');
fs.mkdirSync(appDirectory, { recursive: true });
for (const file of ['src', 'assets/icon', 'package.json', 'README.md', 'README.en.md', 'docs/images', 'LICENSE']) {
  fs.mkdirSync(path.dirname(path.join(appDirectory, file)), { recursive: true });
  fs.cpSync(path.join(root, file), path.join(appDirectory, file), { recursive: true });
}
console.log(`Portable app: ${destination}`);
const archive = path.join(root, 'dist', `FloatDeck-${version}-windows-x64.zip`);
execFileSync('tar.exe', ['-a', '-cf', archive, '-C', path.dirname(destination), path.basename(destination)], { stdio: 'inherit' });
console.log(`Archive: ${archive}`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
