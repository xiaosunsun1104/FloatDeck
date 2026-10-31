// This function runs inside the video webpage. It has no Node.js access.
function installPlayer() {
  const namespace = '__duoview_player_v1__';
  if (window[namespace]) return;
  let compact = false;
  let marked = null;
  let ancestors = [];
  let stage = null;
  let overlays = [];
  let excluded = [];
  const style = document.createElement('style');
  style.textContent = `
    html[data-duoview-compact] { background: #000 !important; }
    html[data-duoview-compact] body { background: #000 !important; }
    html[data-duoview-compact] .duoview-excluded, html[data-duoview-compact] .duoview-excluded * { visibility: hidden !important; pointer-events: none !important; }
    html[data-duoview-compact] .duoview-ancestor { transform: none !important; filter: none !important; perspective: none !important; contain: none !important; overflow: visible !important; clip-path: none !important; }
    html[data-duoview-compact] .duoview-stage { position: fixed !important; inset: 0 !important; margin: 0 !important; padding: 0 !important; width: 100vw !important; height: 100vh !important; min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important; overflow: hidden !important; background: #000 !important; z-index: 2147483646 !important; }
    html[data-duoview-compact] video.duoview-video { visibility: visible !important; display: block !important; position: fixed !important; inset: 0 !important; margin: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; min-width: 0 !important; min-height: 0 !important; object-fit: contain !important; transform: none !important; z-index: 1 !important; }
    html[data-duoview-compact] .duoview-danmaku { position: absolute !important; left: 0 !important; right: 0 !important; width: 100% !important; z-index: 2 !important; pointer-events: none !important; }
    html[data-duoview-compact] .duoview-danmaku.bpx-player-render-dm-wrap { inset: 0 !important; height: 100% !important; }
  `;
  (document.head || document.documentElement).append(style);

  function clearClasses() {
    marked?.classList.remove('duoview-video');
    stage?.classList.remove('duoview-stage');
    for (const overlay of overlays) overlay.classList.remove('duoview-danmaku');
    overlays = [];
    for (const element of excluded) element.classList.remove('duoview-excluded');
    excluded = [];
    stage = null;
    for (const element of ancestors) element.classList.remove('duoview-ancestor');
    ancestors = [];
  }

  function selectVideo() {
    // Measure the site's own layout, even when our compact layout is enabled.
    clearClasses();
    if (compact) document.documentElement.removeAttribute('data-duoview-compact');
    const candidates = [...document.querySelectorAll('video')].map(video => {
      const rect = video.getBoundingClientRect();
      const css = getComputedStyle(video);
      const area = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return { video, area: css.display === 'none' || css.opacity === '0' ? 0 : area };
    }).filter(item => item.area > 0);
    candidates.sort((a, b) => Number(!b.video.paused) - Number(!a.video.paused) || b.area - a.area);
    marked = candidates[0]?.video || null;
    if (compact && marked) {
      stage = marked.closest('.bpx-player-video-area, .xgplayer, .douyin-player') || marked.parentElement;
      if (stage) {
        stage.classList.add('duoview-stage');
        overlays = [...stage.querySelectorAll('.bpx-player-render-dm-wrap, .danmu')];
        for (const overlay of overlays) overlay.classList.add('duoview-danmaku');
        const hide = element => { element.classList.add('duoview-excluded'); excluded.push(element); };
        // Hide branches, not the whole document: late-loaded native overlays must
        // never inherit a hidden player and be mistaken for a disabled overlay.
        for (let branch = stage; branch && branch !== document.body; branch = branch.parentElement) {
          for (const sibling of branch.parentElement?.children || []) if (sibling !== branch && sibling.tagName !== 'HEAD') hide(sibling);
        }
        const keep = element => element === marked || element.contains(marked) || overlays.some(overlay => element === overlay || element.contains(overlay));
        const prune = element => {
          if (element === marked || overlays.includes(element)) return;
          for (const child of element.children) {
            if (keep(child)) prune(child); else hide(child);
          }
        };
        prune(stage);
      }
      marked.classList.add('duoview-video');
      for (let parent = marked.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
        parent.classList.add('duoview-ancestor');
        ancestors.push(parent);
      }
    }
    document.documentElement.toggleAttribute('data-duoview-compact', compact && Boolean(marked));
    return marked;
  }

  function switchButton(action) {
    if (!(location.hostname === 'douyin.com' || location.hostname.endsWith('.douyin.com'))) return null;
    const name = action === 'previous' ? 'prev' : 'next';
    return [...document.querySelectorAll('[data-e2e="video-switch-' + name + '-arrow"]')].find(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.width > 0 && rect.height > 0 && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true' && (compact || !hit || element.contains(hit));
    });
  }
  function capabilities() {
    const video = selectVideo();
    const actions = [];
    if (video) {
      actions.push('toggle');
      if (!location.hostname.startsWith('live.') && Number.isFinite(video.duration) && video.duration > 0 && video.seekable.length) actions.push('back', 'forward');
    }
    for (const action of ['previous', 'next']) if (switchButton(action)) actions.push(action);
    return { actions, compact: Boolean(video) };
  }

  window[namespace] = {
    uninstall() {
      clearInterval(timer);
      compact = false;
      document.documentElement.removeAttribute('data-duoview-compact');
      clearClasses();
      style.remove();
      delete window[namespace];
    },
    capabilities,
    setCompact(value) {
      const found = Boolean(selectVideo());
      compact = Boolean(value) && found;
      document.documentElement.toggleAttribute('data-duoview-compact', compact);
      selectVideo();
      return { ok: !value || found, compact, found, message: value && !found ? '请先在网页中选片并开始播放，再使用只看视频' : '' };
    },
    async command(action, seconds) {
      if (action === 'previous' || action === 'next') {
        const button = switchButton(action);
        if (!button) return { ok: false, message: '当前页面没有可用的上下切换按钮，请进入抖音推荐视频页' };
        const wasCompact = compact;
        if (compact) {
          compact = false;
          document.documentElement.removeAttribute('data-duoview-compact');
          selectVideo();
        }
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (hit && !button.contains(hit)) {
          compact = wasCompact;
          document.documentElement.toggleAttribute('data-duoview-compact', compact);
          selectVideo();
          return { ok: false, message: '切换按钮被网页弹层挡住，请先回到网页关闭弹层' };
        }
        const focused = document.activeElement;
        if (focused?.matches('input, textarea, [contenteditable="true"]')) focused.blur();
        return { ok: true, switchTarget: { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }, restoreCompact: wasCompact };
      }
      const video = selectVideo();
      if (!video) return { ok: false, message: '当前页面没找到可见视频，请先在网页模式打开并播放视频' };
      try {
        if (action === 'toggle') {
          if (video.paused) await video.play(); else video.pause();
        } else if (action === 'back' || action === 'forward') {
          const step = Number(seconds);
          if (!Number.isFinite(step) || step < 1 || step > 60) return { ok: false, message: '跳转秒数无效' };
          if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.seekable.length) return { ok: false, message: '这个视频暂时不能快进或后退（直播或尚未加载）' };
          const requested = video.currentTime + (action === 'back' ? -step : step);
          const ranges = Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]);
          const nearest = ranges.map(([start, end]) => Math.min(end, Math.max(start, requested))).sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested))[0];
          video.currentTime = Math.min(video.duration, nearest);
        } else return { ok: false, message: '未知操作' };
        return { ok: true, paused: video.paused, time: video.currentTime };
      } catch (error) { return { ok: false, message: `播放操作失败：${error.message}` }; }
    }
  };
  const timer = setInterval(selectVideo, 750);
}

const installScript = `(${installPlayer.toString()})()`;
const commandScript = (action, seconds) => `window.__duoview_player_v1__?.command(${JSON.stringify(action)}, ${JSON.stringify(seconds)})`;
const compactScript = value => `window.__duoview_player_v1__?.setCompact(${Boolean(value)})`;
const capabilitiesScript = 'window.__duoview_player_v1__?.capabilities()';
module.exports = { installPlayer, installScript, commandScript, compactScript, capabilitiesScript };
