const test = require('node:test');
const assert = require('node:assert/strict');
const profile = require('../src/site-profile.js');
const { DEFAULTS, validateConfig } = require('../src/config.cjs');
test('site controls distinguish short videos, players, live streams and ordinary pages', () => {
  assert.deepEqual(profile('https://www.douyin.com/?recommend=1').actions, ['toggle', 'back', 'forward', 'previous', 'next']);
  assert.deepEqual(profile('bilibili.com').actions, ['toggle', 'back', 'forward']);
  assert.deepEqual(profile('https://live.bilibili.com/123').actions, ['toggle']);
  for (const url of ['https://chatgpt.com', 'github.com', 'x.com', 'douyin.com.evil.test']) assert.deepEqual(profile(url).actions, []);
});
test('migration retains old keys and allocates distinct persistent Douyin keys', () => {
  const config = validateConfig(DEFAULTS);
  for (const action of ['toggle', 'back', 'forward']) assert.equal(config.B.keys[action], DEFAULTS.B.keys[action]);
  assert.ok(config.B.keys.previous && config.B.keys.next);
  assert.deepEqual(validateConfig(config), config);
  const changed = structuredClone(config);
  changed.B.url = 'https://chatgpt.com/';
  assert.deepEqual(validateConfig(changed).B.keys, config.B.keys);
});
