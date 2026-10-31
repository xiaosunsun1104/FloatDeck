const fs = require('node:fs');
const path = require('node:path');

const APP_FILES = ['src', 'assets/icon', 'package.json', 'README.md', 'README.en.md', 'docs/images', 'LICENSE'];
async function prepareApp(destination, executableName = 'FloatDeck') {
  const root = path.resolve(__dirname, '..');
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 is required for this build');
  if (fs.existsSync(destination)) throw new Error('Build directory already exists; preserve it before creating a fresh build');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), destination, { recursive: true });
  fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, executableName + '.exe'));
  const { rcedit } = await import('rcedit');
  const { version, productName } = require('../package.json');
  await rcedit(path.join(destination, executableName + '.exe'), {
    icon: path.join(root, 'assets/icon/floatdeck.ico'),
    'file-version': version,
    'product-version': version,
    'version-string': {
      ProductName: productName,
      FileDescription: productName,
      OriginalFilename: executableName + '.exe',
      CompanyName: 'xiaosunsun1104',
      LegalCopyright: 'Copyright (c) 2026 xiaosunsun1104'
    }
  });
  const bundledDemo = path.join(destination, 'resources/default_app.asar');
  if (fs.existsSync(bundledDemo)) fs.unlinkSync(bundledDemo);
  const appDirectory = path.join(destination, 'resources/app');
  for (const file of APP_FILES) {
    fs.mkdirSync(path.dirname(path.join(appDirectory, file)), { recursive: true });
    fs.cpSync(path.join(root, file), path.join(appDirectory, file), { recursive: true });
  }
  return destination;
}
module.exports = { prepareApp, APP_FILES };
