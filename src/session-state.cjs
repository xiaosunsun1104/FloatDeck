const fs = require('node:fs/promises');
const path = require('node:path');
const { safeStorage } = require('electron');
const { readSnapshot, writeSnapshot, retainUnreadable } = require('./session-files.cjs');

function cookieKey(cookie) { return JSON.stringify([cookie.domain, cookie.path, cookie.name]); }
function cookieDetails(cookie) {
  const host = cookie.domain.replace(/^\./, '');
  const details = {
    url: (cookie.secure ? 'https://' : 'http://') + host + cookie.path,
    name: cookie.name, value: cookie.value, path: cookie.path,
    secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite
  };
  if (!cookie.hostOnly) details.domain = cookie.domain;
  if (!cookie.session && Number.isFinite(cookie.expirationDate)) details.expirationDate = cookie.expirationDate;
  return details;
}

// The native browser profile is primary. An optional encrypted recovery file must
// never prevent Chromium storage from flushing, even if one record is invalid.
async function preserveSession(session, filename, onError = () => {}, encryption = safeStorage) {
  let saved = [];
  let restored = 0;
  let warning = '';
  let canBackup = false;
  let recoveredAtStartup = false;
  const unrestored = new Map();
  try {
    canBackup = await encryption.isAsyncEncryptionAvailable();
  } catch { /* Keep using the native profile if the OS key provider fails. */ }
  if (!canBackup) warning = '本机加密存储暂不可用，浏览器数据仍会保存；请重启软件后重试登录备份。';
  if (canBackup) {
    try {
      const snapshot = await readSnapshot(filename);
      recoveredAtStartup = snapshot.recovered;
      const { result } = await encryption.decryptStringAsync(snapshot.bytes);
      const data = JSON.parse(result);
      if (![1, 2].includes(data.version) || !Array.isArray(data.cookies)) throw new Error('Invalid session snapshot');
      saved = data.cookies;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        warning = '旧登录备份无法读取，原文件已另存保留；当前浏览器数据将继续保存。';
        try { await retainUnreadable(filename); }
        catch { canBackup = false; warning = '旧登录备份无法读取，原文件已保留；浏览器数据仍会保存，请检查文件夹权限。'; }
      }
    }
  }
  const existing = new Set((await session.cookies.get({})).map(cookieKey));
  for (const cookie of saved) {
    if (!cookie || typeof cookie.domain !== 'string' || typeof cookie.path !== 'string' || typeof cookie.name !== 'string' || typeof cookie.value !== 'string') continue;
    const key = cookieKey(cookie);
    if (existing.has(key)) continue;
    if (!cookie.session && (!Number.isFinite(cookie.expirationDate) || cookie.expirationDate <= Date.now() / 1000)) continue;
    try { await session.cookies.set(cookieDetails(cookie)); restored++; }
    catch { unrestored.set(key, cookie); }
  }
  if (unrestored.size) warning = '部分旧登录记录暂时无法恢复，已保留备份；其他网站数据会继续保存。';
  let timer;
  let deadline;
  let retry;
  let stopped = false;
  let failures = 0;
  let scheduled = false;
  let lastWriteAt = 0;
  let queue = Promise.resolve();
  let lastError;
  const changes = {};
  async function write() {
    // Always flush Chromium first; a backup/encryption error must not skip this.
    await session.cookies.flushStore();
    session.flushStorageData();
    const cookies = await session.cookies.get({});
    const savedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(filename), { recursive: true });
    if (canBackup) {
      const keys = new Set(cookies.map(cookieKey));
      const pending = [...unrestored].filter(([key]) => !keys.has(key)).map(([, cookie]) => cookie);
      const encrypted = await encryption.encryptStringAsync(JSON.stringify({ version: 2, savedAt, cookies: [...cookies, ...pending] }));
      await writeSnapshot(filename, encrypted);
    }
    // Counts and times only; do not put identifiers or credentials in diagnostics.
    const summary = { savedAt, cookieCount: cookies.length, sessionCookies: cookies.filter(cookie => cookie.session).length, persistentCookies: cookies.filter(cookie => !cookie.session).length, restoredAtStartup: restored, recoveredAtStartup, unrestored: unrestored.size, encryptedBackup: canBackup, changes };
    await fs.writeFile(filename + '.status.tmp', JSON.stringify(summary, null, 2));
    await fs.rename(filename + '.status.tmp', filename + '.status.json');
    onError(warning);
    lastError = null;
    failures = 0;
    lastWriteAt = Date.now();
  }
  function save() {
    clearTimeout(timer);
    clearTimeout(deadline); deadline = null;
    clearTimeout(retry);
    if (scheduled) return queue;
    scheduled = true;
    queue = queue.then(() => { scheduled = false; return write(); }).catch(error => {
      lastError = error;
      onError('登录状态保存尚未完成，正在自动重试；请检查本地磁盘空间和文件夹权限。');
      if (!stopped) {
        retry = setTimeout(save, Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)));
        retry.unref();
      }
    });
    return queue;
  }
  function changed(_event, cookie, cause) {
    unrestored.delete(cookieKey(cookie)); // A website update/logout wins over an old backup.
    changes[cause] = (changes[cause] || 0) + 1;
    if (cause === 'explicit' || cause === 'expired-overwrite') { void save(); return; }
    clearTimeout(timer); timer = setTimeout(save, Math.max(150, 1000 - (Date.now() - lastWriteAt)));
    // Busy websites may change cookies continuously; do not starve the writer.
    if (!deadline) deadline = setTimeout(save, 2000);
  }
  session.cookies.on('changed', changed);
  await save();
  return {
    async flush() { await save(); if (lastError) throw lastError; },
    stop() { stopped = true; clearTimeout(timer); clearTimeout(deadline); clearTimeout(retry); session.cookies.removeListener('changed', changed); }
  };
}
function saveOnQuit(app, keeper) {
  let running = false;
  let ready = false;
  // Flush after all pages finish closing, including their final pagehide writes.
  app.on('will-quit', event => {
    if (ready) return;
    event.preventDefault();
    if (running) return;
    running = true;
    keeper.flush().catch(() => {}).finally(() => {
      keeper.stop();
      ready = true;
      app.quit();
    });
  });
}
module.exports = { preserveSession, saveOnQuit };
