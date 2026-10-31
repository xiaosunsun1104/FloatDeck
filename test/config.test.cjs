const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, SITE_PRESETS, validateConfig, normalizeUrl, normalizeKey, nextSlotConfig } = require('../src/config.cjs');
test('legacy bindings and new Douyin bindings remain independent', () => {
  const input = structuredClone(DEFAULTS);
  input.B.seconds = 12;
  const config = validateConfig(input);
  assert.equal(config.A.seconds, 5);
  assert.equal(config.B.seconds, 12);
  assert.equal(new Set(Object.values(config).flatMap(slot => Object.values(slot.keys))).size, 8);
});
test('modifier ordering cannot conceal a duplicate', () => {
  const input = structuredClone(DEFAULTS);
  input.B.keys.toggle = 'Alt+Ctrl+1';
  assert.throws(() => validateConfig(input), /重复/);
  assert.equal(normalizeKey('Shift+Alt+Ctrl+F8'), 'Ctrl+Alt+Shift+F8');
});
test('reject malformed and unmodified shortcuts', () => {
  for (const value of ['Space', 'Shift+A', 'Ctrl+Ctrl+A', 'Ctrl+Alt+F99', 'Ctrl+Meta+A', null]) assert.throws(() => normalizeKey(value));
});
test('reject invalid seek steps instead of silently changing them', () => {
  for (const seconds of [0, -1, 61, 1.2, Infinity, 'oops']) {
    const input = structuredClone(DEFAULTS);
    input.A.seconds = seconds;
    assert.throws(() => validateConfig(input), /秒数/);
  }
});
test('accept custom web addresses and add HTTPS to plain domains', () => {
  assert.equal(normalizeUrl('https://www.bilibili.com/video/BVtest'), 'https://www.bilibili.com/video/BVtest');
  assert.equal(normalizeUrl('https://www.douyin.com/'), 'https://www.douyin.com/');
  assert.equal(normalizeUrl('chatgpt.com'), 'https://chatgpt.com/');
  assert.equal(normalizeUrl(' example.org/status?q=1 '), 'https://example.org/status?q=1');
  assert.equal(normalizeUrl('example.org:8443/status'), 'https://example.org:8443/status');
  assert.equal(normalizeUrl('//x.com/'), 'https://x.com/');
  assert.equal(normalizeUrl('http://127.0.0.1:3000/status'), 'http://127.0.0.1:3000/status');
});

test('reject executable and file schemes, embedded credentials and invalid addresses', () => {
  for (const value of ['javascript:alert(1)', 'file:///C:/secret', 'data:text/html,test', 'edge://settings', 'chrome://extensions', 'ftp://example.org/', 'mailto:test@example.org', 'https://name:secret@example.org/', 'https://name@example.org/', 'https://exa mple.org/', 'https://example.org/a\nb', '', null]) assert.throws(() => normalizeUrl(value));
});

test('site presets include the requested services and use valid canonical web URLs', () => {
  assert.equal(SITE_PRESETS.length, 10);
  assert.equal(new Set(SITE_PRESETS.map(site => site.id)).size, SITE_PRESETS.length);
  for (const id of ['bilibili', 'douyin', 'x', 'chatgpt']) assert.ok(SITE_PRESETS.some(site => site.id === id));
  for (const site of SITE_PRESETS) assert.equal(normalizeUrl(site.url), site.url);
});

test('grow legacy A/B settings to ten without losing keys or seek steps', () => {
  let config = structuredClone(DEFAULTS);
  config.A.seconds = 9;
  config.B.keys.toggle = 'Ctrl+Shift+F1';
  config = validateConfig(config);
  const original = structuredClone(config);
  for (let count = 2; count < 10; count++) {
    const { slot, value } = nextSlotConfig(config);
    config = validateConfig({ ...config, [slot]: value });
  }
  assert.equal(Object.keys(config).join(''), 'ABCDEFGHIJ');
  assert.deepEqual(config.A, original.A);
  assert.deepEqual(config.B, original.B);
  assert.equal(new Set(Object.values(config).flatMap(slot => Object.values(slot.keys))).size, 32);
  assert.throws(() => nextSlotConfig(config), /10/);
  assert.throws(() => validateConfig({ ...config, K: config.J }), /10/);
});

test('removed slots are reusable, including after removing the last window', () => {
  const config = structuredClone(DEFAULTS);
  delete config.A;
  assert.deepEqual(Object.keys(validateConfig(config)), ['B']);
  assert.equal(nextSlotConfig(config).slot, 'A');
  assert.deepEqual(validateConfig({}), {});
  assert.equal(nextSlotConfig({}).slot, 'A');
  assert.throws(() => validateConfig({ K: DEFAULTS.A }), /A–J/);
});

test('skip OS-occupied shortcut candidates and fail clearly if none are available', () => {
  const { value } = nextSlotConfig(DEFAULTS, key => !key.endsWith('F1'));
  assert.ok(Object.values(value.keys).every(key => !key.endsWith('F1')));
  assert.throws(() => nextSlotConfig(DEFAULTS, () => false), /可用快捷键/);
});
