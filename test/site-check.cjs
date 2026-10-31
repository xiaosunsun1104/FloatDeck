// Public, anonymous page compatibility probe. Never uses the user's browser session.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { installScript, compactScript, commandScript } = require('../src/player.cjs');
app.setPath('userData', path.join(app.getPath('temp'), 'duoview-site-check'));
app.whenReady().then(async () => {
  const reports = [];
  const urls = process.argv.includes('--douyin-only') ? ['https://www.douyin.com/'] : ['https://www.bilibili.com/', 'https://www.douyin.com/'];
  for (const url of urls) {
    const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'anonymous-probe' } });
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const report = { url };
    win.webContents.on('console-message', ({ level, message }) => {
      if (level === 'error' && /EvalError|SyntaxError|TrustedScript/.test(String(message))) report.scriptError = String(message).slice(0, 500);
    });
    let timeout;
    try {
      await Promise.race([win.loadURL(url).catch(error => { report.navigationWarning = error.message; }), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('page load timed out')), 25000); })]);
      clearTimeout(timeout);
      await delay(8000);
      report.currentUrl = win.webContents.getURL();
      if (process.argv.includes('--inspect-douyin')) {
        win.showInactive();
        await delay(1000);
        const folder = path.join(__dirname, '..', 'test-artifacts');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'douyin-page.png'), (await win.webContents.capturePage()).toPNG());
      }
      report.stage = 'inspect';
      report.page = await win.webContents.executeJavaScript('JSON.stringify({title: document.title, videoCount: document.querySelectorAll("video").length, videos: [...document.querySelectorAll("video")].map(v => ({readyState: v.readyState, paused: v.paused, duration: Number.isFinite(v.duration) ? v.duration : null})), links: [...document.querySelectorAll("a[href]")].map(a=>a.href).filter(u=>String(u).startsWith("https://www.bilibili.com/video/")).slice(0,1)})').then(JSON.parse);
      if (report.page.videoCount === 0 && report.page.links[0]) {
        await win.loadURL(report.page.links[0]);
        await delay(8000);
        report.videoPage = await win.webContents.executeJavaScript('({title: document.title, videoCount: document.querySelectorAll("video").length})');
      }
      report.stage = 'player';
      await win.webContents.executeJavaScript(installScript);
      report.compact = await win.webContents.executeJavaScript(compactScript(true));
      report.control = await win.webContents.executeJavaScript(commandScript('toggle', 5), true);
    } catch (error) { report.error = error.message; }
    finally { clearTimeout(timeout); if (!win.isDestroyed()) win.destroy(); }
    reports.push(report);
  }
  const directory = path.join(__dirname, '..', 'test-artifacts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'site-check.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
