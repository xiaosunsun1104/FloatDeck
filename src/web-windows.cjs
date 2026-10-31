const { normalizeUrl } = require('./config.cjs');

// Keep the actual Chromium version while avoiding app-specific compatibility tokens.
function browserUserAgent(value, appName) {
  const tokens = value.split(' ');
  return tokens.filter(token => !token.startsWith('Electron/') && !token.startsWith(appName + '/') && !token.startsWith('FloatDeck/') && !token.startsWith('floatdeck/')).join(' ');
}
function configureWebWindows(root, { icon, show = true }) {
  const children = new Set();
  function configure(win) {
    const guard = (event, target) => {
      const url = typeof target === 'string' ? target : event.url;
      try { normalizeUrl(url); } catch { event.preventDefault(); }
    };
    if (win !== root) {
      win.removeMenu();
      win.webContents.on('will-navigate', guard);
      win.webContents.on('will-redirect', guard);
    }
    win.webContents.setWindowOpenHandler(({ url }) => {
      try { if (url !== 'about:blank') normalizeUrl(url); } catch { return { action: 'deny' }; }
      if (children.size >= 3) return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: root, width: 1000, height: 760, minWidth: 480, minHeight: 400,
          icon, show, autoHideMenuBar: true,
          webPreferences: { session: root.webContents.session, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true }
        }
      };
    });
    win.webContents.on('did-create-window', child => {
      children.add(child);
      configure(child);
      child.on('closed', () => children.delete(child));
    });
  }
  configure(root);
  root.on('closed', () => { for (const child of children) if (!child.isDestroyed()) child.destroy(); });
  return children;
}
module.exports = { browserUserAgent, configureWebWindows };
