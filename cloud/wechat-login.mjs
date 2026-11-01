// Protocol reference: L-1124/QQMusicApi, modules/login.py and models/login.py.
// Keep QR identifiers and authorization codes on the local service only.
import { randomBytes } from 'node:crypto';
import { Credential } from './vendor/qqmusic/src/models/credential.js';
import { Request } from './vendor/qqmusic/src/models/request.js';

const appid = 'wx48db31d50e334801';
export function parseWechatStatus(text) {
  const match = /window\.wx_errcode\s*=\s*(\d+)\s*;/.exec(text);
  const state = { 408: 'waiting', 404: 'confirm', 402: 'expired', 403: 'refused', 405: 'done' }[match?.[1]];
  if (!state) throw new Error('QQ 微信登录状态无法识别，请稍后重试');
  const code = /window\.wx_code\s*=\s*['"]([a-zA-Z0-9_-]*)['"]/.exec(text)?.[1];
  if (state === 'done' && !code) throw new Error('QQ 微信授权没有返回有效凭证');
  return { state, code: state === 'done' ? code : undefined };
}
export class WechatLogin {
  constructor(client, fetcher = fetch) { this.client = client; this.fetch = fetcher; }
  async getQr() {
    const params = new URLSearchParams({ appid, redirect_uri: 'https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/', response_type: 'code', scope: 'snsapi_login', state: randomBytes(16).toString('hex') });
    const response = await this.fetch('https://open.weixin.qq.com/connect/qrconnect?' + params, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error('QQ 微信二维码请求失败');
    const html = await response.text();
    const identifier = /\buuid=([a-zA-Z0-9_-]+)["'&]/.exec(html)?.[1] || /\/connect\/qrcode\/([a-zA-Z0-9_-]+)/.exec(html)?.[1];
    if (!identifier) throw new Error('QQ 微信二维码页面格式变化，请更新接入');
    const img = await this.fetch('https://open.weixin.qq.com/connect/qrcode/' + identifier, { headers: { Referer: 'https://open.weixin.qq.com/connect/qrconnect' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
    const mime = img.headers.get('content-type')?.split(';')[0];
    if (!img.ok || !['image/jpeg', 'image/png'].includes(mime)) throw new Error('QQ 微信二维码图片无效');
    const data = Buffer.from(await img.arrayBuffer());
    if (!data.length || data.length > 1024 * 1024) throw new Error('QQ 微信二维码图片无效');
    return { identifier, image: `data:${mime};base64,${data.toString('base64')}` };
  }
  async poll(qr) {
    let response;
    try {
      response = await this.fetch('https://lp.open.weixin.qq.com/connect/l/qrconnect?' + new URLSearchParams({ uuid: qr.identifier, _: String(Date.now()) }), { headers: { Referer: 'https://open.weixin.qq.com/' }, signal: AbortSignal.timeout(35000), redirect: 'error' });
    } catch (e) { if (e.name === 'TimeoutError') return { state: 'waiting' }; throw e; }
    if (!response.ok) throw new Error('QQ 微信登录状态请求失败');
    const result = parseWechatStatus(await response.text());
    if (result.state !== 'done') return { state: result.state };
    const data = await this.client.execute(new Request({ _client: this.client, module: 'music.login.LoginServer', method: 'Login', param: { code: result.code, strAppid: appid }, comm: { tmeLoginType: 1 }, credential: new Credential() }));
    const credential = Credential.fromDict({ ...data, login_type: 1 });
    if (!credential.isLoggedIn()) throw new Error('QQ 微信授权未取得音乐账号，请重新登录');
    return { state: 'done', credential };
  }
}
