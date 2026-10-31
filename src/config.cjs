const ACTIONS = ['toggle', 'back', 'forward'];
const ALL_ACTIONS = [...ACTIONS, 'previous', 'next'];
const siteProfile = require('./site-profile.js');
const MAX_WINDOWS = 10;
const SLOTS = Array.from({ length: MAX_WINDOWS }, (_, index) => String.fromCharCode(65 + index));
const SITE_PRESETS = [
  { id: 'bilibili', name: 'B站', url: 'https://www.bilibili.com/' },
  { id: 'douyin', name: '抖音', url: 'https://www.douyin.com/?recommend=1' },
  { id: 'x', name: 'X', url: 'https://x.com/' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/' },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/' },
  { id: 'douban', name: '豆瓣', url: 'https://www.douban.com/' }
];
const DEFAULTS = {
  A: { url: 'https://www.bilibili.com/', seconds: 5, keys: { toggle: 'Ctrl+Alt+1', back: 'Ctrl+Alt+2', forward: 'Ctrl+Alt+3' } },
  B: { url: 'https://www.douyin.com/', seconds: 5, keys: { toggle: 'Ctrl+Alt+7', back: 'Ctrl+Alt+8', forward: 'Ctrl+Alt+9' } }
};

function normalizeKey(value) {
  if (typeof value !== 'string') throw new Error('请设置快捷键');
  const parts = value.split('+');
  const key = parts.pop();
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Left|Right|Up|Down|Space)$/.test(key)) throw new Error('快捷键请使用字母、数字、F1–F12、方向键或空格');
  if (parts.some(p => !['Ctrl', 'Alt', 'Shift'].includes(p)) || new Set(parts).size !== parts.length || !parts.some(p => ['Ctrl', 'Alt'].includes(p))) throw new Error('快捷键需要包含 Ctrl 或 Alt，修饰键不能重复');
  return [...['Ctrl', 'Alt', 'Shift'].filter(p => parts.includes(p)), key].join('+');
}

function normalizeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请输入网页地址');
  let input = value.trim();
  if (/[\x00-\x1f\x7f]/.test(input)) throw new Error('网页地址包含无效字符');
  if (input.startsWith('//')) input = 'https:' + input;
  const hostWithPort = /^[^\s/:?#]+:\d+(?:[/?#]|$)/.test(input);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(input) || hostWithPort) input = 'https://' + input;
  let url;
  try { url = new URL(input); } catch { throw new Error('请输入有效的网页地址，例如 example.com'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('请使用 HTTP 或 HTTPS 网页地址，网址中不能包含登录用户名或密码');
  return url.href;
}

function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('窗口设置无效');
  const ids = Object.keys(input);
  if (ids.length > MAX_WINDOWS) throw new Error('最多支持 10 个窗口');
  if (ids.some(slot => !SLOTS.includes(slot))) throw new Error('窗口编号只能为 A–J');
  const output = {};
  const used = new Set();
  for (const slot of SLOTS) {
    if (!Object.hasOwn(input, slot)) continue;
    const value = input?.[slot];
    const seconds = Number(value?.seconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new Error('跳转秒数请填写 1–60 的整数');
    const keys = {};
    for (const action of ALL_ACTIONS) {
      if (!ACTIONS.includes(action) && !value?.keys?.[action]) continue;
      const key = normalizeKey(value?.keys?.[action]);
      if (used.has(key)) throw new Error(`快捷键 ${key} 重复了，请为各窗口的操作分别设置`);
      used.add(key);
      keys[action] = key;
    }
    output[slot] = { url: normalizeUrl(value.url), seconds, keys };
  }
  // Allocate new site-specific bindings after reserving every existing binding.
  for (const value of Object.values(output)) {
    for (const action of siteProfile(value.url).actions) {
      if (value.keys[action]) continue;
      const key = keyCandidates().find(key => !used.has(key));
      if (!key) throw new Error('没有可分配的快捷键');
      value.keys[action] = key;
      used.add(key);
    }
  }
  return output;
}

function keyCandidates() {
  return ['Ctrl+Alt', 'Ctrl+Alt+Shift', 'Ctrl+Shift', 'Alt+Shift', 'Ctrl'].flatMap(modifiers => Array.from({ length: 12 }, (_, index) => `${modifiers}+F${index + 1}`));
}

function nextSlotConfig(existing, isAvailable = () => true) {
  const slot = SLOTS.find(id => !Object.hasOwn(existing, id));
  if (!slot) throw new Error('已达到 10 个窗口上限');
  const used = new Set(Object.values(existing).flatMap(value => Object.values(value.keys)));
  const candidates = keyCandidates();
  const available = [];
  for (const key of candidates) {
    if (!used.has(key) && isAvailable(key)) available.push(key);
    if (available.length === ACTIONS.length) break;
  }
  if (available.length < ACTIONS.length) throw new Error('暂时找不到三组可用快捷键，请先调整已有按键或关闭占用按键的软件');
  return { slot, value: { url: 'https://www.bilibili.com/', seconds: 5, keys: Object.fromEntries(ACTIONS.map((action, index) => [action, available[index]])) } };
}

module.exports = { ACTIONS, ALL_ACTIONS, SLOTS, MAX_WINDOWS, SITE_PRESETS, DEFAULTS, validateConfig, normalizeKey, normalizeUrl, nextSlotConfig, keyCandidates };
