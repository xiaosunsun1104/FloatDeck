const { app, BrowserWindow, globalShortcut, ipcMain, session, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SLOTS, ALL_ACTIONS, MAX_WINDOWS, SITE_PRESETS, DEFAULTS, validateConfig, normalizeUrl, nextSlotConfig, keyCandidates } = require('./config.cjs');
const { installScript, commandScript, compactScript, capabilitiesScript } = require('./player.cjs');
const { runCommand } = require('./commands.cjs');
const { browserUserAgent, configureWebWindows } = require('./web-windows.cjs');
const { preserveSession, saveOnQuit } = require('./session-state.cjs');

app.setName('FloatDeck浮利机');
// Keep the existing local settings and website sessions across the rename.
const smoke = process.argv.includes('--smoke-test');
const profileDirectory = smoke ? path.join(app.getPath('temp'), 'duoview-smoke-session') : path.join(app.getPath('appData'), 'duoview');
fs.mkdirSync(profileDirectory, { recursive: true });
app.setPath('userData', profileDirectory);
app.setPath('sessionData', profileDirectory);
// A second launch must never initialize or rewrite the live browser profile.
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
let home;
let config = validateConfig(DEFAULTS);
let shortcutErrors = [];
let sessionKeeper;
let storageError = '';
const players = new Map();
const compactModes = new Map();
const messages = new Map();
const pending = new Set();
const capabilities = new Map();
const checking = new Set();
const loginModes = new Map();
const requestedUrls = new Map();
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const homePath = path.join(__dirname, 'ui', 'index.html');
const iconPath = path.join(__dirname, '..', 'assets', 'icon', 'floatdeck.ico');

