// Entirely local authorization-shaped fixtures; no real accounts or external requests.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { configureWebWindows, browserUserAgent } = require('../src/web-windows.cjs');
app.whenReady().then(async () => {
  let receivedPost = '';
  const server = http.createServer((req, res) => {
    if (req.url === '/authorize') {
      req.on('data', data => { receivedPost += data; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'floatdeck_fixture=yes; HttpOnly; SameSite=Lax; Path=/' });
        res.end('<script>window.opener.postMessage("fixture-complete",location.origin)</script>Local authorization fixture');
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<script>window.message="";addEventListener("message",e=>window.message=e.data)</script><form target="fixture-auth" action="/authorize" method="POST"><input name="ticket" value="fixture"><button>Continue</button></form>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let root;
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const partition = session.fromPartition('floatdeck-local-login-test');
    partition.setUserAgent(browserUserAgent(partition.getUserAgent(), app.getName()));
    root = new BrowserWindow({ show: false, webPreferences: { session: partition, sandbox: true, nodeIntegration: false, contextIsolation: true } });
    const children = configureWebWindows(root, { show: false });
    await root.loadURL(base + '/');
    await root.webContents.executeJavaScript('document.querySelector("form").requestSubmit()', true);
    for (let i = 0; i < 100 && await root.webContents.executeJavaScript('window.message') !== 'fixture-complete'; i++) await delay(50);
    assert.equal(await root.webContents.executeJavaScript('window.message'), 'fixture-complete');
    assert.equal(receivedPost, 'ticket=fixture');
    assert.equal(root.webContents.getURL(), base + '/');
    assert.equal(children.size, 1);
    const child = [...children][0];
    assert.equal(child.webContents.session, root.webContents.session);
    assert.equal(await child.webContents.executeJavaScript('typeof require'), 'undefined');
    assert.equal((await partition.cookies.get({ name: 'floatdeck_fixture' }))[0].value, 'yes');
    await root.webContents.executeJavaScript('window.open("file:///C:/Windows/win.ini")', true);
    await delay(100);
    assert.equal(children.size, 1, 'File popup must remain blocked');
    assert.equal(await root.webContents.executeJavaScript('navigator.userAgent.includes("Electron/")'), false);
    root.destroy();
    assert.equal(child.isDestroyed(), true);
    console.log('Local login compatibility passed: POST body, opener callback, shared session/cookie, sandbox, blocked file popup and child cleanup.');
  } finally { root?.destroy(); server.closeAllConnections(); server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
