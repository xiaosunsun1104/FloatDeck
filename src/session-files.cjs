const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function durableWrite(filename, bytes) {
  const file = await fs.open(filename, 'w');
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
}
async function readSnapshot(filename) {
  let commit;
  try {
    commit = JSON.parse(await fs.readFile(filename + '.commit.json', 'utf8'));
    if (commit.version !== 1 || !/^[a-f0-9]{64}$/.test(commit.sha256)) throw new Error('Invalid checkpoint');
  } catch (error) {
    if (error.code === 'ENOENT') return { bytes: await fs.readFile(filename), recovered: false };
    throw new Error('Unable to read login checkpoint');
  }
  // Only the latest checkpoint is eligible. An older recovery copy could undo
  // a website logout, so never accept a different digest just because it decrypts.
  for (const candidate of [filename, filename + '.tmp', filename + '.recovery', filename + '.recovery.tmp']) {
    try {
      const bytes = await fs.readFile(candidate);
      if (digest(bytes) === commit.sha256) return { bytes, recovered: candidate !== filename };
    } catch { /* Another copy can remain readable if one is locked or damaged. */ }
  }
  throw new Error('Latest login checkpoint is unavailable');
}
async function writeSnapshot(filename, bytes) {
  await durableWrite(filename + '.tmp', bytes);
  await durableWrite(filename + '.commit.tmp', JSON.stringify({ version: 1, sha256: digest(bytes) }));
  // Once this points to the new data, the durable .tmp is recoverable even if
  // the process stops before either rename finishes.
  await fs.rename(filename + '.commit.tmp', filename + '.commit.json');
  await fs.rename(filename + '.tmp', filename);
  await durableWrite(filename + '.recovery.tmp', bytes);
  await fs.rename(filename + '.recovery.tmp', filename + '.recovery');
}
async function retainUnreadable(filename) {
  const suffix = '.unreadable-' + Date.now();
  for (const extension of ['', '.commit.json', '.tmp', '.recovery', '.recovery.tmp']) {
    try { await fs.copyFile(filename + extension, filename + extension + suffix); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
module.exports = { readSnapshot, writeSnapshot, retainUnreadable };
