import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const types = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.woff2':'font/woff2', '.jpg':'image/jpeg' };
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  let name = decodeURIComponent(url.pathname);
  if (name.startsWith('/covers/')) name = '/tests/fixtures' + name;
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
try {
  const page = await browser.newPage({ viewport:{width:1360,height:900} });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const fixtures = ['mock-bridge','mock-extras','mock-updates','mock-prefs','mock-welcome','mock-edit','mock-win','mock-more','mock-ml','mock-level','mock-editions'];
  let mock = '';
  for (const f of fixtures) mock += await fs.readFile(path.join(root,'tests/fixtures',f+'.js'),'utf8');
  await page.addInitScript(`localStorage.setItem('gatefold.soundOffer','tests'); localStorage.setItem('aurora.settings.v1',JSON.stringify({language:'zh',coverSweep:false,coverAuto:false,artistAuto:false,updateCheck:false}));` + mock + `
    const baseCloudInvoke=window.fb2k.invoke;
    window.cloudCalls=[];
    window.fb2k.invoke=async (method,p={})=>{
      window.cloudCalls.push({method,p});
      if(method==='http.post' && p.url.includes('127.0.0.1:17863')) {
        const b=JSON.parse(p.body); let data={};
        if(b.action==='settings') data={directory:'D:\\Music\\Gatefold',naming:'artist-title',quality:'lossless'};
        if(b.action==='saveSettings') data=b.params;
        if(b.action==='status') data={loggedIn:false};
        if(b.action==='search') data={tracks:[{id:'123',title:'测试歌曲 <script>不可执行</script>',artist:b.provider==='qq'?'QQ 艺人':'网易云艺人',album:'测试专辑',duration:245}]};
        if(b.action==='login') data={image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',message:'请扫码'};
        if(b.action==='login' && b.provider==='netease') data={browser:true,message:'请在网易云官网完成登录'};
        if(b.action==='poll') data={state:'waiting'};
        if(b.action==='resolve') {
          if(window.cloudFail) return {success:true,status:200,body:JSON.stringify({success:false,error:'平台仅返回试听音源，未当作完整歌曲播放'})};
          data={url:'https://music.126.net/test.flac',quality:'lossless',codec:'flac'};
        }
        return {success:true,status:200,body:JSON.stringify({success:true,data})};
      }
      if(method==='playlist.addPathsSequential') return {success:true,addedCount:1,order:[5]};
      if(method==='playlist.playTrack') return {success:true};
      return baseCloudInvoke(method,p);
    };`);
  await page.goto(`http://127.0.0.1:${server.address().port}/theme/index.html`);
  await page.locator('.nav-item[data-view="cloud"]').click();
  await page.locator('#cloudSignIn').click();
  await page.locator('#cloudLogin').waitFor({state:'visible'});
  assert.equal(await page.locator('#cloudQr').isVisible(),false);
  assert.equal(await page.locator('#cloudLoginTitle').textContent(),'在网易云官网完成登录');
  await page.locator('#cloudCancel').click();
  await page.locator('#cloudQuery').fill('测试');
  await page.locator('#cloudSearch button[type="button"]').count();
  await page.locator('#cloudSearch button.primary').click();
  await page.waitForTimeout(800);
  await page.screenshot({path:path.join(root,'cloud-preview.png')});
  await page.waitForFunction(()=>document.querySelector('#searchBody').textContent.includes('网易云艺人'));
  assert.equal(await page.locator('#searchBody script').count(),0,'remote song text is escaped');
  await page.locator('#searchBody .unified-search-row button').first().click();
  await page.waitForFunction(()=>document.querySelector('#searchBody [role="status"]').textContent.includes('播放请求已提交给 foobar2000'));
  assert.equal(await page.evaluate(()=>window.cloudCalls.find(x=>x.method==='playlist.playTrack').p.index),5);
  assert.equal(await page.evaluate(()=>window.cloudCalls.filter(x=>x.method==='playlist.clear').length),0,'existing playlists remain intact');
  await page.evaluate(()=>window.cloudFail=true);
  const n=await page.evaluate(()=>window.cloudCalls.filter(x=>x.method==='playlist.playTrack').length);
  await page.locator('#searchBody .unified-search-row button').first().click();
  await page.waitForFunction(()=>document.querySelector('#searchBody [role="status"]').textContent.includes('试听'));
  assert.equal(await page.evaluate(()=>window.cloudCalls.filter(x=>x.method==='playlist.playTrack').length),n,'trial must not start playback');
  await page.locator('#searchInput').fill('测试');
  await page.locator('#searchInput').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#searchBody').textContent.includes('QQ 艺人'));
  assert.equal(await page.locator('#view-search').evaluate(el=>el.classList.contains('active')),true);
  assert.equal(await page.locator('#view-cloud').evaluate(el=>el.classList.contains('active')),false);
  assert.equal(await page.locator('#searchBody .source-tag').count() >= 2,true);
  await page.locator('.nav-item[data-view="cloud"]').click();
  await page.locator('[data-source="qq"]').click();
  await page.locator('#cloudWechat').click();
  await page.locator('#cloudLogin').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.parse(window.cloudCalls.filter(x=>x.method==='http.post' && JSON.parse(x.p.body).action==='login').at(-1).p.body).params.loginType),'wx');
  await page.locator('#cloudCancel').click();
  assert.equal(await page.locator('#cloudLogin').isVisible(),false);
  await page.screenshot({path:path.join(root,'cloud-preview.png')});
  await page.locator('.nav-item[data-view="settings"]').click();
  await page.locator('#st-cloud-options input[name="directory"]').waitFor();
  await page.locator('#st-cloud-options button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#st-cloud-options [role="status"]').textContent.includes('已保存'));
  assert.deepEqual(errors,[]);
  console.log('PASS: Gatefold rendering, both providers, escaped song titles, exact native row playback, trial rejection, QR lifecycle; no page errors.');
} finally { await browser.close(); server.close(); }

