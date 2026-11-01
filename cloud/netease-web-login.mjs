// Official-page flow reference: imsyy/SPlayer electron/main/windows/login-window.ts.
// This uses a fresh isolated context, never an existing user's browser profile.
export function loginCookie(cookies) {
  const allowed = new Set(['MUSIC_U', '__csrf']);
  const selected = cookies.filter(c => allowed.has(c.name) && ['music.163.com','.music.163.com'].includes(c.domain) && c.value && !/[;\r\n]/.test(c.value));
  if (!selected.some(c => c.name === 'MUSIC_U')) return '';
  return selected.map(c => `${c.name}=${c.value}`).join('; ');
}
async function launchBrowser() {
  const { chromium } = await import('playwright');
  try { return await chromium.launch({ channel:'chrome', headless:false }); }
  catch { return chromium.launch({ channel:'msedge', headless:false }); }
}
export class NeteaseWebLogin {
  constructor(launch = launchBrowser) { this.launch = launch; this.current = null; }
  async start() {
    await this.cancel();
    const state = { state:'opening', browser:null, context:null, timer:null, pending:null };
    this.current = state;
    try {
      state.browser = await this.launch();
      if (this.current !== state) { await state.browser.close(); return; }
      state.context = await state.browser.newContext({ viewport:{width:1100,height:780}, acceptDownloads:false });
      const page = await state.context.newPage();
      page.on('close',()=>{ if(state.state==='waiting') { state.state='refused'; void state.browser.close().catch(()=>{}); } });
      state.browser.on('disconnected',()=>{if(['waiting','opening'].includes(state.state))state.state='refused';});
      await page.goto('https://music.163.com/#/login/', { waitUntil:'domcontentloaded', timeout:25000 });
      if (this.current !== state) { await state.browser.close(); return; }
      state.state='waiting';
      state.timer=setTimeout(()=>{if(state.state==='waiting'){state.state='expired';void state.browser.close().catch(()=>{});}},10*60*1000);
      state.timer.unref?.();
    } catch {
      state.state='error'; await state.browser?.close().catch(()=>{});
      throw new Error('网易云网页登录窗口无法打开，请确认 Chrome 或 Edge 可用并能访问网易云官网');
    }
  }
  async poll(accept) {
    const state=this.current;
    if(!state)return {state:'expired'};
    if(state.state==='error')throw new Error('网易云网页登录失败，请关闭窗口后重试');
    if(state.state!=='waiting')return {state:state.state};
    if(!state.pending)state.pending=(async()=>{
      let cookie;
      try { cookie=loginCookie(await state.context.cookies('https://music.163.com/')); }
      catch { if(state.state==='refused')return {state:'refused'};throw new Error('网易云登录窗口已断开，请重新打开'); }
      if(!cookie)return {state:'waiting'};
      if(this.current!==state || state.state!=='waiting')return {state:'expired'};
      await accept(cookie, ()=>this.current===state && state.state==='waiting');
      if(this.current!==state || state.state!=='waiting')return {state:'expired'};
      state.state='done';clearTimeout(state.timer);
      await state.browser.close().catch(()=>{});
      return {state:'done'};
    })().finally(()=>{state.pending=null;});
    return state.pending;
  }
  async cancel() {
    const state=this.current;this.current=null;
    if(state){state.state='refused';clearTimeout(state.timer);await state.browser?.close().catch(()=>{});}
  }
}