function state() {
  return { config, maxWindows: MAX_WINDOWS, sitePresets: SITE_PRESETS, shortcutErrors, storageError, slots: Object.fromEntries(Object.keys(config).map(slot => [slot, { open: players.has(slot), loginMode: loginModes.has(slot), capabilities: capabilities.get(slot) || null, compact: compactModes.get(slot) || false, message: messages.get(slot) || '等待打开' }])) };
}
async function refreshCapabilities(win, slot) {
  if (win.isDestroyed() || checking.has(win.id) || loginModes.has(slot)) return;
  const id = win.id;
  checking.add(id);
  try {
    const raw = await win.webContents.executeJavaScript(capabilitiesScript);
    if (players.get(slot) !== win || win.isDestroyed() || loginModes.has(slot)) return;
    const value = { actions: ALL_ACTIONS.filter(action => raw?.actions?.includes(action)), compact: Boolean(raw?.compact) };
    if (JSON.stringify(value) !== JSON.stringify(capabilities.get(slot))) {
      const missing = value.actions.filter(action => !config[slot].keys[action]);
      if (missing.length) {
        const candidate = structuredClone(config);
        const used = new Set(Object.values(candidate).flatMap(entry => Object.values(entry.keys)));
        for (const action of missing) {
          const key = keyCandidates().find(key => {
            if (used.has(key)) return false;
            try { if (!globalShortcut.register(key, () => {})) return false; globalShortcut.unregister(key); return true; } catch { return false; }
          });
          if (!key) throw new Error('没有可用的切换快捷键');
          candidate[slot].keys[action] = key;
          used.add(key);
        }
        saveConfig(candidate);
      }
      capabilities.set(slot, value);
      registerKeys();
    }
  } catch { /* Navigation may temporarily replace the renderer. */ }
  finally { checking.delete(id); }
}
function notify() { if (home && !home.isDestroyed()) home.webContents.send('duoview:changed', state()); }
function note(slot, message) { messages.set(slot, message); notify(); }
function isWebPage(win) {
  const url = win.webContents.getURL();
  if (smoke && url === pathToFileURL(path.join(__dirname, '..', 'test', 'fixture.html')).href) return true;
  try { normalizeUrl(url); return true; } catch { return false; }
}
async function initialize(win, slot) {
  if (loginModes.has(slot)) return note(slot, '完整网页 · 点击“返回浮窗”恢复大小');
  if (!isWebPage(win)) return note(slot, '请打开 HTTP 或 HTTPS 网页');
  try {
    await win.webContents.executeJavaScript(installScript);
    await refreshCapabilities(win, slot);
    const view = await win.webContents.executeJavaScript(compactScript(compactModes.get(slot)));
    compactModes.set(slot, Boolean(view?.compact));
    note(slot, view?.found ? '网页已打开 · 视频控制已就绪' : '网页已打开 · 可自由拖动和缩放');
  } catch { note(slot, '网页已打开；此页面暂不支持视频控制'); }
}
async function command(slot, action) {
  if (loginModes.has(slot)) throw new Error('完整网页模式已暂停视频控制，请先返回浮窗');
  if (!Object.hasOwn(config, slot) || !ALL_ACTIONS.includes(action)) throw new Error('操作无效');
  const win = players.get(slot);
  if (!win || win.isDestroyed()) throw new Error(`请先打开窗口 ${slot}`);
  if (pending.has(slot)) return { ok: false, message: '上一条操作还未完成' };
  if (!isWebPage(win)) throw new Error('当前网页暂不支持视频控制');
  pending.add(slot);
  let timeout;
  try {
    const result = await Promise.race([
      runCommand(win, action, config[slot].seconds),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('视频响应超时，请检查网页')), 4000); })
    ]);
    if (!result) throw new Error('网页还没有准备好，请稍后重试');
    note(slot, result.message || (result.ok ? `${result.paused ? '已暂停' : '播放中'} · ${Math.floor(result.time)} 秒` : '操作失败'));
    return result;
  } finally { clearTimeout(timeout); pending.delete(slot); }
}
function registerKeys(candidate = config) {
  globalShortcut.unregisterAll();
  const errors = [];
  for (const slot of SLOTS) {
    if (!players.has(slot)) continue;
    for (const action of capabilities.get(slot)?.actions || []) {
      const key = candidate[slot].keys[action];
      if (!key) continue;
      try {
        if (!globalShortcut.register(key, () => command(slot, action).catch(error => note(slot, error.message)))) errors.push(`${slot}：${key} 已被其他程序占用`);
      } catch { errors.push(`${slot}：无法注册 ${key}`); }
    }
  }
  shortcutErrors = errors;
  notify();
  return errors;
}

