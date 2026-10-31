const { app, BrowserWindow, session, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { installScript, compactScript } = require('../src/player.cjs');
const { runCommand } = require('../src/commands.cjs');
const { setTimeout: delay } = require('node:timers/promises');
app.whenReady().then(async () => {
  const output = path.join(__dirname, '../test-artifacts');
  const media = fs.readFileSync(path.join(output, 'fixture.mp4')).toString('base64');
  const isolated = session.fromPartition('native-control-fixture');
  isolated.protocol.handle('https', request => {
    const bili = new URL(request.url).hostname === 'www.bilibili.com';
    const stage = bili ? 'bpx-player-video-area' : 'xgplayer';
    const overlay = bili ? 'bpx-player-render-dm-wrap' : 'danmu';
    return new Response(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#ddd}.stage{position:relative;width:480px;height:270px;margin:70px}video{width:100%;height:100%}.comments{position:absolute;inset:0;overflow:hidden;pointer-events:none}.line{white-space:nowrap;position:absolute;top:30px;color:white;text-shadow:1px 1px black;font:24px sans-serif;animation:scroll 8s linear infinite}@keyframes scroll{from{left:100%}to{left:-50%}}</style><input id="editing" value="未发送的弹幕草稿"><p id="unrelated">网页其他内容</p><div class="stage ${stage}"><video muted loop src="data:video/mp4;base64,${media}"></video><div class="comments ${overlay}"><div class="line">原生弹幕 · 保留原样式与滚动</div><canvas width="160" height="40"></canvas></div><button id="unwanted">其他控件</button></div><div data-e2e="video-switch-prev-arrow" style="width:40px;height:40px">上</div><div data-e2e="video-switch-next-arrow" style="width:40px;height:40px">下</div><script>window.position=1;window.keys=[];document.addEventListener('keydown',e=>{window.keys.push({key:e.key,ctrl:e.ctrlKey,trusted:e.isTrusted});if(e.isTrusted&&!e.ctrlKey){if(e.key==='ArrowDown')position++;if(e.key==='ArrowUp')position--;}});document.querySelector('video').play();</script>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const targets = [];
  for (const host of ['www.bilibili.com', 'www.douyin.com']) {
    const win = new BrowserWindow({ show: false, title: 'FloatDeck后台视频测试', width: 700, height: 500, webPreferences: { session: isolated, sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    targets.push(win);
    await win.loadURL('https://' + host + '/fixture');
    await win.webContents.executeJavaScript(installScript);
    if (host.includes('douyin')) await win.webContents.executeJavaScript('window.lateOverlay=document.querySelector(".comments");window.lateOverlay.remove()');
    win.showInactive();
    await win.webContents.executeJavaScript(compactScript(true));
    if (host.includes('douyin')) {
      await win.webContents.executeJavaScript('document.querySelector(".stage").append(window.lateOverlay)');
      await delay(1000);
    }
    const result = await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector('.comments'),r=e.getBoundingClientRect(),v=document.querySelector('video').getBoundingClientRect();return {visible:getComputedStyle(e).visibility,child:getComputedStyle(e.firstElementChild).visibility,width:r.width,height:r.height,vw:v.width,vh:v.height,hidden:getComputedStyle(document.querySelector('#unwanted')).visibility}})()`);
    assert.equal(result.visible, 'visible');
    assert.equal(result.child, 'visible');
    assert.equal(result.hidden, 'hidden');
    assert.ok(Math.abs(result.width - result.vw) < 1 && Math.abs(result.height - result.vh) < 1);
    await delay(200);
    fs.writeFileSync(path.join(output, host.includes('bilibili') ? 'bilibili-danmaku.png' : 'douyin-danmaku.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(compactScript(false));
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".duoview-stage,.duoview-danmaku").length'), 0);
    await win.webContents.executeJavaScript('document.querySelector(".comments").style.display="none"');
    await win.webContents.executeJavaScript(compactScript(true));
    assert.equal(await win.webContents.executeJavaScript('getComputedStyle(document.querySelector(".comments")).display'), 'none');
    await win.webContents.executeJavaScript('document.querySelector(".comments").style.display=""');
    await win.webContents.executeJavaScript(compactScript(true));
  }
  if (process.argv.includes('--layout-only')) { console.log('PASS: native and late-loaded overlay layouts, native off state, and restore cleanup.'); app.exit(0); return; }
  await targets[1].webContents.executeJavaScript('document.getElementById("editing").focus()');
  const foreground = new BrowserWindow({ title: 'FloatDeck快捷键测试', width: 560, height: 240, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  await foreground.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<h2>FloatDeck快捷键测试</h2><p>按 Ctrl + ↓ 验证后台下一条</p><p>此窗口应始终保持前台。</p>'));
  foreground.setTitle('FloatDeck快捷键测试');
  foreground.show(); foreground.focus();
  let busy = false;
  assert.ok(globalShortcut.register('Ctrl+Down', async () => {
    if (busy) return; busy = true;
    try {
      assert.equal(BrowserWindow.getFocusedWindow(), foreground);
      const result = await runCommand(targets[1], 'next', 5);
      assert.ok(result.ok, result.message);
      assert.equal(await targets[1].webContents.executeJavaScript('window.position'), 2);
      assert.equal(await targets[0].webContents.executeJavaScript('window.position'), 1);
      assert.equal(await targets[1].webContents.executeJavaScript('document.getElementById("editing").value'), '未发送的弹幕草稿');
      assert.equal(BrowserWindow.getFocusedWindow(), foreground, 'Switching must not steal native focus');
      const keys = await targets[1].webContents.executeJavaScript('window.keys');
      assert.ok(keys.some(e => e.key === 'ArrowDown' && e.trusted && !e.ctrl));
      fs.writeFileSync(path.join(output, 'native-controls-report.json'), JSON.stringify({ passed: true, globalCtrlDown: true, backgroundOnly: true, foregroundPreserved: true, nativeDanmakuBothSites: true, testedAt: new Date().toISOString() }, null, 2));
      console.log('PASS: real global Ctrl+Down switched only background target, no Ctrl leaked, focus preserved; native overlay layout checks passed for both sites.');
      app.exit(0);
    } catch(error) { console.error(error); app.exit(1); }
  }));
  console.log('READY: FloatDeck快捷键测试 / Ctrl+Down');
  setTimeout(() => { console.error('Timed out waiting for real Ctrl+Down'); app.exit(1); }, 90000);
}).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => globalShortcut.unregisterAll());
