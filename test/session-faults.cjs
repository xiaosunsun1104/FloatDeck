const { app, session, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { preserveSession } = require('../src/session-state.cjs');
app.setPath('userData', process.argv[2]);
app.whenReady().then(async () => {
  const root = app.getPath('userData');
  const browser = session.fromPartition('persist:faults');
  const filename = path.join(root, 'faults.encrypted');
  const invalid = { domain: 'fixture.invalid', path: '/', name: 'broken_fixture', value: 'invented', session: true, hostOnly: true, sameSite: 'invalid-fixture-policy' };
  const valid = { domain: 'fixture.invalid', path: '/', name: 'valid_fixture', value: 'invented', session: true, hostOnly: true, secure: true, sameSite: 'lax' };
  await fs.writeFile(filename, await safeStorage.encryptStringAsync(JSON.stringify({ version: 2, cookies: [invalid, valid] })));
  let warning;
  const keeper = await preserveSession(browser, filename, value => { warning = value; });
  assert.match(warning, /部分旧登录记录/);
  assert.equal((await browser.cookies.get({ name: 'valid_fixture' })).length, 1, 'A broken record must not block later valid records');
  await browser.cookies.set({ url: 'https://fixture.invalid', name: 'new_fixture', value: 'invented-new' });
  await keeper.flush(); keeper.stop();
  const { result } = await safeStorage.decryptStringAsync(await fs.readFile(filename));
  const stored = JSON.parse(result).cookies;
  assert.ok(stored.some(c => c.name === 'new_fixture'), 'New logins must continue saving after a partial restore failure');
  assert.ok(stored.some(c => c.name === 'broken_fixture'), 'Failed records must remain available for later recovery');

  const corruptFile = path.join(root, 'corrupt.encrypted');
  const original = Buffer.from('invented broken encrypted fixture');
  await fs.writeFile(corruptFile, original);
  const corruptKeeper = await preserveSession(browser, corruptFile, value => { warning = value; });
  assert.match(warning, /原文件已另存保留/);
  const backup = (await fs.readdir(root)).find(name => name.startsWith('corrupt.encrypted.unreadable-'));
  assert.deepEqual(await fs.readFile(path.join(root, backup)), original);
  await corruptKeeper.flush(); corruptKeeper.stop();
  assert.ok((await safeStorage.decryptStringAsync(await fs.readFile(corruptFile))).result);

  const unavailable = path.join(root, 'unavailable.encrypted');
  await fs.copyFile(filename, unavailable);
  const before = await fs.readFile(unavailable);
  const fallback = await preserveSession(browser, unavailable, value => { warning = value; }, { isAsyncEncryptionAvailable: async () => false });
  await fallback.flush(); fallback.stop();
  assert.match(warning, /加密存储暂不可用/);
  assert.deepEqual(await fs.readFile(unavailable), before, 'Unavailable encryption must not overwrite a recoverable encrypted snapshot');
  assert.equal(JSON.parse(await fs.readFile(unavailable + '.status.json')).encryptedBackup, false);

  const retryFile = path.join(root, 'retry.encrypted');
  let attempts = 0;
  const retryKeeper = await preserveSession(browser, retryFile, value => { warning = value; }, {
    isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
    decryptStringAsync: bytes => safeStorage.decryptStringAsync(bytes),
    encryptStringAsync: text => { if (++attempts === 1) throw new Error('Invented temporary failure'); return safeStorage.encryptStringAsync(text); }
  });
  assert.match(warning, /自动重试/);
  for (let i = 0; i < 50 && warning.includes('自动重试'); i++) await delay(50);
  assert.equal(warning, '', 'A transient failure must recover without making the user restart or log in');
  assert.ok(attempts >= 2);
  assert.equal(JSON.parse(await fs.readFile(retryFile + '.status.json')).encryptedBackup, true);
  retryKeeper.stop();

  const logoutBrowser = session.fromPartition('persist:logout-fault');
  const logoutFile = path.join(root, 'logout.encrypted');
  await logoutBrowser.cookies.set({ url: 'https://fixture.invalid', name: 'account_fixture', value: 'invented-old-login' });
  const logoutKeeper = await preserveSession(logoutBrowser, logoutFile);
  const oldSignedInCopy = await fs.readFile(logoutFile + '.recovery');
  await logoutBrowser.cookies.remove('https://fixture.invalid', 'account_fixture');
  await logoutKeeper.flush(); logoutKeeper.stop();
  await fs.writeFile(logoutFile, 'invented damaged signed-out checkpoint');
  await fs.writeFile(logoutFile + '.recovery', oldSignedInCopy);
  const protectedKeeper = await preserveSession(logoutBrowser, logoutFile);
  assert.equal((await logoutBrowser.cookies.get({ name: 'account_fixture' })).length, 0, 'A readable but stale encrypted copy must never undo logout');
  await protectedKeeper.flush(); protectedKeeper.stop();

  const busyFile = path.join(root, 'busy.encrypted');
  const busyKeeper = await preserveSession(browser, busyFile);
  const initial = JSON.parse(await fs.readFile(busyFile + '.status.json')).savedAt;
  const timer = setInterval(() => browser.cookies.set({ url: 'https://fixture.invalid', name: 'busy_fixture', value: String(Date.now()) }), 40);
  try {
    await delay(2400);
    assert.notEqual(JSON.parse(await fs.readFile(busyFile + '.status.json')).savedAt, initial, 'Continuous changes must not starve backup writes');
  } finally { clearInterval(timer); await busyKeeper.flush(); busyKeeper.stop(); }
  console.log('Session fault checks passed: partial restore, corrupt backup, unavailable encryption, automatic retry, stale-copy logout protection, continuous cookie changes.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
