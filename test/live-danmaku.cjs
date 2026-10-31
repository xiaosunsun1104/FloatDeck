// One public playback-page visit per site; no real profile, login or account actions.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { installScript, compactScript } = require('../src/player.cjs');
const assert = require('node:assert/strict');
const probe = `(()=>{const rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,cls:String(e.className),rect:{x:r.x,y:r.y,w:r.width,h:r.height},visibility:s.visibility,display:s.display,opacity:s.opacity,z:s.zIndex,overflow:s.overflow,transform:s.transform}};return {viewport:[innerWidth,innerHeight],videos:[...document.querySelectorAll('video')].map(rect),layers:[...document.querySelectorAll('.bpx-player-render-dm-wrap,.bpx-player-row-dm-wrap,.danmu')].map(e=>({layer:rect(e),children:e.children.length,ancestors:(()=>{const a=[];for(let p=e.parentElement;p&&a.length<5;p=p.parentElement)a.push(rect(p));return a})()}))}})()`;
app.whenReady().then(async () => {
  const results = {};
  for (const [site, url] of [['bilibili','https://www.bilibili.com/video/BV1xrnz6gEVD/'], ['douyin','https://www.douyin.com/']]) {
    if (process.argv[2] && process.argv[2] !== site) continue;
    const win = new BrowserWindow({ show: false, width: 1100, height: 720, webPreferences: { partition: 'live-danmaku-inspection', sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    try {
      await win.loadURL(url); win.showInactive();
      if (site === 'douyin') {
        await delay(1500);
        await win.webContents.executeJavaScript(`(()=>{const a=[...document.querySelectorAll('a')].find(a=>{try{const u=new URL(a.href);return u.pathname==='/'&&u.searchParams.get('recommend')==='1'}catch{return false}});a?.click()})()`, true);
      }
      for (let i=0;i<40;i++) {
        if (await win.webContents.executeJavaScript('[...document.querySelectorAll("video")].some(v=>{const r=v.getBoundingClientRect();return r.width>100&&r.height>100&&r.top<innerHeight&&r.bottom>0})')) break;
        await delay(500);
      }
      await win.webContents.executeJavaScript(installScript);
      await win.webContents.executeJavaScript('(()=>{const v=document.querySelector("video");if(v?.paused){v.muted=true;v.play().catch(()=>{})}})()', true);
      await delay(3000);
      const before = await win.webContents.executeJavaScript(probe);
      fs.writeFileSync(path.join(__dirname, `../test-artifacts/${site}-live-before.png`), (await win.webContents.capturePage()).toPNG());
      const compact = await win.webContents.executeJavaScript(compactScript(true));
      await delay(2000);
      const after = await win.webContents.executeJavaScript(probe);
      fs.writeFileSync(path.join(__dirname, `../test-artifacts/${site}-live-after.png`), (await win.webContents.capturePage()).toPNG());
      results[site] = { before, compact, after };
      assert.ok(compact.ok && compact.found, site + ': real visible video did not load');
      assert.ok(after.layers.some(item => item.layer.visibility === 'visible' && item.children > 0 && item.layer.rect.w > 100), site + ': no populated visible native danmaku layer after compact');
      console.log(site + ': ' + JSON.stringify(results[site]));
    } finally { win.destroy(); }
  }
  fs.writeFileSync(path.join(__dirname, '../test-artifacts/live-danmaku-layout.json'), JSON.stringify(results,null,2));
  app.exit(0);
}).catch(error=>{console.error(error.message);app.exit(1)});
