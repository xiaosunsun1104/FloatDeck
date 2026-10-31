// Opt-in public-site integration check; isolated in-memory session, no account login.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { installScript, commandScript, compactScript, capabilitiesScript } = require('../src/player.cjs');
const { runCommand } = require('../src/commands.cjs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { partition: 'floatdeck-live-check', sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.session.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
  await win.loadURL('https://www.douyin.com/?recommend=1');
  win.showInactive();
  await win.webContents.executeJavaScript(`(()=>{const links=[...document.querySelectorAll('a[href]')].filter(a=>{const u=new URL(a.href);return u.hostname==='www.douyin.com'&&u.pathname==='/'&&u.searchParams.get('recommend')==='1'}); if(links.length===1) links[0].click();})()`);
  await delay(1500);
  await win.webContents.executeJavaScript(installScript);
  const identity = () => win.webContents.executeJavaScript(`(()=>{const active=document.querySelector('[data-e2e="slideList"][data-active="true"]') || document.querySelector('[data-e2e="feed-active-video"]'); const description=active?.querySelector('[data-e2e="video-desc"]')?.textContent; if(description)return description; const videos=[...document.querySelectorAll('video')].filter(v=>{const r=v.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight}); videos.sort((a,b)=>Number(!b.paused)-Number(!a.paused)); return videos[0]?.currentSrc || '';})()`);
  for (let i = 0; i < 45; i++) {
    const cap = await win.webContents.executeJavaScript(capabilitiesScript);
    if (cap?.actions.includes('next') && cap.actions.includes('toggle') && await win.webContents.executeJavaScript('[...document.querySelectorAll("video")].some(v=>v.readyState>=2 && !v.paused)') && await identity()) { await delay(2000); break; }
    await delay(1000);
  }
  const before = await identity();
  await win.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='我知道了');button?.click();})()`, true);
  if (!before) {
    fs.writeFileSync(path.join(__dirname, '../test-artifacts/douyin-live-check.png'), (await win.webContents.capturePage()).toPNG());
    throw new Error('Public Douyin feed did not load');
  }
  const cap = await win.webContents.executeJavaScript(capabilitiesScript);
  const next = await runCommand(win, 'next', 5);
  for (let i = 0; i < 20 && await identity() === before; i++) await delay(500);
  const after = await identity();
  if (!next.ok || !after || after === before) {
    fs.writeFileSync(path.join(__dirname, '../test-artifacts/douyin-live-check.png'), (await win.webContents.capturePage()).toPNG());
    throw new Error('Next command did not change active video');
  }
  const previous = await runCommand(win, 'previous', 5);
  for (let i = 0; i < 20 && await identity() !== before; i++) await delay(500);
  if (!previous.ok || await identity() !== before) throw new Error('Previous command did not restore active video');
  await win.webContents.executeJavaScript(compactScript(true));
  const compactNext = await runCommand(win, 'next', 5);
  for (let i = 0; i < 20 && await identity() === before; i++) await delay(500);
  if (!compactNext.ok || await identity() === before) throw new Error('Compact next failed');
  fs.writeFileSync(path.join(__dirname, '../test-artifacts/douyin-adapter-report.json'), JSON.stringify({ passed: true, capabilities: cap, next: true, previous: true, compactNext: true, testedAt: new Date().toISOString() }, null, 2));
  console.log('Public Douyin: next, previous and compact next passed. No account used.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
