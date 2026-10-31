const cards = document.querySelector('#cards');
const feedback = document.querySelector('#feedback');
const addButton = document.querySelector('#add-window');
const windowCount = document.querySelector('#window-count');
const windowList = document.querySelector('#window-list');
const editor = document.querySelector('#editor');
let latest;
let selectedSlot = null;
const removing = new Set();
const actions = { toggle: '播放 / 暂停', back: '后退', forward: '前进', previous: '上一条', next: '下一条' };

function say(text, error = false) {
  feedback.textContent = text;
  feedback.title = text;
  feedback.classList.toggle('error', error);
}
function cardMarkup(slot) {
  const sites = latest.sitePresets.map(site =>
    '<button type="button" class="site-option" data-site="' + site.id + '"><span>' + site.name + '</span><small>' + new URL(site.url).hostname + '</small></button>'
  ).join('');
  const keys = Object.entries(actions).map(([action, label]) =>
    '<div class="key-row" data-key-action="' + action + '"><label for="' + slot + '-' + action + '">' + label + '</label><input class="key" id="' + slot + '-' + action + '" name="' + slot + '-' + action + '" readonly placeholder="保存后自动分配" title="点击后按下新的组合键"></div>'
  ).join('');
  return [
    '<article class="card" data-slot="' + slot + '" id="panel-' + slot + '" role="tabpanel" aria-labelledby="tab-' + slot + '">',
    '<header class="panel-header"><div><h1>窗口 ' + slot + '</h1><p class="status"></p></div></header>',
    '<label class="field-label" for="' + slot + '-url">网页地址</label>',
    '<div class="address-row"><div class="address-field"><details class="site-picker"><summary aria-label="窗口 ' + slot + '：选择常用网站" title="选择网站">▾</summary><div class="site-menu">' + sites + '<button type="button" class="site-option custom-site" data-site="custom">自定义网址…</button></div></details><input class="url" id="' + slot + '-url" name="' + slot + '-url" type="text" inputmode="url" autocomplete="url" spellcheck="false" required placeholder="输入网址" aria-label="窗口 ' + slot + ' 的网页地址"></div><button type="button" class="primary" data-op="open">打开网页</button><button type="button" data-op="close">关闭</button></div>',
    '<section class="control-section"><div class="section-heading"><h2>视频控制</h2><span>用于网页中的视频</span></div><div class="video-tools"><div class="transport"><button type="button" data-command="back">后退</button><button type="button" data-command="toggle">播放 / 暂停</button><button type="button" data-command="forward">前进</button></div><button type="button" class="compact-button" data-op="compact" aria-pressed="false">只看视频</button></div></section>',
    '<div class="feed-controls"><button type="button" data-command="previous">↑ 上一条</button><button type="button" data-command="next">↓ 下一条</button></div>',
    '<div class="login-tools"><button type="button" data-op="login">放大网页</button><span>查看完整网页和账号区域，沿用当前登录状态</span></div>',
    '<details class="shortcut-settings"><summary>快捷键设置</summary><div class="shortcut-fields">' + keys + '<div class="seconds-row"><label for="' + slot + '-seconds">跳转秒数</label><input class="seconds" id="' + slot + '-seconds" name="' + slot + '-seconds" type="number" min="1" max="60" required><span>秒</span></div><p class="shortcut-note">点击按键框后按下组合键，自动保存并生效。</p></div></details>',
    '</article>'
  ].join('\n');
}
function createWindowItem(slot) {
  const row = document.createElement('div');
  row.className = 'window-row';
  row.dataset.row = slot;
  row.setAttribute('role', 'presentation');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'window-item';
  button.dataset.window = slot;
  button.id = 'tab-' + slot;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-controls', 'panel-' + slot);
  button.innerHTML = '<span class="nav-letter">' + slot + '</span><span class="nav-copy"><span class="nav-title"></span><span class="nav-meta"></span></span>';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'window-close';
  close.dataset.remove = slot;
  close.title = '关闭并移除窗口 ' + slot;
  close.setAttribute('aria-label', close.title);
  close.innerHTML = '<span class="nav-dot" aria-hidden="true"></span><svg class="nav-cross" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  row.append(button, close);
  const next = [...windowList.children].find(item => item.dataset.row > slot);
  windowList.insertBefore(row, next || null);
}
function websiteName(value) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value);
    const preset = latest.sitePresets.find(site => new URL(site.url).hostname === url.hostname);
    return preset ? preset.name : url.hostname.replace(/^www\./, '');
  } catch { return '自定义网页'; }
}
function updateWindowItem(slot) {
  const item = windowList.querySelector('[data-window="' + slot + '"]');
  const card = cards.querySelector('[data-slot="' + slot + '"]');
  if (!item || !card || !latest.slots[slot]) return;
  const value = card.querySelector('.url').value;
  const name = websiteName(value);
  const open = latest.slots[slot].open;
  item.querySelector('.nav-title').textContent = name;
  item.querySelector('.nav-meta').textContent = '窗口 ' + slot + ' · ' + (open ? '已打开' : '未打开');
  item.parentElement.classList.toggle('is-open', open);
  item.parentElement.querySelector('.window-close').disabled = removing.has(slot);
  item.title = value;
  item.setAttribute('aria-label', '窗口 ' + slot + '，' + name + '，' + (open ? '已打开' : '未打开'));
  adaptControls(card, slot);
}
function adaptControls(card, slot) {
  const status = latest.slots[slot];
  card.querySelector('[data-op="login"]').textContent = status.loginMode ? '返回浮窗' : '放大网页';
  const draft = card.querySelector('.url').value.trim();
  const same = draft === latest.config[slot].url;
  const detected = status.open && same;
  const profile = detected ? (status.capabilities || { actions: [], compact: false }) : window.siteProfile(draft);
  const supported = profile.actions;
  for (const button of card.querySelectorAll('[data-command]')) {
    button.hidden = !supported.includes(button.dataset.command);
    button.disabled = !detected || !status.capabilities;
  }
  for (const row of card.querySelectorAll('[data-key-action]')) {
    row.hidden = !supported.includes(row.dataset.keyAction);
    row.querySelector('input').disabled = row.hidden;
  }
  card.querySelector('.control-section').hidden = !profile.compact && !supported.includes('toggle') && !status.compact;
  card.querySelector('[data-op="compact"]').hidden = !profile.compact && !status.compact;
  card.querySelector('.feed-controls').hidden = !supported.some(action => ['previous', 'next'].includes(action));
  card.querySelector('.shortcut-settings').hidden = supported.length === 0;
  const seek = supported.includes('back') || supported.includes('forward');
  card.querySelector('.seconds-row').hidden = !seek;
  card.querySelector('.seconds').disabled = !seek;
}
function paintSelection() {
  for (const card of cards.children) card.hidden = card.dataset.slot !== selectedSlot;
  for (const item of windowList.querySelectorAll('.window-item')) {
    const selected = item.dataset.window === selectedSlot;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    item.parentElement.classList.toggle('is-selected', selected);
  }
  document.querySelector('#empty-state').hidden = Boolean(selectedSlot);
}
function selectSlot(slot, focus = false) {
  if (!latest || !Object.hasOwn(latest.config, slot)) return;
  for (const picker of cards.querySelectorAll('.site-picker[open]')) picker.open = false;
  selectedSlot = slot;
  paintSelection();
  editor.scrollTop = 0;
  const item = windowList.querySelector('[data-window="' + slot + '"]');
  item.scrollIntoView({ block: 'nearest' });
  if (focus) item.focus();
}
function readForm() {
  return Object.fromEntries([...cards.children].map(card => {
    const slot = card.dataset.slot;
    return [slot, {
      url: card.querySelector('.url').value,
      seconds: Number(card.querySelector('.seconds').value),
      keys: Object.fromEntries(Object.keys(actions).map(action => [action, card.querySelector('[name="' + slot + '-' + action + '"]').value]).filter(([, value]) => value))
    }];
  }));
}
function showState(state, fill = false) {
  latest = state;
  const ids = Object.keys(state.config);
  const previousSelection = selectedSlot;
  if (!ids.includes(selectedSlot)) selectedSlot = ids[0] || null;
  for (const card of [...cards.children]) if (!ids.includes(card.dataset.slot)) card.remove();
  for (const item of [...windowList.children]) if (!ids.includes(item.dataset.row)) item.remove();
  for (const slot of ids) {
    const fresh = !cards.querySelector('[data-slot="' + slot + '"]');
    if (fresh) {
      const next = [...cards.children].find(card => card.dataset.slot > slot);
      if (next) next.insertAdjacentHTML('beforebegin', cardMarkup(slot));
      else cards.insertAdjacentHTML('beforeend', cardMarkup(slot));
      createWindowItem(slot);
    }
    const card = cards.querySelector('[data-slot="' + slot + '"]');
    const status = state.slots[slot];
    const statusElement = card.querySelector('.status');
    statusElement.textContent = status.message === '等待打开' ? '未打开' : status.message;
    statusElement.dataset.open = String(status.open);
    card.querySelector('[data-op="compact"]').textContent = status.compact ? '回到网页' : '只看视频';
    card.querySelector('[data-op="compact"]').disabled = !status.open;
    card.querySelector('[data-op="compact"]').setAttribute('aria-pressed', String(status.compact));
    card.querySelector('[data-op="close"]').disabled = !status.open;
    for (const button of card.querySelectorAll('[data-command]')) button.disabled = !status.open;
    if (fill || fresh) {
      card.querySelector('.url').value = state.config[slot].url;
      card.querySelector('.seconds').value = state.config[slot].seconds;
      for (const action of Object.keys(actions)) card.querySelector('[name="' + slot + '-' + action + '"]').value = state.config[slot].keys[action] || '';
    }
    for (const action of Object.keys(actions)) {
      const input = card.querySelector('[name="' + slot + '-' + action + '"]');
      if (!input.value && state.config[slot].keys[action]) input.value = state.config[slot].keys[action];
    }
    card.querySelector('[data-command="back"]').textContent = '后退 ' + state.config[slot].seconds + ' 秒';
    card.querySelector('[data-command="forward"]').textContent = '前进 ' + state.config[slot].seconds + ' 秒';
    updateWindowItem(slot);
  }
  paintSelection();
  if (selectedSlot !== previousSelection) {
    windowList.querySelector('[data-window="' + selectedSlot + '"]')?.scrollIntoView({ block: 'nearest' });
    editor.scrollTop = 0;
  }
  addButton.disabled = ids.length >= state.maxWindows;
  addButton.textContent = ids.length >= state.maxWindows ? '已达窗口上限' : '＋ 添加窗口';
  windowCount.textContent = ids.length + ' / ' + state.maxWindows;
  windowCount.title = '最多 ' + state.maxWindows + ' 个窗口';
  document.querySelector('#open-count').textContent = Object.values(state.slots).filter(value => value.open).length + ' 个已打开';
  if (state.shortcutErrors.length) say(state.shortcutErrors.join('；'), true);
  const storageWarning = document.querySelector('#storage-warning');
  storageWarning.textContent = state.storageError || '';
  storageWarning.hidden = !state.storageError;
}
async function checked(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function save() {
  const invalid = [...cards.querySelectorAll('input')].find(input => !input.checkValidity());
  if (invalid) {
    const slot = invalid.closest('.card').dataset.slot;
    selectSlot(slot);
    const folded = invalid.closest('.shortcut-settings');
    if (folded) folded.open = true;
    invalid.reportValidity();
    throw new Error('请检查窗口 ' + slot + ' 的设置');
  }
  const state = await checked(window.duoview.save(readForm()));
  showState(state);
  for (const [slot, value] of Object.entries(state.config)) {
    cards.querySelector('[data-slot="' + slot + '"] .url').value = value.url;
    updateWindowItem(slot);
  }
  return state;
}
windowList.addEventListener('click', async event => {
  const close = event.target.closest('[data-remove]');
  if (close) {
    const slot = close.dataset.remove;
    if (removing.has(slot)) return;
    removing.add(slot);
    close.disabled = true;
    const restoreFocus = close === document.activeElement;
    try {
      showState(await checked(window.duoview.remove(slot)));
      say('已关闭并移除窗口 ' + slot);
      if (restoreFocus) {
        const target = windowList.querySelector('[data-window="' + selectedSlot + '"]') || addButton;
        target.focus();
      }
    } catch (error) { say(error.message, true); }
    finally {
      removing.delete(slot);
      showState(await checked(window.duoview.getState()));
    }
    return;
  }
  const item = event.target.closest('[data-window]');
  if (item) selectSlot(item.dataset.window);
});
windowList.addEventListener('keydown', event => {
  const ids = Object.keys(latest.config);
  let index = ids.indexOf(selectedSlot);
  if (event.key === 'ArrowDown') index = Math.min(index + 1, ids.length - 1);
  else if (event.key === 'ArrowUp') index = Math.max(index - 1, 0);
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = ids.length - 1;
  else return;
  event.preventDefault();
  selectSlot(ids[index], true);
});
addButton.addEventListener('click', async () => {
  addButton.disabled = true;
  try {
    await save();
    const result = await checked(window.duoview.add());
    showState(result.state);
    selectSlot(result.slot, true);
    say('已添加窗口 ' + result.slot);
  } catch (error) { say(error.message, true); }
  finally { showState(await checked(window.duoview.getState())); }
});
document.querySelector('#settings').addEventListener('submit', async event => {
  event.preventDefault();
  try { await save(); say('设置已保存'); } catch (error) { say(error.message, true); }
});
cards.addEventListener('input', event => {
  if (event.target.classList.contains('url')) updateWindowItem(event.target.closest('.card').dataset.slot);
});
cards.addEventListener('keydown', async event => {
  if (event.key === 'Escape') {
    const picker = cards.querySelector('.site-picker[open]');
    if (picker) { picker.open = false; picker.querySelector('summary').focus(); event.preventDefault(); return; }
  }
  if (!event.target.classList.contains('key')) return;
  if (event.repeat) return;
  if (event.key === 'Tab' || event.key === 'Escape') return;
  event.preventDefault();
  const code = event.code;
  const key = /^(?:Key[A-Z]|Digit[0-9])$/.test(code) ? code.replace(/^(Key|Digit)/, '') : /^F(?:[1-9]|1[0-2])$/.test(code) ? code : ({ ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Space: 'Space' })[code];
  if (!key) return;
  if (!(event.ctrlKey || event.altKey) || event.metaKey) return say('请按住 Ctrl 或 Alt，再按一个键', true);
  event.target.value = [...(event.ctrlKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), key].join('+');
  const input = event.target;
  const slot = input.closest('.card').dataset.slot;
  const action = input.closest('[data-key-action]').dataset.keyAction;
  try {
    showState(await checked(window.duoview.bind(slot, action, input.value)));
    say('快捷键已保存并生效');
  } catch (error) {
    input.value = latest.config[slot].keys[action] || '';
    say(error.message, true);
  }
});
document.addEventListener('click', event => {
  for (const picker of cards.querySelectorAll('.site-picker[open]')) if (!picker.contains(event.target)) picker.open = false;
});
cards.addEventListener('toggle', event => {
  const picker = event.target;
  if (picker.matches('.site-picker') && picker.open) for (const other of cards.querySelectorAll('.site-picker[open]')) if (other !== picker) other.open = false;
}, true);
cards.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const slot = button.closest('.card').dataset.slot;
  if (button.dataset.site) {
    const input = button.closest('.card').querySelector('.url');
    const site = latest.sitePresets.find(value => value.id === button.dataset.site);
    if (site) input.value = site.url;
    button.closest('.site-picker').open = false;
    input.focus();
    if (!site) input.select();
    updateWindowItem(slot);
    return;
  }
  button.disabled = true;
  try {
    if (button.dataset.command) {
      const result = await checked(window.duoview.command(slot, button.dataset.command));
      if (!result.ok) throw new Error(result.message);
    } else if (button.dataset.op === 'open') {
      await save();
      showState(await checked(window.duoview.open(slot)));
      say('已打开窗口 ' + slot);
    } else if (button.dataset.op === 'close') {
      showState(await checked(window.duoview.close(slot)));
      say('已关闭窗口 ' + slot);
    } else if (button.dataset.op === 'login') {
      await save();
      showState(await checked(window.duoview.login(slot, !latest.slots[slot].loginMode)));
      say(latest.slots[slot].loginMode ? '已放大网页，完成后点击“返回浮窗”' : '已返回浮窗');
    } else if (button.dataset.op === 'compact') {
      const result = await checked(window.duoview.compact(slot, !latest.slots[slot].compact));
      if (!result.ok) throw new Error(result.message);
    }
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; showState(await checked(window.duoview.getState())); }
});
document.querySelector('#help-toggle').addEventListener('click', () => document.querySelector('#help-dialog').showModal());
document.querySelector('#help-close').addEventListener('click', () => document.querySelector('#help-dialog').close());
window.duoview.onState(state => showState(state));
window.duoview.getState().then(result => {
  if (!result.ok) throw new Error(result.error);
  showState(result.value, true);
}).catch(error => say(error.message, true));
