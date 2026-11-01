import netease from 'NeteaseCloudMusicApi';
import { Client } from './qq-client.mjs';
import { Credential } from './qq-client.mjs';
import { Request } from './qq-client.mjs';
import { WechatLogin } from './wechat-login.mjs';
import { SessionStore } from './session-store.mjs';
import { NeteaseWebLogin } from './netease-web-login.mjs';

export function neteaseTrack(t) {
  return { id: String(t.id), title: t.name || '', artist: (t.ar || t.artists || []).map(a => a.name).join(' / '), album: (t.al || t.album)?.name || '', duration: (t.dt || t.duration || 0) / 1000 };
}
export function qqTrack(t) {
  return { id: String(t.mid || t.songmid || t.id), title: t.title || t.name || t.songname || '', artist: (t.singer || []).map(a => a.name).join(' / '), album: t.album?.name || t.albumname || '', duration: t.interval || 0 };
}
export function checkedAudioURL(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('音源地址无效');
  const allowed = ['music.126.net', 'music.163.com', 'qqmusic.qq.com', 'stream.qqmusic.qq.com', 'qq.com'];
  if (!allowed.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) throw new Error('音源返回了未识别的服务器，已停止播放');
  return u.href;
}
export class Providers {
  constructor(dir) {
    this.neCookie = '';
    this.qq = new Client({ devicePath: `${dir}/qq-device.json` });
    this.wechat = new WechatLogin(this.qq);
    this.qr = new Map();
    this.sessions = new SessionStore(dir);
    this.restoreErrors = {};
    this.neWeb = new NeteaseWebLogin();
  }
  async restore() {
    for (const provider of ['netease','qq']) {
      try {
        const saved = await this.sessions.load(provider);
        if (provider === 'netease' && typeof saved?.cookie === 'string') this.neCookie = saved.cookie;
        if (provider === 'qq' && saved) this.qq.credential = Credential.fromDict(saved);
      } catch { this.restoreErrors[provider] = true; }
    }
  }
  async persist(provider) {
    try {
      await this.sessions.save(provider, provider === 'qq' ? (this.qq.credential.isLoggedIn() ? this.qq.credential.toJSON() : null) : (this.neCookie ? {cookie:this.neCookie} : null));
      delete this.restoreErrors[provider];
    } catch { throw new Error('登录状态未能保存或删除，请重试；不要关闭本机服务'); }
  }
  async ne(method, args = {}) {
    const r = await netease[method]({ ...args, cookie: this.neCookie, timeout: 20000 });
    const b = r.body;
    if (b?.code && b.code !== 200 && ![800, 801, 802, 803].includes(b.code)) throw new Error(`网易云接口返回 ${b.code}，请重新登录或稍后重试`);
    return b;
  }
  async run(provider, action, p) {
    if (action === 'status' && this.restoreErrors[provider]) throw new Error('登录状态无法解密，请在原 Windows 账号运行，或重新扫码登录');
    if (provider === 'netease') return this.netease(action, p);
    if (provider === 'qq') return this.tencent(action, p);
    throw new Error('未知音乐平台');
  }
  async netease(action, p) {
    switch (action) {
      case 'status': {
        if (!this.neCookie) return { loggedIn: false };
        const r = await this.ne('login_status');
        return { loggedIn: !!r.data?.profile, name: r.data?.profile?.nickname || '' };
      }
      case 'login': {
        await this.neWeb.start();
        return { browser: true, message: '请在新打开的网易云官网窗口完成登录；成功后窗口自动关闭，凭证加密保存在本机。' };
      }
      case 'poll': {
        return this.neWeb.poll(async (cookie, active) => {
          const r = await netease.login_status({ cookie, timeout:20000 });
          if (!r.body?.data?.profile) throw new Error('网易云网页登录尚未取得有效账号，请完成官网授权后重试');
          if (!active()) return;
          this.neCookie=cookie;
          await this.persist('netease');
        });
      }
      case 'cancelLogin': await this.neWeb.cancel(); return {state:'refused'};
      case 'logout': await this.neWeb.cancel(); this.neCookie = ''; this.qr.delete('netease'); await this.persist('netease'); return { loggedIn: false };
      case 'search': {
        const r = await this.ne('cloudsearch', { keywords: p.query, type: 1, limit: 30, offset: (p.page - 1) * 30 });
        return { tracks: (r.result?.songs || []).map(neteaseTrack), total: r.result?.songCount || 0 };
      }
      case 'playlists': {
        const s = await this.ne('login_status');
        const uid = s.data?.profile?.userId;
        if (!uid) throw new Error('请先扫码登录网易云');
        const r = await this.ne('user_playlist', { uid, limit: 100, offset: (p.page - 1) * 100 });
        return { playlists: (r.playlist || []).map(x => ({ id: String(x.id), name: x.name, count: x.trackCount })), more: !!r.more };
      }
      case 'playlist': {
        const r = await this.ne('playlist_track_all', { id: p.id, limit: 30, offset: (p.page - 1) * 30 });
        return { tracks: (r.songs || []).map(neteaseTrack) };
      }
      case 'resolve': {
        const requested = p.quality === 'hires' ? 'hires' : p.quality === 'lossless' ? 'lossless' : 'exhigh';
        const r = await this.ne('song_url_v1', { id: p.id, level: requested });
        const x = r.data?.[0];
        if (!x?.url) throw new Error('没有可播放音源：请检查会员、单曲购买权限和地区限制');
        if (x.freeTrialInfo) throw new Error('平台仅返回试听音源，未当作完整歌曲播放');
        const level = x.level || 'unknown';
        if (level !== requested) throw new Error(`请求 ${requested}，平台只返回 ${level}；请选择可用档位后重试`);
        return { url: checkedAudioURL(x.url), quality: level, codec: x.type || '', bitrate: x.br || 0, size: x.size || 0 };
      }
    }
    throw new Error('不支持的操作');
  }
  async tencent(action, p) {
    switch (action) {
      case 'cancelLogin': this.qr.delete('qq'); return {state:'refused'};
      case 'status': return { loggedIn: this.qq.credential.isLoggedIn(), name: this.qq.credential.isLoggedIn() ? `QQ 音乐（${this.qq.credential.loginType === 1 ? '微信' : 'QQ'}）已登录` : '' };
      case 'login': {
        if (p.loginType === 'wx') {
          const qr = await this.wechat.getQr();
          this.qr.set('qq', { qr, type: 'wx', until: Date.now() + 180000 });
          return { image: qr.image, message: '用开通 QQ 音乐会员的微信扫码，并在微信中确认授权' };
        }
        const qr = await this.qq.login.getQrcode('qq');
        this.qr.set('qq', { qr, until: Date.now() + 180000 });
        return { image: `data:${qr.mime};base64,${qr.data.toString('base64')}`, message: '用手机 QQ 扫码并确认（当前接入支持 QQ 账号）' };
      }
      case 'poll': {
        const q = this.qr.get('qq');
        if (!q || q.until < Date.now()) return { state: 'expired' };
        if (q.type === 'wx') {
          if (!q.pending) q.pending = this.wechat.poll(q.qr).finally(() => { q.pending = null; });
          const r = await q.pending;
          if (this.qr.get('qq') !== q) return { state: 'expired' };
          if (r.credential) { this.qq.credential = r.credential; await this.persist('qq'); }
          if (['done', 'expired', 'refused'].includes(r.state)) this.qr.delete('qq');
          return { state: r.state };
        }
        const r = await this.qq.login.checkQrcode(q.qr);
        if (this.qr.get('qq') !== q) return { state: 'expired' };
        if (r.credential) { this.qq.credential = r.credential; await this.persist('qq'); this.qr.delete('qq'); return { state: 'done' }; }
        return { state: ({ 1: 'waiting', 2: 'confirm', 3: 'expired', 4: 'expired' })[r.event] || 'waiting' };
      }
      case 'logout': this.qq.credential = new Credential(); this.qr.delete('qq'); await this.persist('qq'); return { loggedIn: false };
      case 'search': {
        const r = await this.qq.search.searchByType(p.query, 0, 30, p.page, null, false);
        const list = r.body?.item_song || r.body?.song?.list || r.song?.list || [];
        return { tracks: list.map(qqTrack), total: r.meta?.sum || 0 };
      }
      case 'playlists': {
        if (!this.qq.credential.isLoggedIn()) throw new Error('请先扫码登录 QQ');
        const r = await this.qq.user.getUserSonglist(this.qq.credential.strMusicid || String(this.qq.credential.musicid), p.page, 30);
        const list = r.v_playlist || r.list || r.songlist || [];
        if (!Array.isArray(list)) throw new Error('QQ 歌单响应格式发生变化，需要更新接入');
        return { playlists: list.map(x => ({ id: String(x.tid || x.dissid || x.id), name: x.dirName || x.diss_name || x.dissname || x.name, count: x.songNum || x.song_cnt || x.songnum || 0 })) };
      }
      case 'playlist': {
        const r = await this.qq.execute(new Request({ _client: this.qq, module: 'music.srfDissInfo.DissInfo', method: 'CgiGetDiss', param: { disstid: Number(p.id), dirid: 0, tag: false, song_begin: (p.page - 1) * 30, song_num: 30, userinfo: false, orderlist: true, onlysonglist: true } }));
        return { tracks: (r.songlist || r.songs || []).map(qqTrack), total: r.total_song_num || r.total || 0 };
      }
      case 'resolve': {
        if (p.quality === 'hires') throw new Error('QQ Hi-Res 接口尚未验证，请选择无损或 320k');
        const code = p.quality === 'lossless' ? 'F000' : 'M800';
        const r = await this.qq.song.getPlayUrls([p.id], code);
        const x = r[p.id];
        if (!x?.url) throw new Error('该音质没有可播放音源，请检查登录、会员和单曲购买权限');
        const u = checkedAudioURL(x.url);
        // Explicitly reject a different quality rather than silently falling back.
        if (!new URL(u).pathname.split('/').pop().startsWith(code)) throw new Error('平台返回音质与请求不一致，已停止播放');
        return { url: u, quality: code === 'F000' ? 'lossless' : '320k', codec: code === 'F000' ? 'flac' : 'mp3', bitrate: code === 'M800' ? 320000 : 0, size: x.size || 0 };
      }
    }
    throw new Error('不支持的操作');
  }
}
