(function (root) {
  function profile(value) {
    let url;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value); }
    catch { return { actions: [], compact: false }; }
    const host = url.hostname;
    const is = domain => host === domain || host.endsWith('.' + domain);
    const douyin = is('douyin.com');
    const video = douyin || is('bilibili.com') || is('youtube.com') || is('youtu.be') || is('twitch.tv');
    const live = host.startsWith('live.') || (is('twitch.tv') && !url.pathname.startsWith('/videos/'));
    return { actions: video ? ['toggle', ...(!live ? ['back', 'forward'] : []), ...(douyin && !live ? ['previous', 'next'] : [])] : [], compact: video };
  }
  if (typeof module === 'object') module.exports = profile;
  else root.siteProfile = profile;
})(typeof window === 'object' ? window : globalThis);
