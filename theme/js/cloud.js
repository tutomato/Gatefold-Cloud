import { call, ok, httpPost, esc, fmtTime, hasBridge } from './bridge.js';
import { $ } from './ui.js';
import { CLOUD } from './cloud-config.js';

let built = false, provider = 'netease', generation = 0, timer = 0, page = 1, listing = 'search', playlistId = '', query = '';
const names = { netease: '网易云音乐', qq: 'QQ 音乐' };
const view = $('view-cloud');
export async function api(action, params = {}, source = provider) {
  if (!CLOUD.token) throw new Error('请先启动 Gatefold Cloud 本机服务，然后重新加载主题');
  if (!hasBridge()) throw new Error('请在 foobar2000 的 Gatefold 主题中打开在线音乐');
  const r = await httpPost({ url: CLOUD.url + '/api', headers: { 'Content-Type': 'application/json', 'X-Gatefold-Key': CLOUD.token }, body: JSON.stringify({ provider: source, action, params }), timeout: action === 'resolve' ? 180000 : action === 'poll' ? 75000 : 35000 });
  if (r?.code === 'PERMISSION_DENIED') throw new Error('组件禁止访问本机服务。请打开参数选项 → 高级 → Tools → WebView UI，勾选 Allow local network access（允许本地网络访问），应用后重试。');
  if (!ok(r) || !r.body) throw new Error(`本机连接失败（${r?.code || r?.status || '无响应'}）。请确认服务已启动；若已启动，请将这个错误码告知开发者。`);
  let b;
  try { b = typeof r.body === 'string' ? JSON.parse(r.body) : r.body; } catch { throw new Error('本机服务响应无效'); }
  if (!b.success) throw new Error(b.error || '操作失败');
  return b.data;
}
function message(text, error = false) { const el = $('cloudMessage'); el.textContent = text; el.classList.toggle('error', error); }
async function status() {
  const g = generation;
  try { const s = await api('status'); if (g !== generation) return; $('cloudAccount').textContent = s.loggedIn ? s.name || '已登录' : '尚未登录'; }
  catch (e) { if (g === generation) message(e.message, true); }
}
async function login(loginType = 'qq') {
  clearTimeout(timer);
  const g = ++generation, source = provider;
  message(source === 'netease' ? '正在打开网易云官方登录窗口…' : '正在获取二维码…');
  $('cloudSignIn').disabled = true; $('cloudWechat').disabled = true;
  try {
    const r = await api('login', { loginType }, source);
    if (g !== generation) return;
    if (!r.browser && !/^data:image\/(png|jpeg|webp);base64,/.test(r.image)) throw new Error('二维码格式无效');
    $('cloudQr').hidden = !!r.browser; if (r.image) $('cloudQr').src = r.image; $('cloudLogin').hidden = false; $('cloudQrHelp').textContent = r.message;
    $('cloudLoginTitle').textContent = r.browser ? '在网易云官网完成登录' : '手机扫码确认';
    $('cloudCancel').textContent = r.browser ? '取消网页登录' : '关闭二维码';
    message(r.browser ? r.message : '请扫码登录。登录成功后会加密保存在本机，重启后自动恢复。');
    async function poll() {
      if (g !== generation) return;
      try {
        const s = await api('poll', {}, source);
        if (g !== generation) return;
        if (s.state === 'done') { $('cloudLogin').hidden = true; message('登录成功，可以搜索或打开我的歌单'); await status(); return; }
        if (s.state === 'refused') { $('cloudLogin').hidden = true; message('已取消登录'); return; }
        if (s.state === 'expired') { message('登录已超时，请重新打开登录入口', true); return; }
        $('cloudQrHelp').textContent = s.state === 'confirm' ? '已扫码，请在手机上确认' : r.message;
        timer = setTimeout(poll, 2500);
      } catch (e) { if (g === generation) message(e.message, true); }
    }
    timer = setTimeout(poll, 2500);
  } catch (e) { if (g === generation) message(e.message, true); }
  finally { $('cloudSignIn').disabled = false; $('cloudWechat').disabled = false; }
}
export async function play(t, options = {}) {
  const message = options.report || ((text,error) => { const el=$('cloudMessage'); if(el){el.textContent=text;el.classList.toggle('error',!!error);} });
  const source = t.source || provider, quality = options.quality || $('cloudQuality')?.value || 'lossless';
  message(`正在检查本地缓存，必要时下载「${t.title}」的 ${quality} 音源…`);
  try {
    const r = source === 'local' ? {url:t.absolutePath,quality:'本地',codec:''} : await api('resolve', { id: t.id, quality, track: t }, source);
    const all = await call('playlist.getAll');
    if (!ok(all)) throw new Error('无法读取 foobar2000 播放列表');
    let guid = (all.playlists || []).find(p => p.name === 'Gatefold · 在线音乐')?.guid;
    if (!guid) { const c = await call('playlist.create', { name: 'Gatefold · 在线音乐' }); if (!ok(c) || !c.guid) throw new Error('无法创建在线播放列表'); guid = c.guid; }
    // Add to a dedicated playlist so existing local playlists are not cleared.
    // The host returns the precise added row, avoiding races with playlist changes.
    const add = await call('playlist.addPathsSequential', { paths: [r.url], playlistGuid: guid });
    if (!ok(add) || !add.addedCount || !Number.isInteger(add.order?.[0])) throw new Error(add.error || '无法将网络音源交给 foobar2000');
    await call('playlist.setActive', { playlistGuid: guid });
    const pr = await call('playlist.playTrack', { playlistGuid: guid, index: add.order[0] });
    if (!ok(pr)) throw new Error(pr.error || '播放器未能启动此音源');
    message(`播放请求已提交给 foobar2000：${t.title} · ${r.quality} · ${r.codec || '格式由播放器确认'}。独占状态以播放器输出设置为准。`);
  } catch (e) { message(e.message, true); }
}
function tracks(list) {
  const box = $('cloudResults'); box.replaceChildren();
  for (const t of list) {
    const row = document.createElement('div'); row.className = 'cloud-track';
    row.innerHTML = `<div><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · ${esc(t.album)}</small><small class="cloud-source">${esc(t.source === 'local' ? '本地音乐' : names[t.source || provider])}</small></div><span>${fmtTime(t.duration)}</span><button class="btn sm">播放</button>`;
    row.querySelector('button').onclick = () => play(t);
    box.append(row);
  }
  if (!list.length) box.textContent = '没有更多歌曲';
}
async function load() {
  if(listing === 'search') return import('./unified-search.js?v=10').then(m=>m.open(query));
  const g = generation;
  message('正在加载…');
  try {
    const r = await api(listing, listing === 'search' ? { query, page } : listing === 'playlist' ? { id: playlistId, page } : { page });
    if (g !== generation) return;
    if (listing === 'playlists') {
      const box = $('cloudResults'); box.replaceChildren();
      for (const p of r.playlists) { const b = document.createElement('button'); b.className = 'cloud-playlist'; b.innerHTML = `<strong>${esc(p.name)}</strong><small>${p.count} 首</small>`; b.onclick = () => { listing = 'playlist'; playlistId = p.id; page = 1; load(); }; box.append(b); }
      if (!r.playlists.length) box.textContent = '当前账号没有返回歌单';
    } else tracks(r.tracks);
    $('cloudPage').textContent = `第 ${page} 页`; $('cloudPrev').disabled = page <= 1;
    message(`${names[provider]} · ${listing === 'playlists' ? '我的歌单' : '歌曲'}（平台权限以实际返回为准）`);
  } catch (e) { if (g === generation) message(e.message, true); }
}
export function open() {
  if (!built) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'css/cloud.css'; document.head.append(css);
    view.innerHTML = `<div class="cloud-header"><div><small>GATEFOLD CLOUD · 本机连接</small><h1>在线音乐</h1><p>你的账号、你的歌单，由 foobar2000 播放。</p></div><span class="cloud-pill">原生音频输出</span></div>
      <div class="cloud-toolbar"><button class="btn primary" data-source="netease">网易云音乐</button><button class="btn" data-source="qq">QQ 音乐</button><span id="cloudAccount">尚未连接</span><button class="btn" id="cloudSignIn">网易云网页登录</button><button class="btn" id="cloudWechat" hidden>微信登录（QQ 音乐）</button><button class="btn" id="cloudSignOut">退出账号</button></div>
      <form id="cloudSearch" class="cloud-toolbar"><input id="cloudQuery" placeholder="搜索歌曲、歌手…" aria-label="搜索歌曲" maxlength="160"><select id="cloudQuality" aria-label="请求音质"><option value="lossless">无损</option><option value="hires">Hi-Res（网易云）</option><option value="320k">320k</option></select><button class="btn primary">搜索</button><button type="button" id="cloudPlaylists" class="btn">我的歌单</button></form>
      <div id="cloudLogin" hidden><img id="cloudQr" alt="登录二维码"><div><h3 id="cloudLoginTitle">手机扫码确认</h3><p id="cloudQrHelp"></p><p>不会要求你在此输入账号密码。登录凭证由当前 Windows 账号加密保存；退出账号时删除。</p><button class="btn" id="cloudCancel">关闭二维码</button></div></div>
      <p id="cloudMessage" role="status" aria-live="polite">连接本机服务中…</p><div id="cloudResults" class="scroller"><div class="cloud-empty">从一首喜欢的歌开始。<br><small>选择平台并搜索，或登录后浏览歌单。</small></div></div>
      <footer class="cloud-toolbar"><button id="cloudPrev" class="btn" disabled>上一页</button><span id="cloudPage">第 1 页</span><button id="cloudNext" class="btn">下一页</button></footer>`;
    view.querySelectorAll('[data-source]').forEach(b => { b.onclick = () => { const previous = provider; if (!$('cloudLogin').hidden) void api('cancelLogin', {}, previous).catch(() => {}); provider = b.dataset.source; $('cloudWechat').hidden = provider !== 'qq'; $('cloudSignIn').textContent = provider === 'qq' ? 'QQ 扫码登录' : '网易云网页登录'; generation++; clearTimeout(timer); $('cloudLogin').hidden = true; $('cloudResults').replaceChildren(); view.querySelectorAll('[data-source]').forEach(x => x.classList.toggle('primary', x === b)); page = 1; query = ''; listing = 'search'; $('cloudPage').textContent = '第 1 页'; message('请选择登录或搜索'); status(); }; });
    // Capture at the view rather than relying on individual DOM property handlers.
    view.addEventListener('click', e => {
      const wx = e.target.closest('#cloudWechat');
      if (!wx && !e.target.closest('#cloudSignIn')) return;
      e.preventDefault(); e.stopPropagation();
      login(wx ? 'wx' : 'qq');
    }, true);
    $('cloudSignOut').onclick = async () => { generation++; clearTimeout(timer); $('cloudLogin').hidden = true; try { await api('logout'); message('已退出本机账号'); status(); } catch (e) { message(e.message, true); } };
    $('cloudCancel').onclick = async () => { generation++; clearTimeout(timer); $('cloudLogin').hidden = true; try { await api('cancelLogin'); message('已取消登录'); } catch(e) { message(e.message, true); } };
    $('cloudSearch').onsubmit = e => { e.preventDefault(); query = $('cloudQuery').value.trim(); if (!query) return; page = 1; listing = 'search'; load(); };
    $('cloudSearch').querySelector('button').onclick = e => { e.preventDefault(); $('cloudSearch').requestSubmit(); };
    $('cloudPlaylists').onclick = () => { page = 1; listing = 'playlists'; load(); };
    $('cloudPrev').onclick = () => { if (page > 1) { page--; load(); } };
    $('cloudNext').onclick = () => { if (listing === 'search' && !query) return; page++; load(); };
    built = true;
    view.querySelector('.cloud-header small').textContent = 'GATEFOLD CLOUD · 本机连接 · 修订 11 · 封面歌词缓存';
    message('页面已就绪，正在检查本机连接…');
  }
  status();
}

