const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { DEFAULTS, validateConfig } = require('../src/config.cjs');
const http = require('node:http');
const { globalShortcut, session } = require('electron');

module.exports = async ({ app, home, openSlot, command, players, compactModes, compactScript, state, saveConfig, addSlot, removeSlot, shortcutErrors }) => {
  const output = path.join(__dirname, '..', 'test-artifacts');
  fs.mkdirSync(output, { recursive: true });
  assert.ok(fs.existsSync(path.join(output, 'fixture.mp4')), 'Generate test-artifacts/fixture.mp4 before running the smoke test');
  const url = pathToFileURL(path.join(__dirname, 'fixture.html')).href;
  async function evaluate(slot, script) { return players.get(slot).webContents.executeJavaScript(script, true); }
  async function until(fn, message) {
    for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(100); }
    throw new Error(message + " / " + await home.webContents.executeJavaScript('document.querySelector("#feedback").textContent'));
  }
  saveConfig(structuredClone(DEFAULTS));
  await new Promise(resolve => { home.webContents.once('did-finish-load', resolve); home.webContents.reload(); });
  await until(() => home.webContents.executeJavaScript('document.querySelectorAll(".card").length === 2'), 'Initial cards did not render');
  for (const site of state().sitePresets) {
    await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] summary").click()');
    assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .site-picker").open'), true);
    await home.webContents.executeJavaScript(`document.querySelector('[data-slot=A] [data-site="${site.id}"]').click()`);
    assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .url").value'), site.url);
    assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=B] .url").value'), DEFAULTS.B.url);
    assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .site-picker").open'), false);
  }
  assert.equal(players.size, 0, 'Selecting a preset must not open a remote site');
  const originalNext = state().config.B.keys.next;
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=B] [name=B-next]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",code:"ArrowDown",ctrlKey:true,bubbles:true,cancelable:true}))');
  await until(() => state().config.B.keys.next === 'Ctrl+Down', 'Edited binding did not save without clicking Save');
  assert.equal(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).B.keys.next, 'Ctrl+Down');
  await home.webContents.executeJavaScript(`window.duoview.bind('B','next',${JSON.stringify(originalNext)})`);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=B] [name=B-next]").value=' + JSON.stringify(originalNext));
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] [data-site=chatgpt]").click()');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .control-section").hidden && document.querySelector("[data-slot=A] .shortcut-settings").hidden'), true);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] [data-site=douyin]").click()');
  assert.equal(await home.webContents.executeJavaScript('!document.querySelector("[data-slot=A] .feed-controls").hidden && !document.querySelector("[data-slot=A] [data-key-action=next]").hidden'), true);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] [data-site=bilibili]").click()');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .feed-controls").hidden'), true);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] summary").click(); document.querySelector("[data-slot=A] .site-picker").dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}))');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .site-picker").open'), false);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .url").value="example.org/status"; document.querySelector("#settings button[type=submit]").click()');
  await until(() => state().config.A.url === 'https://example.org/status', 'Manual URL was not normalized and saved');
  assert.equal(await home.webContents.executeJavaScript('document.querySelectorAll("#settings button[type=submit]").length'), 1);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .shortcut-settings").open=true; document.querySelector("[data-slot=A] .url").value="https://example.org/draft"; document.querySelector("[data-slot=A] .url").dispatchEvent(new Event("input",{bubbles:true})); document.querySelector("[data-slot=A] .seconds").value=9; document.querySelector("[data-window=B]").click()');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A]").hidden && !document.querySelector("[data-slot=B]").hidden'), true);
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .url").value'), 'https://example.org/draft');
  await home.webContents.executeJavaScript('document.querySelector("[data-window=A]").click()');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .seconds").value'), '9');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .shortcut-settings").open'), true);
  await home.webContents.executeJavaScript('document.querySelector("#settings button[type=submit]").click()');
  await until(() => state().config.A.seconds === 9 && state().config.A.url === 'https://example.org/draft', 'Switching windows lost draft settings');
  await home.webContents.executeJavaScript('document.querySelector("[data-window=A]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}))');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-window=B]").getAttribute("aria-selected")'), 'true');
  await home.webContents.executeJavaScript('document.querySelector("[data-window=B]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}))');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-window=A]").getAttribute("aria-selected")'), 'true');
  assert.equal(await home.webContents.executeJavaScript('document.querySelectorAll(".card:not([hidden])").length'), 1);
  await home.webContents.executeJavaScript('document.querySelector("#help-toggle").click()');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("#help-dialog").open'), true);
  await home.webContents.executeJavaScript('document.querySelector("#help-close").click()');
  await home.webContents.executeJavaScript(`document.querySelector('[data-slot=A] .url').value=${JSON.stringify(DEFAULTS.A.url)}; document.querySelector('[data-slot=A] .seconds').value=5; document.querySelector('#settings button[type=submit]').click()`);
  await until(() => state().config.A.url === DEFAULTS.A.url && state().config.A.seconds === 5, 'Could not restore original A settings');
  home.showInactive();
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .url").value=""; document.querySelector("[data-window=B]").click(); document.querySelector("#settings button[type=submit]").click()');
  await until(() => home.webContents.executeJavaScript('!document.querySelector("[data-slot=A]").hidden && document.querySelector("#feedback").classList.contains("error")'), 'Invalid hidden input was not brought into view');
  assert.equal(state().config.A.url, DEFAULTS.A.url);
  await home.webContents.executeJavaScript(`document.querySelector('[data-slot=A] .url').value=${JSON.stringify(DEFAULTS.A.url)}; document.querySelector('[data-slot=A] .url').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#settings button[type=submit]').click()`);
  await until(() => home.webContents.executeJavaScript('document.querySelector("#feedback").textContent === "设置已保存" && !document.querySelector("#feedback").classList.contains("error")'), 'Could not recover from invalid draft');
  await delay(150);
  fs.writeFileSync(path.join(output, 'shortcuts-panel.png'), (await home.webContents.capturePage()).toPNG());
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .shortcut-settings").open=false');
  await delay(150);
  fs.writeFileSync(path.join(output, 'main-layout.png'), (await home.webContents.capturePage()).toPNG());
  assert.equal(await home.webContents.executeJavaScript('document.querySelectorAll("#cards [data-op=remove]").length'), 0);
  const hoverTarget = await home.webContents.executeJavaScript('(()=>{const r=document.querySelector("[data-row=A] .window-close").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  home.webContents.sendInputEvent({ type: 'mouseMove', x: 350, y: 100 });
  await until(() => home.webContents.executeJavaScript('getComputedStyle(document.querySelector("[data-row=A] .nav-dot")).display !== "none" && getComputedStyle(document.querySelector("[data-row=A] .nav-cross")).display === "none"'), 'Sidebar dot did not appear at rest');
  home.webContents.sendInputEvent({ type: 'mouseMove', ...hoverTarget });
  await until(() => home.webContents.executeJavaScript('getComputedStyle(document.querySelector("[data-row=A] .nav-dot")).display === "none" && getComputedStyle(document.querySelector("[data-row=A] .nav-cross")).display !== "none"'), 'Sidebar dot did not change into a cross on hover');
  fs.writeFileSync(path.join(output, 'sidebar-close-hover.png'), (await home.webContents.capturePage()).toPNG());
  home.webContents.sendInputEvent({ type: 'mouseMove', x: 350, y: 100 });
  await until(() => home.webContents.executeJavaScript('getComputedStyle(document.querySelector("[data-row=A] .nav-cross")).display === "none"'), 'Sidebar dot did not return after hover');
  home.setSize(840, 600);
  await delay(150);
  const fit = await home.webContents.executeJavaScript('({bar:document.querySelector(".statusbar").getBoundingClientRect().bottom, height:innerHeight, row:document.querySelector("[data-slot=A] .address-row").getBoundingClientRect().right,width:innerWidth})');
  assert.ok(fit.bar <= fit.height && fit.row <= fit.width, 'Compact layout overflows the window');
  fs.writeFileSync(path.join(output, 'compact-layout.png'), (await home.webContents.capturePage()).toPNG());
  home.setSize(1040, 760);
  home.showInactive();
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] summary").click()');
  await delay(250);
  fs.writeFileSync(path.join(output, 'website-picker.png'), (await home.webContents.capturePage()).toPNG());
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .site-picker").open=false');
  for (let count = 3; count <= 10; count++) {
    await home.webContents.executeJavaScript('document.querySelector("#add-window").click()');
    await until(() => Object.keys(state().config).length === count, `Add button did not create window ${count}`);
  }
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("#add-window").disabled'), true);
  assert.equal(await home.webContents.executeJavaScript('document.querySelectorAll(".card").length'), 10);
  assert.equal(await home.webContents.executeJavaScript('document.querySelectorAll("[role=tab]").length'), 10);
  assert.equal(await home.webContents.executeJavaScript('document.querySelectorAll(".card:not([hidden])").length'), 1);
  assert.throws(() => addSlot(), /10/);
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
  assert.equal(Object.keys(validateConfig(saved)).length, 10);
  assert.deepEqual(saved.A, DEFAULTS.A);
  assert.deepEqual(saved.B, validateConfig(DEFAULTS).B);
  const ids = Object.keys(state().config);
  const windows = ids.map(slot => openSlot(slot, url));
  for (const slot of ids) {
    await until(async () => {
      try { return await evaluate(slot, 'Boolean(window.__duoview_player_v1__ && document.querySelector("video")?.readyState >= 2)'); } catch { return false; }
    }, `Window ${slot} did not load the local video`);
    assert.equal(await evaluate(slot, 'typeof require'), 'undefined');
    await evaluate(slot, 'document.querySelector("video").play()');
  }
  // Allow real compositor frames before capturing visual evidence.
  for (const win of windows) win.showInactive();
  if (process.env.FLOATDECK_ALLOW_NO_TOPMOST_TEST !== '1') assert.ok(windows.every(win => win.isAlwaysOnTop()));
  else console.warn('Topmost assertion explicitly skipped for this test environment; all other checks remain enabled.');
  assert.equal(new Set(windows.map(win => win.id)).size, 10);
  assert.equal(players.size, 10);
  assert.deepEqual(shortcutErrors(), []);
  const loginBounds = players.get('A').getBounds();
  let loginReloads = 0;
  const onLoginReload = () => { loginReloads++; };
  players.get('A').webContents.on('did-finish-load', onLoginReload);
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] [data-op=login]").click()');
  await until(() => state().slots.A.loginMode && players.get('A').getBounds().width > loginBounds.width, 'Login view did not enlarge the existing page');
  assert.equal(await evaluate('A', 'Boolean(window.__duoview_player_v1__)'), false);
  assert.ok(Object.values(state().config.A.keys).every(key => !globalShortcut.isRegistered(key)));
  await until(() => home.webContents.executeJavaScript('!document.querySelector("[data-slot=A] [data-op=login]").disabled'), 'Login button did not become usable again');
  await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] [data-op=login]").click()');
  await until(() => !state().slots.A.loginMode && state().slots.A.capabilities?.actions.includes('toggle'), 'Returning from login did not restore video controls');
  assert.deepEqual(players.get('A').getBounds(), loginBounds);
  assert.equal(loginReloads, 0, 'Login mode must not reload the page');
  players.get('A').webContents.removeListener('did-finish-load', onLoginReload);
  for (let index = 0; index < ids.length; index++) {
    const slot = ids[index];
    await command(slot, 'toggle');
    assert.equal(await evaluate(slot, 'document.querySelector("video").paused'), true);
    if (index + 1 < ids.length) assert.equal(await evaluate(ids[index + 1], 'document.querySelector("video").paused'), false);
  }
  for (let index = 0; index < ids.length; index++) await evaluate(ids[index], `document.querySelector("video").currentTime = ${10 + index / 10}`);
  for (let index = 0; index < ids.length; index++) {
    await command(ids[index], 'back');
    assert.ok(Math.abs(await evaluate(ids[index], 'document.querySelector("video").currentTime') - (5 + index / 10)) < 0.15);
    if (index + 1 < ids.length) assert.ok(Math.abs(await evaluate(ids[index + 1], 'document.querySelector("video").currentTime') - (10 + (index + 1) / 10)) < 0.15);
  }
  const closedWindow = players.get('J');
  const removedKeys = Object.values(state().config.J.keys);
  await home.webContents.executeJavaScript('document.querySelector("[data-window=A]").click(); document.querySelector("[data-slot=A] .url").value="https://example.org/unsaved"; document.querySelector("[data-remove=J]").click()');
  await until(() => !Object.hasOwn(state().config, 'J') && !players.has('J'), 'Sidebar close did not remove open J');
  assert.equal(closedWindow.isDestroyed(), true);
  assert.ok(removedKeys.every(key => !globalShortcut.isRegistered(key)), 'Removed window retained global shortcuts');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-window=A]").getAttribute("aria-selected")'), 'true', 'Closing an inactive entry changed selection');
  assert.equal(await home.webContents.executeJavaScript('document.querySelector("[data-slot=A] .url").value'), 'https://example.org/unsaved', 'Closing another window lost draft input');
  await home.webContents.executeJavaScript(`document.querySelector('[data-slot=A] .url').value=${JSON.stringify(DEFAULTS.A.url)}`);
  assert.equal(Object.keys(state().config).length, 9);
  assert.equal(addSlot().slot, 'J');
  openSlot('J', url);
  await until(() => evaluate('J', 'Boolean(window.__duoview_player_v1__ && document.querySelector("video")?.readyState >= 2)'), 'J did not reopen');
  assert.equal(players.size, 10);
  assert.deepEqual(shortcutErrors(), []);
  for (const slot of ['A', 'B']) await evaluate(slot, 'document.querySelector("video").play()');
  await command('A', 'toggle');
  assert.equal(await evaluate('A', 'document.querySelector("video").paused'), true);
  assert.equal(await evaluate('B', 'document.querySelector("video").paused'), false);
  await evaluate('A', 'document.querySelector("video").currentTime = 3');
  assert.ok((await command('A', 'forward')).ok);
  assert.ok(Math.abs(await evaluate('A', 'document.querySelector("video").currentTime') - 8) < 0.15);
  await command('B', 'toggle');
  await evaluate('B', 'document.querySelector("video").currentTime = 12');
  assert.ok((await command('B', 'back')).ok);
  assert.ok(Math.abs(await evaluate('B', 'document.querySelector("video").currentTime') - 7) < 0.15);
  assert.ok(Math.abs(await evaluate('A', 'document.querySelector("video").currentTime') - 8) < 0.15);
  await evaluate('B', 'document.querySelector("video").currentTime = 2');
  await command('B', 'back');
  assert.equal(await evaluate('B', 'document.querySelector("video").currentTime'), 0);
  await evaluate('A', 'document.querySelector("video").currentTime = 19');
  await command('A', 'forward');
  const clamped = await evaluate('A', '({time: document.querySelector("video").currentTime, duration: document.querySelector("video").duration})');
  assert.ok(clamped.time <= clamped.duration);
  for (const slot of ['A', 'B']) {
    const result = await evaluate(slot, compactScript(true));
    assert.ok(result.found);
    compactModes.set(slot, true);
    const rect = await evaluate(slot, '({width: document.querySelector("video").getBoundingClientRect().width, expected: innerWidth})');
    assert.ok(Math.abs(rect.width - rect.expected) < 1);
    await delay(250);
    fs.writeFileSync(path.join(output, `slot-${slot}.png`), (await players.get(slot).webContents.capturePage()).toPNG());
    await evaluate(slot, compactScript(false));
    assert.equal(await evaluate(slot, 'document.documentElement.hasAttribute("data-duoview-compact")'), false);
  }
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>网页监看测试</title><style>html,body{margin:0}#monitor{position:absolute;inset:0;display:grid;place-items:center;background:#17232b;color:#bdebdc;font:26px sans-serif}</style></head><body><main id="monitor">普通网页 · 完整显示在浮窗中</main></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const customUrl = `http://127.0.0.1:${server.address().port}/monitor`;
    saveConfig({ ...state().config, C: { ...state().config.C, url: customUrl } });
    openSlot('C');
    await until(() => evaluate('C', 'Boolean(document.getElementById("monitor") && window.__duoview_player_v1__)'), 'Custom non-video website did not load');
    assert.equal(state().slots.C.compact, false);
    await until(() => state().slots.C.capabilities?.actions.length === 0, 'No-video page retained video controls');
    assert.ok(Object.values(state().config.C.keys).every(key => !globalShortcut.isRegistered(key)), 'Non-video page kept global video keys');
    assert.equal((await command('C', 'toggle')).ok, false);
    assert.equal(await evaluate('C', 'document.documentElement.hasAttribute("data-duoview-compact")'), false);
    const fill = await evaluate('C', '({width:document.getElementById("monitor").getBoundingClientRect().width, height:document.getElementById("monitor").getBoundingClientRect().height, vw:innerWidth, vh:innerHeight})');
    assert.ok(Math.abs(fill.width - fill.vw) < 1 && Math.abs(fill.height - fill.vh) < 1);
    assert.equal(players.get('C').isMovable(), true);
    assert.equal(players.get('C').isResizable(), true);
    players.get('C').setBounds({ x: 120, y: 120, width: 700, height: 500 });
    await until(() => players.get('C').getBounds().width === 700, 'Custom website did not resize');
    assert.equal(players.get('C').getBounds().x, 120);
    await delay(150);
    fs.writeFileSync(path.join(output, 'web-window.png'), (await players.get('C').webContents.capturePage()).toPNG());
  } finally { server.closeAllConnections(); server.close(); }
  home.showInactive();
  await home.webContents.executeJavaScript('window.scrollTo({top: 0, behavior: "instant"})');
  await delay(600);
  fs.writeFileSync(path.join(output, 'dashboard.png'), (await home.webContents.capturePage()).toPNG());
  await evaluate('B', 'Object.defineProperty(document.querySelector("video"), "duration", {get: () => Infinity})');
  assert.equal((await command('B', 'forward')).ok, false);
  await until(() => !state().slots.B.capabilities?.actions.includes('forward'), 'Live stream retained seek controls');
  assert.equal(globalShortcut.isRegistered(state().config.B.keys.forward), false);
  await evaluate('A', 'document.querySelector("video").remove()');
  assert.equal((await command('A', 'toggle')).ok, false);
  assert.equal((await evaluate('A', compactScript(true))).compact, false);
  // Exercise the observed Douyin controls in an isolated local response at its origin.
  const testSession = session.fromPartition('duoview-test');
  await testSession.protocol.handle('https', () => new Response('<!doctype html><body><div data-e2e="video-switch-prev-arrow" style="width:40px;height:40px" onclick="window.position--">上一条</div><div data-e2e="video-switch-next-arrow" style="width:40px;height:40px" onclick="window.position++">下一条</div><script>window.position=1;document.addEventListener("keydown",e=>{if(e.isTrusted&&!e.ctrlKey&&!e.altKey){if(e.key==="ArrowDown")window.position++;if(e.key==="ArrowUp")window.position--;}})</script></body>', { headers: { 'Content-Type': 'text/html' } }));
  openSlot('J', 'https://www.douyin.com/floatdeck-test');
  await until(() => state().slots.J.capabilities?.actions.includes('next'), 'Douyin feed controls were not detected');
  assert.ok(state().config.J.keys.next && globalShortcut.isRegistered(state().config.J.keys.next), 'Detected feed did not receive a global key');
  await command('J', 'next');
  assert.equal(await evaluate('J', 'window.position'), 2);
  await command('J', 'previous');
  assert.equal(await evaluate('J', 'window.position'), 1);
  await evaluate('J', 'document.body.insertAdjacentHTML("beforeend", \'<div id="overlay" style="position:fixed;inset:0;background:white;z-index:9999">登录弹层测试</div>\')');
  await until(() => state().slots.J.capabilities?.actions.length === 0, 'Overlay did not hide blocked switching controls');
  assert.equal(globalShortcut.isRegistered(state().config.J.keys.next), false);
  await evaluate('J', 'document.getElementById("overlay").remove()');
  await until(() => state().slots.J.capabilities?.actions.includes('next'), 'Switch controls did not return after overlay closed');
  await home.webContents.executeJavaScript('document.querySelector("[data-window=J]").click(); document.querySelector("[data-slot=J] .shortcut-settings").open=true');
  assert.equal(await home.webContents.executeJavaScript('!document.querySelector("[data-slot=J] .feed-controls").hidden && document.querySelector("[data-slot=J] .seconds-row").hidden'), true);
  await delay(150);
  fs.writeFileSync(path.join(output, 'site-controls.png'), (await home.webContents.capturePage()).toPNG());
  openSlot('J', 'https://github.com/floatdeck-test');
  await until(() => state().slots.J.capabilities?.actions.length === 0, 'A different site incorrectly inherited Douyin controls');
  assert.equal(globalShortcut.isRegistered(state().config.J.keys.next), false);
  assert.equal((await command('J', 'next')).ok, false);
  const testedWindowCount = players.size;
  for (const slot of Object.keys(state().config)) {
    const win = players.get(slot);
    await home.webContents.executeJavaScript(`document.querySelector('[data-window="${slot}"]').click(); document.querySelector('[data-remove="${slot}"]').focus(); document.querySelector('[data-remove="${slot}"]').click()`);
    await until(() => !Object.hasOwn(state().config, slot), `Could not remove ${slot}`);
    assert.equal(win.isDestroyed(), true);
  }
  await until(() => home.webContents.executeJavaScript('!document.querySelector("#empty-state").hidden && document.querySelectorAll(".window-row").length===0 && document.activeElement.id==="add-window"'), 'Removing last entry did not show empty state or restore focus');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')), {});
  assert.equal(players.size, 0);
  await testSession.protocol.unhandle('https');
  await home.webContents.executeJavaScript('document.querySelector("#add-window").click()');
  await until(() => Object.keys(state().config).join('') === 'A', 'Could not add A after removing all entries');
  await until(() => home.webContents.executeJavaScript('!document.querySelector("[data-slot=A]").hidden && document.querySelector("#empty-state").hidden'), 'Adding after empty state did not select the new entry');
  const report = { passed: true, windowCount: testedWindowCount, checks: ['site-specific controls hide for ordinary pages', 'Douyin previous/next routes independently through Chromium input', 'blocked feed controls and their hotkeys disappear behind overlays', 'live streams hide and unregister seek actions', 'sidebar dot changes to cross on hover and returns afterward', 'sidebar close destroys open window and releases its hotkeys', 'closing inactive entry preserves selection and other unsaved inputs', 'all entries can be removed and empty state can add a new window', 'sidebar preserves unsaved fields across switches', 'keyboard navigation and help dialog work', 'invalid hidden input is revealed before saving', 'single save command and compact layout without overflow', 'ten preset choices fill only their own URL field and do not navigate automatically', 'picker closes after selection and on Escape', 'manual bare-domain URL normalizes and saves', 'custom non-video HTTP page loads and fills its window', 'web window moves and resizes', 'non-video page remains visible when video control is unavailable', 'UI adds windows A–J and disables add at ten', 'backend rejects eleventh window', 'legacy A/B settings survive and ten-window config persists', 'ten distinct native windows simultaneously open and always on top', 'all thirty global hotkeys registered with OS', 'independent pause and seek routing for all ten windows', 'removed window slot can be reused', 'A pause does not pause B', 'A forward and B backward route independently', 'seek clamps at bounds', 'live streams reject seeking', 'missing video handled', 'compact mode fills the window and restores', 'remote renderer has no Node access'], limitations: ['Actual OS keypress delivery during gameplay not tested', 'Ten live websites and their resource usage not tested', 'External website login and embedded-browser compatibility not tested'], testedAt: new Date().toISOString() };
  report.topmostVerified = process.env.FLOATDECK_ALLOW_NO_TOPMOST_TEST !== '1';
  if (!report.topmostVerified) {
    report.checks = report.checks.map(check => check === 'ten distinct native windows simultaneously open and always on top' ? 'ten distinct native windows simultaneously open' : check);
    report.limitations.push('Always-on-top assertion explicitly skipped; independent minimal Electron window also returned false in this environment');
  }
  fs.writeFileSync(path.join(output, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(0);
};
