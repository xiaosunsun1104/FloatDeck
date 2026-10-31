const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readSnapshot, writeSnapshot } = require('../src/session-files.cjs');
async function fixture() {
  const root = path.join(__dirname, '..', 'test-artifacts');
  await fs.mkdir(root, { recursive: true });
  return path.join(await fs.mkdtemp(path.join(root, 'snapshot-files-')), 'login.encrypted');
}
test('current encrypted mirror recovers a damaged or missing primary file', async () => {
  const file = await fixture();
  const bytes = Buffer.from('invented encrypted bytes');
  await writeSnapshot(file, bytes);
  assert.deepEqual(await readSnapshot(file), { bytes, recovered: false });
  await fs.writeFile(file, 'truncated fixture');
  assert.deepEqual(await readSnapshot(file), { bytes, recovered: true });
  await fs.rename(file, file + '.fixture-missing');
  assert.deepEqual(await readSnapshot(file), { bytes, recovered: true });
});
test('interrupted rename recovers staged current data and rejects an older login copy', async () => {
  const file = await fixture();
  await writeSnapshot(file, Buffer.from('invented old signed-in state'));
  const current = Buffer.from('invented new signed-out state');
  await fs.writeFile(file + '.tmp', current);
  await fs.writeFile(file + '.commit.json', JSON.stringify({ version: 1, sha256: createHash('sha256').update(current).digest('hex') }));
  assert.deepEqual(await readSnapshot(file), { bytes: current, recovered: true });
  await fs.rename(file + '.tmp', file + '.fixture-unavailable');
  await assert.rejects(readSnapshot(file), /Latest login checkpoint is unavailable/, 'Never revive a login from an earlier checkpoint');
});
test('legacy single-file snapshots upgrade without a reset', async () => {
  const file = await fixture();
  const bytes = Buffer.from('invented legacy encrypted bytes');
  await fs.writeFile(file, bytes);
  assert.deepEqual(await readSnapshot(file), { bytes, recovered: false });
  await writeSnapshot(file, bytes);
  assert.deepEqual(await readSnapshot(file), { bytes, recovered: false });
});