function openSlot(slot, overrideUrl) {
  if (!Object.hasOwn(config, slot)) throw new Error('请先添加这个窗口');
  const existing = players.get(slot);
  const url = overrideUrl || config[slot].url;
  if (existing && !existing.isDestroyed()) {
    if (requestedUrls.get(slot) === url) { existing.show(); existing.focus(); return existing; }
    requestedUrls.set(slot, url);
    compactModes.set(slot, false);
    note(slot, '正在打开网页…');
    existing.loadURL(url).catch(error => note(slot, error.message));
    existing.show();
    return existing;
  }
  const work = screen.getPrimaryDisplay().workArea;
  if (players.size >= MAX_WINDOWS) throw new Error('已达到 10 个窗口上限');
  const index = SLOTS.indexOf(slot);
  const width = Math.min(slot === 'B' ? 360 : 640, work.width - 32);
  const height = Math.min(slot === 'B' ? 600 : 400, work.height - 32);
  const win = new BrowserWindow({
    title: `FloatDeck浮利机 · ${slot}`, width, height, minWidth: 240, minHeight: 180,
    icon: iconPath,
    x: Math.max(work.x + 16, work.x + work.width - width - 24 - index * 32),
    y: Math.min(work.y + work.height - height - 16, work.y + 32 + index * 28),
    show: false, alwaysOnTop: true, movable: true, resizable: true, autoHideMenuBar: true, backgroundColor: '#101418',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, partition: smoke ? 'duoview-test' : 'persist:duoview-video' }
  });
  players.set(slot, win);
  requestedUrls.set(slot, url);
  compactModes.set(slot, false);
  win.removeMenu();
  win.on('page-title-updated', event => event.preventDefault());
  configureWebWindows(win, { icon: iconPath, show: !smoke });
  const checkNavigation = (event, target) => {
    target = typeof target === 'string' ? target : event.url;
    if (smoke && target === url) return;
    try { normalizeUrl(target); } catch { event.preventDefault(); note(slot, '已阻止打开不支持的地址'); }
  };
  win.webContents.on('will-navigate', checkNavigation);
  win.webContents.on('will-redirect', checkNavigation);
  win.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) { capabilities.delete(slot); registerKeys(); }
  });
  win.webContents.on('did-finish-load', () => initialize(win, slot).catch(error => note(slot, error.message)));
  win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => { if (isMainFrame && code !== -3) note(slot, `网页加载失败：${description}`); });
  win.webContents.on('render-process-gone', () => note(slot, '网页窗口发生异常，请关闭后重开'));
  const capabilityTimer = setInterval(() => refreshCapabilities(win, slot), 1000);
  capabilityTimer.unref();
  win.on('closed', () => { clearInterval(capabilityTimer); loginModes.delete(slot); requestedUrls.delete(slot); capabilities.delete(slot); players.delete(slot); compactModes.delete(slot); messages.set(slot, '已关闭'); registerKeys(); });
  win.once('ready-to-show', () => { if (!smoke) win.showInactive(); });
  win.loadURL(url).catch(error => note(slot, error.message));
  registerKeys();
  return win;
}

async function loginMode(slot, enabled) {
  if (!Object.hasOwn(config, slot)) throw new Error('窗口编号无效');
  const win = players.get(slot) || openSlot(slot);
  if (enabled && !loginModes.has(slot)) {
    loginModes.set(slot, win.getBounds());
    capabilities.delete(slot);
    compactModes.set(slot, false);
    registerKeys();
    try { await win.webContents.executeJavaScript('window.__duoview_player_v1__?.uninstall()'); } catch { /* Page may still be loading. */ }
    const work = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setBounds({ x: work.x + 16, y: work.y + 16, width: Math.min(1100, work.width - 32), height: Math.min(820, work.height - 32) });
    note(slot, '完整网页 · 点击“返回浮窗”恢复大小');
  } else if (!enabled && loginModes.has(slot)) {
    const bounds = loginModes.get(slot);
    loginModes.delete(slot);
    win.setBounds(bounds);
    await initialize(win, slot);
  }
  win.show(); win.focus();
  return state();
}

