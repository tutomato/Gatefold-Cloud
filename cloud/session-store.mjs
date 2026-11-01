import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const helper = fileURLToPath(new URL('./protect-session.ps1', import.meta.url));
function protect(operation, input) {
  return new Promise((resolve,reject) => {
    const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,operation], {windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output = '';
    const timer = setTimeout(()=>child.kill(),15000);
    child.stdout.on('data',x=>{output+=x;}); child.stderr.resume();
    child.on('error',()=>{clearTimeout(timer);reject(new Error('登录状态加密服务不可用'));});
    child.on('close',code=>{clearTimeout(timer);code===0 ? resolve(Buffer.from(output.trim(),'base64')) : reject(new Error('登录状态加密或解密失败'));});
    child.stdin.on('error',()=>{});
    child.stdin.end(input.toString('base64'));
  });
}
export class SessionStore {
  constructor(dir) { this.dir = dir; this.pending = new Map(); }
  file(provider) { if (!['qq','netease'].includes(provider)) throw new Error('Invalid provider'); return path.join(this.dir,provider+'.session.dpapi'); }
  async load(provider) {
    let bytes;
    try { bytes = await readFile(this.file(provider)); } catch(e) { if(e.code==='ENOENT')return null;throw e; }
    return JSON.parse((await protect('unprotect',bytes)).toString('utf8'));
  }
  save(provider, value) {
    const file=this.file(provider);
    const operation=(this.pending.get(provider)||Promise.resolve()).catch(()=>{}).then(async()=>{
      if (value === null) { await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});return; }
      await mkdir(this.dir,{recursive:true});
      const encrypted=await protect('protect',Buffer.from(JSON.stringify(value)));
      await writeFile(file+'.tmp',encrypted);
      await rename(file+'.tmp',file);
    });
    this.pending.set(provider,operation);return operation;
  }
}
