// Copied into an isolated packaged app by scripts/test-packaged-session.cjs.
// Every account and token here is invented. No external websites are contacted.
const { app, BrowserWindow, session, safeStorage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { testRoot, phase, origin } = JSON.parse(process.env.FLOATDECK_FIXTURE);
const data = path.join(testRoot, phase === 'fresh' ? '模拟用户 乙' : '模拟用户 甲');
fs.mkdirSync(data, { recursive: true });
app.setPath('appData', data);
require('./src/main.cjs');

async function until(fn, message) {
  for (let i = 0; i < 150; i++) { const value = await fn(); if (value) return value; await delay(50); }
  throw new Error(message);
}
app.whenReady().then(async () => {
  const home = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('file:')), 'Main window did not load');
  await until(() => !home.webContents.isLoading(), 'Main page still loading');
  home.webContents.on('console-message', (_event, ...args) => console.log('Fixture renderer:', ...args));
  await until(() => home.webContents.executeJavaScript('Boolean(window.duoview)').catch(() => false), 'Preload did not load');
  assert.equal(app.getPath('userData'), path.join(data, 'duoview'));
  assert.equal(app.getPath('sessionData'), app.getPath('userData'));
  const browser = session.fromPartition('persist:duoview-video');
  assert.equal(browser.storagePath, path.join(app.getPath('userData'), 'Partitions', 'duoview-video'));
  // Exercise the real local renderer IPC and production window creation.
  const target = origin + (phase === 'save' ? '/login' : '/account');
  const result = await home.webContents.executeJavaScript(`(async()=>{try{const state=await window.duoview.getState();if(!state.ok)throw Error(state.error);state.value.config.A.url=${JSON.stringify(target)};let i=0;for(const entry of Object.values(state.value.config))for(const action of Object.keys(entry.keys))entry.keys[action]='Ctrl+Alt+Shift+F'+(++i);const saved=await window.duoview.save(state.value.config);if(!saved.ok)throw Error(saved.error);return window.duoview.open('A')}catch(error){return {ok:false,error:String(error)}}})()`);
  assert.equal(result.ok, true, result.error);
  const page = await until(() => BrowserWindow.getAllWindows().find(w => w !== home && w.webContents.getURL().startsWith(origin)), 'Web window did not load');
  await until(() => page.webContents.executeJavaScript('document.body.dataset.ready === "yes"').catch(() => false), 'Web storage not ready');
  if (phase === 'save') {
    await browser.cookies.set({ url: origin, name: 'session_fixture', value: 'invented-session', httpOnly: true, sameSite: 'lax' });
    await browser.cookies.set({ url: origin, name: 'persistent_fixture', value: 'invented-persistent', expirationDate: Date.now() / 1000 + 3600 });
    await page.webContents.executeJavaScript(`(async()=>{localStorage.setItem('account','invented-local');window.fixtureDB=await new Promise((resolve,reject)=>{const r=indexedDB.open('account',1);r.onupgradeneeded=()=>r.result.createObjectStore('tokens');r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)});await new Promise((resolve,reject)=>{const t=fixtureDB.transaction('tokens','readwrite');t.objectStore('tokens').put('invented-idb','token');t.oncomplete=resolve;t.onerror=()=>reject(t.error)});addEventListener('pagehide',()=>{localStorage.setItem('closed','yes');document.cookie='last_close=written; path=/; max-age=3600'})})()`);
  } else if (phase === 'fresh') {
    assert.equal((await browser.cookies.get({ url: origin })).length, 0, 'A new local user must not inherit another user account');
    assert.equal(await page.webContents.executeJavaScript('localStorage.getItem("account")'), null);
  } else {
    const cookies = await browser.cookies.get({ url: origin });
    const loggedOut = phase === 'verify-logout';
    assert.equal(cookies.find(c => c.name === 'session_fixture')?.value, loggedOut ? undefined : 'invented-session');
    assert.equal(cookies.find(c => c.name === 'persistent_fixture')?.value, 'invented-persistent');
    if (phase !== 'crash') assert.equal(cookies.find(c => c.name === 'crash_fixture')?.value, 'invented-before-abrupt-exit');
    assert.equal(await page.webContents.executeJavaScript('document.body.dataset.auth'), loggedOut ? 'no' : 'yes', 'Restored HttpOnly cookie must actually reach the website');
    assert.equal(cookies.find(c => c.name === 'last_close')?.value, 'written', 'Final pagehide cookie must survive quitting');
    const stored = await page.webContents.executeJavaScript(`(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('account',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const token=await new Promise((resolve,reject)=>{const r=db.transaction('tokens').objectStore('tokens').get('token');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();return {local:localStorage.getItem('account'),closed:localStorage.getItem('closed'),token}})()`);
    assert.deepEqual(stored, { local: 'invented-local', closed: 'yes', token: 'invented-idb' });
    if (phase === 'logout') await browser.cookies.remove(origin, 'session_fixture');
    if (phase === 'verify') {
      const status = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'login-session.encrypted.status.json')));
      assert.equal(status.recoveredAtStartup, true, 'Damaged primary must recover the latest encrypted mirror');
    }
    if (phase === 'crash') {
      const filename = path.join(app.getPath('userData'), 'login-session.encrypted');
      await browser.cookies.set({ url: origin, name: 'crash_fixture', value: 'invented-before-abrupt-exit' });
      // Exercise the production Windows shutdown notification without restarting
      // the actual computer. Then bypass every normal quit/close saving handler.
      home.emit('query-session-end', {});
      await until(async () => {
        try {
          const status = JSON.parse(fs.readFileSync(filename + '.status.json'));
          const { result } = await safeStorage.decryptStringAsync(fs.readFileSync(filename + '.recovery'));
          return status.changes.inserted > 0 && JSON.parse(result).cookies.some(c => c.name === 'crash_fixture');
        } catch { return false; }
      }, 'Shutdown checkpoint did not finish');
      console.log('Packaged lifecycle passed: shutdown notification and abrupt exit without quit handlers');
      app.exit(73);
      return;
    }
  }
  // A second launch must only focus the existing app, without rewriting a profile.
  if (phase === 'save') {
    const { spawn } = require('node:child_process');
    const second = spawn(process.execPath, [], { env: process.env, stdio: 'ignore' });
    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')); }, 5000);
      second.on('exit', code => { clearTimeout(timeout); resolve(code); });
    });
    assert.equal(exitCode, 0);
    assert.equal(BrowserWindow.getAllWindows().length, 2);
  }
  console.log('Packaged lifecycle passed: ' + phase);
  // Close real pages while the keeper is active, then finish the production quit.
  page.close();
  home.close();
}).catch(error => { console.error(error); app.exit(1); });