function guard(event) {
  if (!home || event.sender !== home.webContents || event.senderFrame !== home.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(homePath).href) throw new Error('不受信任的操作来源');
}
function handle(name, callback) {
  ipcMain.handle(`duoview:${name}`, async (event, ...args) => {
    guard(event);
    try { return { ok: true, value: await callback(...args) }; } catch (error) { return { ok: false, error: error.message }; }
  });
}
function saveConfig(value) {
  const candidate = validateConfig(value);
  if ([...players.keys()].some(slot => !Object.hasOwn(candidate, slot))) throw new Error('请先关闭网页窗，再移除它的设置');
  const errors = registerKeys(candidate);
  if (errors.length) { registerKeys(config); throw new Error(errors.join('；') + '。已恢复原设置'); }
  try {
    fs.writeFileSync(settingsPath() + '.tmp', JSON.stringify(candidate, null, 2), 'utf8');
    fs.renameSync(settingsPath() + '.tmp', settingsPath());
  } catch (error) { registerKeys(config); throw error; }
  config = candidate;
  notify();
  return state();
}
function addSlot() {
  const { slot, value } = nextSlotConfig(config, key => {
    try {
      if (!globalShortcut.register(key, () => {})) return false;
      globalShortcut.unregister(key);
      return true;
    } catch { return false; }
  });
  messages.delete(slot);
  saveConfig({ ...config, [slot]: value });
  return { slot, state: state() };
}
function removeSlot(slot) {
  if (!Object.hasOwn(config, slot)) throw new Error('窗口编号无效');
  const candidate = { ...config };
  delete candidate[slot];
  validateConfig(candidate);
  // A sidebar close also removes the entry, even while its page is open.
  players.get(slot)?.destroy();
  const result = saveConfig(candidate);
  messages.delete(slot);
  return result;
}
app.whenReady().then(async () => {
  app.setAppUserModelId('org.floatdeck.app');
  try { config = validateConfig(JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))); } catch { /* First run or invalid settings: use known defaults. */ }
  for (const partition of ['persist:duoview-video', 'duoview-test']) {
    const videoSession = session.fromPartition(partition);
    videoSession.setUserAgent(browserUserAgent(videoSession.getUserAgent(), app.getName()));
    videoSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    videoSession.setPermissionCheckHandler(() => false);
    videoSession.on('will-download', event => event.preventDefault());
  }
  const workArea = screen.getPrimaryDisplay().workArea;
  if (!smoke) {
    try {
      sessionKeeper = await preserveSession(session.fromPartition('persist:duoview-video'), path.join(app.getPath('userData'), 'login-session.encrypted'), message => { storageError = message; notify(); });
      saveOnQuit(app, sessionKeeper);
    } catch (error) { storageError = error.message; }
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'login-startup.status.json'), JSON.stringify({
      startedAt: new Date().toISOString(), userData: app.getPath('userData'),
      sessionData: app.getPath('sessionData'), storagePath: session.fromPartition('persist:duoview-video').storagePath,
      ready: Boolean(sessionKeeper), error: storageError
    }, null, 2)); } catch { /* Diagnostics must not prevent access to existing pages. */ }
  }
  home = new BrowserWindow({ width: Math.min(1040, workArea.width), height: Math.min(760, workArea.height - 24), minWidth: Math.min(840, workArea.width), minHeight: Math.min(600, workArea.height - 24), show: !smoke, title: 'FloatDeck浮利机', icon: iconPath, backgroundColor: '#f3f3f3', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  home.removeMenu();
  home.on('query-session-end', () => { void sessionKeeper?.flush().catch(() => {}); });
  home.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  home.webContents.on('will-navigate', event => event.preventDefault());
  handle('state', state);
  handle('save', saveConfig);
  handle('bind', (slot, action, key) => {
    if (!Object.hasOwn(config, slot) || !ALL_ACTIONS.includes(action)) throw new Error('无效的快捷键操作');
    return saveConfig({ ...config, [slot]: { ...config[slot], keys: { ...config[slot].keys, [action]: key } } });
  });
  handle('add', addSlot);
  handle('remove', removeSlot);
  handle('open', slot => { openSlot(slot); return state(); });
  handle('close', slot => { players.get(slot)?.close(); return state(); });
  handle('login', loginMode);
  handle('command', command);
  handle('compact', async (slot, value) => {
    if (loginModes.has(slot)) throw new Error('请先返回浮窗再使用视频模式');
    if (!Object.hasOwn(config, slot)) throw new Error('窗口编号无效');
    const win = players.get(slot);
    if (!win || !isWebPage(win)) throw new Error('请先打开网页');
    const result = await win.webContents.executeJavaScript(compactScript(value));
    if (!result) throw new Error('页面正在加载，请稍后重试');
    compactModes.set(slot, result.compact);
    if (value && !result.found) note(slot, '没找到视频，请切回网页模式并先开始播放'); else notify();
    return result;
  });
  home.on('closed', () => app.quit());
  await home.loadFile(homePath);
  if (smoke) require('../test/smoke.cjs')({ app, home, openSlot, command, players, compactModes, compactScript, state, saveConfig, addSlot, removeSlot, shortcutErrors: () => shortcutErrors }).catch(error => { console.error(error); app.exit(1); });
});
app.on('second-instance', () => { home?.show(); home?.focus(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
