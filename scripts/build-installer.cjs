const fs = require('node:fs');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const { prepareApp } = require('./package-app.cjs');

async function buildInstaller({ fixture = false } = {}) {
  const root = path.resolve(__dirname, '..');
  const config = structuredClone(require('../installer.config.cjs'));
  fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
  const work = fs.mkdtempSync(path.join(root, 'test-artifacts', fixture ? 'installer-qa-' : 'installer-build-'));
  if (fixture) {
    config.appId = 'org.floatdeck.installer-qa.' + path.basename(work);
    config.productName = 'FloatDeck Installer QA';
    config.artifactName = 'FloatDeck-Installer-QA.exe';
    config.directories.output = work;
    config.win.executableName = 'FloatDeckInstallerQA';
    config.nsis.shortcutName = 'FloatDeck Installer QA ' + path.basename(work);
  }
  const appDirectory = await prepareApp(path.join(work, 'app'), config.win.executableName);
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    prepackaged: appDirectory,
    projectDir: root,
    config,
    publish: 'never'
  });
  const result = { work, appDirectory, installer: artifacts.find(file => file.endsWith('.exe')) };
  if (!result.installer) throw new Error('Installer output was not produced');
  if (!fixture) console.log('Windows installer: ' + result.installer);
  return result;
}
if (require.main === module) buildInstaller().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildInstaller };
