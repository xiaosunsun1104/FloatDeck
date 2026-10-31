const path = require('node:path');

module.exports = {
  appId: 'org.floatdeck.app',
  productName: 'FloatDeck浮利机',
  artifactName: 'FloatDeck-Setup-${version}-x64.exe',
  directories: { output: path.join(__dirname, 'dist') },
  compression: 'normal',
  publish: null,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    executableName: 'FloatDeck',
    icon: path.join(__dirname, 'assets/icon/floatdeck.ico'),
    signAndEditExecutable: false
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'FloatDeck浮利机',
    deleteAppDataOnUninstall: false,
    runAfterFinish: false,
    installerLanguages: ['zh_CN', 'en_US'],
    displayLanguageSelector: false,
    differentialPackage: false,
    packElevateHelper: false
  }
};
