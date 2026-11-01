import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class AudioRelay {
  constructor(validate, fetcher = fetch) { this.validate = validate; this.fetch = fetcher; this.entries = new Map(); }
  async upstream(url, options) {
    for (let i = 0; i < 5; i++) {
      const response = await this.fetch(this.validate(url), { ...options, redirect: 'manual' });
      if (![301,302,303,307,308].includes(response.status)) return response;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('音源跳转地址无效');
      url = new URL(location, url).href;
    }
    throw new Error('音源跳转次数过多');
  }
  async register(result, base) {
    const codec = result.codec?.toLowerCase();
    if (!['flac','mp3'].includes(codec)) return result;
    // Check bytes, not the CDN's unreliable MIME header, before claiming a codec.
    const response = await this.upstream(result.url, { headers: { Range: 'bytes=0-4095' }, signal: AbortSignal.timeout(15000) });
    if (![200,206].includes(response.status)) { await response.body?.cancel(); throw new Error('音源服务器拒绝播放，请重新获取音源'); }
    const reader = response.body.getReader();
    let head = Buffer.alloc(0);
    try { while (head.length < 4) { const r = await reader.read(); if (r.done) break; head = Buffer.concat([head, Buffer.from(r.value)]); } }
    finally { await reader.cancel(); }
    const valid = codec === 'flac' ? head.subarray(0,4).toString() === 'fLaC' : head.subarray(0,3).toString() === 'ID3' || (head[0] === 255 && (head[1] & 224) === 224);
    if (!valid) throw new Error('音源实际内容与请求格式不符，已停止播放');
    const id = randomBytes(24).toString('hex');
    this.entries.set(id, { url: result.url, codec, until: Date.now() + 6 * 3600000 });
    while (this.entries.size > 100) this.entries.delete(this.entries.keys().next().value);
    return { ...result, url: `${base}/audio/${id}.${codec}` };
  }
  async serve(req, res) {
    const match = /^\/audio\/([a-f0-9]{48})\.(flac|mp3)$/.exec(req.url);
    const entry = match && this.entries.get(match[1]);
    if (!entry || entry.codec !== match[2] || entry.until < Date.now()) { res.writeHead(404); res.end(); return; }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const headers = {};
    if (req.headers.range) {
      if (!/^bytes=\d*-\d*$/.test(req.headers.range) || req.headers.range === 'bytes=-') { res.writeHead(416); res.end(); return; }
      headers.Range = req.headers.range;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const disconnect = () => { if (!res.writableFinished) controller.abort(); };
    res.once('close', disconnect);
    try {
      const remote = await this.upstream(entry.url, { method: req.method, headers, signal: controller.signal });
      clearTimeout(timer);
      if (![200,206,416].includes(remote.status)) { await remote.body?.cancel(); res.writeHead(502); res.end(); return; }
      res.statusCode = remote.status;
      res.setHeader('Content-Type', entry.codec === 'flac' ? 'audio/flac' : 'audio/mpeg');
      for (const name of ['content-length','content-range','accept-ranges']) { const value = remote.headers.get(name); if (value) res.setHeader(name, value); }
      if (req.method === 'HEAD' || !remote.body) { res.end(); return; }
      await pipeline(Readable.fromWeb(remote.body), res);
    } catch { if (!res.headersSent) { res.writeHead(502); res.end(); } else res.destroy(); }
    finally { clearTimeout(timer); res.off('close', disconnect); }
  }
}
