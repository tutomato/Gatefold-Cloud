import { TrackAssets } from './track-assets.mjs';
import { getSettings, saveSettings } from './cache-settings.mjs';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Providers, checkedAudioURL } from './providers.mjs';
import { MusicCache } from './music-cache.mjs';
import { AudioRelay } from './audio-relay.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'private');
await mkdir(dataDir, { recursive: true });
let token;
try { token = (await readFile(path.join(dataDir, 'token'), 'utf8')).trim(); }
catch { token = randomBytes(32).toString('hex'); await writeFile(path.join(dataDir, 'token'), token, { mode: 0o600 }); }
const port = 17863;
await writeFile(path.join(root, '../theme/js/cloud-config.js'), `// Local connector key; do not publish this generated file.\nexport const CLOUD = ${JSON.stringify({ url: `http://127.0.0.1:${port}`, token })};\n`);
const providers = new Providers(dataDir);
const audio = new AudioRelay(checkedAudioURL);
const musicCache = new MusicCache(dataDir, audio);
const trackAssets = new TrackAssets(providers);
// Upstream errors can contain cookies. Never forward dependency logs to the console.
const safeLog = console.log.bind(console);
console.log = () => {}; console.error = () => {};
await providers.restore();
const actions = new Set(['settings', 'saveSettings', 'status', 'login', 'poll', 'cancelLogin', 'logout', 'search', 'playlists', 'playlist', 'resolve']);
export function validateRequest(b) {
  if (!b || !['netease', 'qq'].includes(b.provider) || !actions.has(b.action)) throw new Error('无效操作');
  const p = { ...b.params, page: Math.max(1, Math.min(1000, Math.floor(Number(b.params?.page) || 1))) };
  if (b.action === 'search' && (typeof p.query !== 'string' || !p.query.trim() || p.query.length > 160)) throw new Error('请输入 1–160 字的搜索词');
  if (['resolve', 'playlist'].includes(b.action) && !/^[a-zA-Z0-9]{1,40}$/.test(p.id || '')) throw new Error('歌曲或歌单编号无效');
  if (b.action === 'resolve' && !['lossless', 'hires', '320k'].includes(p.quality)) throw new Error('请选择音质');
  if (b.action === 'login' && p.loginType !== undefined && !['qq', 'wx'].includes(p.loginType)) throw new Error('无效登录方式');
  if (b.action === 'resolve') { p.track = Object.fromEntries(['title','artist','album'].map(k => [k, typeof p.track?.[k] === 'string' ? p.track[k].slice(0,500) : ''])); }
  return p;
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { res.writeHead(403); return res.end(); }
  if (req.url?.startsWith('/audio/')) { await audio.serve(req, res); return; }
  if (req.method === 'GET' && req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ service: 'Gatefold Cloud', version: 1 })); }
  if (req.method !== 'POST' || req.url !== '/api') { res.writeHead(404); return res.end(); }
  const key = String(req.headers['x-gatefold-key'] || '');
  if (Buffer.byteLength(key) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(key), Buffer.from(token))) { res.writeHead(403); return res.end(); }
  if (req.headers.origin && !['http://127.0.0.1:17863', 'http://localhost:17863'].includes(req.headers.origin)) { res.writeHead(403); return res.end(); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8192) throw new Error('请求过大'); }
    const b = JSON.parse(body);
    const p = validateRequest(b);
    let result = b.action === 'settings' ? await getSettings(dataDir) : b.action === 'saveSettings' ? await saveSettings(dataDir,p) : b.action === 'resolve' ? await musicCache.prepare(b.provider, p, () => providers.run(b.provider, b.action, p)) : await providers.run(b.provider, b.action, p);
    if(b.action === 'resolve') result = await trackAssets.ensure(b.provider,p,result);
    res.end(JSON.stringify({ success: true, data: result }));
  } catch (e) {
    // Only our intentional messages are shown. Upstream messages may contain signed URLs.
    const m = String(e?.message || '');
    const safe = /^(请|登录状态|未知|不支持|无效|歌曲或|音源|没有可|平台|请求|该音质|QQ |网易云)/.test(m) && !/https?:|cookie|token/i.test(m);
    res.end(JSON.stringify({ success: false, error: safe ? m : '平台请求失败，请稍后重试；也可能需要重新扫码登录。' }));
  }
});
server.requestTimeout = 45000;
server.on('error', e => { safeLog(e.code === 'EADDRINUSE' ? '本机端口 17863 已被占用，请检查已运行的服务。' : '服务启动失败'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => safeLog(`Gatefold Cloud ready: http://127.0.0.1:${port} (Windows protected sessions)`));
