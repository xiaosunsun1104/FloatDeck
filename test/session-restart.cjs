// Uses invented cookies in a dedicated fixture profile; never reads real accounts.
const { app, session, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { preserveSession, saveOnQuit } = require('../src/session-state.cjs');
const [directory, phase] = process.argv.slice(2);
app.setPath('userData', directory);
app.whenReady().then(async () => {
  const browser = session.fromPartition('persist:restart-fixture');
  const filename = path.join(directory, 'fixture.encrypted');
  const keeper = await preserveSession(browser, filename);
  const url = 'https://fixture.invalid/account/';
  if (phase === 'save' || phase === 'save-v1') {
    await browser.cookies.set({ url, name: 'session_fixture', value: 'invented-session-secret', secure: true, httpOnly: true, sameSite: 'strict', path: '/account/' });
    await browser.cookies.set({ url, name: 'persistent_fixture', value: 'invented-persistent', expirationDate: Date.now() / 1000 + 3600 });
    await browser.cookies.set({ url, domain: '.fixture.invalid', name: 'domain_fixture', value: 'invented-domain', secure: true, sameSite: 'lax' });
  } else if (phase === 'logout') {
    const cookies = await browser.cookies.get({ url });
    const restored = cookies.find(c => c.name === 'session_fixture');
    assert.equal(restored?.value, 'invented-session-secret');
    assert.equal(restored.hostOnly, true);
    assert.equal(restored.httpOnly, true);
    assert.equal(restored.sameSite, 'strict');
    assert.equal(restored.session, true, 'Restoration must not extend expiration');
    assert.equal(cookies.find(c => c.name === 'persistent_fixture')?.value, 'invented-persistent');
    assert.equal(cookies.find(c => c.name === 'domain_fixture')?.hostOnly, false);
    assert.equal(fs.readFileSync(filename).includes(Buffer.from('invented-session-secret')), false);
    await browser.cookies.remove(url, 'session_fixture');
    await browser.cookies.remove(url, 'domain_fixture');
  } else if (phase === 'verify-logout') {
    const cookies = await browser.cookies.get({ url });
    assert.equal(cookies.some(c => c.name === 'session_fixture' || c.name === 'domain_fixture'), false, 'Logout must survive another process restart');
    assert.equal(cookies.find(c => c.name === 'persistent_fixture')?.value, 'invented-persistent');
  } else throw new Error('Unknown test phase');
  if (phase === 'save-v1') {
    await keeper.flush(); keeper.stop();
    const legacy = { version: 1, cookies: await browser.cookies.get({ session: true }) };
    fs.writeFileSync(filename, await safeStorage.encryptStringAsync(JSON.stringify(legacy)));
    // A genuine version-1 installation has no new checkpoint metadata or mirror.
    fs.unlinkSync(filename + '.commit.json');
    fs.unlinkSync(filename + '.recovery');
    console.log('Legacy encrypted snapshot created for upgrade check');
    app.quit(); return;
  }
  saveOnQuit(app, keeper);
  console.log('Session restart fixture passed: ' + phase);
  app.quit();
  app.quit(); // Competing quit events must still wait for the final write.
}).catch(error => { console.error(error); app.exit(1); });
