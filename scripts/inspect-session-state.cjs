// Local metadata only: never print cookie names, values, or decrypted snapshots.
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = process.argv[2];
app.setPath('userData', root);
app.whenReady().then(async () => {
  const { result } = await safeStorage.decryptStringAsync(await fs.readFile(path.join(root, 'login-session.encrypted')));
  const data = JSON.parse(result);
  const summary = {};
  for (const cookie of data.cookies) {
    const site = cookie.domain.endsWith('douyin.com') ? 'douyin' : cookie.domain.endsWith('bilibili.com') ? 'bilibili' : 'other';
    const value = summary[site] ||= { count: 0, session: 0, commonLoginMarkers: 0 };
    value.count++;
    if (cookie.session) value.session++;
    if (['sessionid', 'sessionid_ss', 'sid_tt', 'SESSDATA', 'bili_jct'].includes(cookie.name)) value.commonLoginMarkers++;
  }
  console.log(JSON.stringify({ version: data.version, metadataOnly: summary }));
  app.exit(0);
}).catch(() => { console.error('Unable to read encrypted snapshot metadata'); app.exit(1); });
