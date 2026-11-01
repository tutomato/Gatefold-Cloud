import { getSettings, musicFilename } from './cache-settings.mjs';
import { readFile, writeFile, mkdir, rename, stat, unlink, link } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function tagAudio(bytes, codec, track) {
  const fields = {TITLE:track.title,ARTIST:track.artist,ALBUM:track.album};
  if(codec==='flac') {
    if(bytes.subarray(0,4).toString()!=='fLaC')throw new Error('音源不是有效 FLAC');
    let pos=4,last=false; const blocks=[];
    while(!last){if(pos+4>bytes.length)throw new Error('音源 FLAC 数据不完整');const header=bytes[pos];last=!!(header&128);const type=header&127;const size=bytes.readUIntBE(pos+1,3);if(pos+4+size>bytes.length)throw new Error('音源 FLAC 数据不完整');if(type!==4)blocks.push({type,data:bytes.subarray(pos+4,pos+4+size)});pos+=4+size;}
    const le=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
    const vendor=Buffer.from('Gatefold Cloud');const values=Object.entries(fields).filter(([,v])=>v).map(([k,v])=>Buffer.from(k+'='+v));
    blocks.push({type:4,data:Buffer.concat([le(vendor.length),vendor,le(values.length),...values.flatMap(b=>[le(b.length),b])])});
    return Buffer.concat([Buffer.from('fLaC'),...blocks.flatMap((b,i)=>{const h=Buffer.alloc(4);h[0]=b.type|(i===blocks.length-1?128:0);h.writeUIntBE(b.data.length,1,3);return [h,b.data];}),bytes.subarray(pos)]);
  }
  if(codec!=='mp3')throw new Error('音源格式暂不支持本地保存');
  if(bytes.subarray(0,3).toString()!=='ID3' && !(bytes[0]===255 && (bytes[1]&224)===224))throw new Error('音源不是有效 MP3');
  let start=0;if(bytes.subarray(0,3).toString()==='ID3'){start=10+((bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9]);if(bytes[5]&16)start+=10;}
  const frames=Object.entries({TIT2:track.title,TPE1:track.artist,TALB:track.album}).filter(([,v])=>v).map(([k,v])=>{const data=Buffer.concat([Buffer.from([1,255,254]),Buffer.from(v,'utf16le')]);const h=Buffer.alloc(10);h.write(k);h.writeUInt32BE(data.length,4);return Buffer.concat([h,data]);});
  const payload=Buffer.concat(frames);const header=Buffer.from([73,68,51,3,0,0,(payload.length>>21)&127,(payload.length>>14)&127,(payload.length>>7)&127,payload.length&127]);return Buffer.concat([header,payload,bytes.subarray(start)]);
}
export class MusicCache {
  constructor(privateDir, relay){this.privateDir=privateDir;this.relay=relay;this.pending=new Map();}
  async root(){try{const c=JSON.parse(await readFile(path.join(this.privateDir,'cache-settings.json'),'utf8'));if(path.isAbsolute(c.directory))return c.directory;}catch{}return path.join(this.privateDir,'audio-cache');}
  key(provider,id,quality){if(!/^(qq|netease)$/.test(provider)||!/^[a-zA-Z0-9]{1,40}$/.test(id)||!['lossless','hires','320k'].includes(quality))throw new Error('无效缓存编号');return `${provider}-${id}-${quality}`;}
  async get(provider,id,quality){const root=await this.root(),key=this.key(provider,id,quality);try{const item=JSON.parse(await readFile(path.join(root,key+'.json'),'utf8'));if(!['flac','mp3'].includes(item.codec))return null;const filename=item.filename||key+'.'+item.codec;if(path.basename(filename)!==filename)return null;const file=path.join(root,filename);if((await stat(file)).size!==item.size)return null;return {...item,url:file,local:true};}catch{return null;}}
  async prepare(provider,p,resolve){const key=this.key(provider,p.id,p.quality);if(this.pending.has(key))return this.pending.get(key);const task=this.download(provider,p,resolve).finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;}
  async download(provider,p,resolve){const hit=await this.get(provider,p.id,p.quality);if(hit)return hit;const r=await resolve();if(!['flac','mp3'].includes(r.codec))throw new Error('音源格式暂不支持本地保存');const response=await this.relay.upstream(r.url,{signal:AbortSignal.timeout(120000)});if(response.status!==200)throw new Error('音源下载失败，请重试');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>512*1024*1024){throw new Error('音源文件超过缓存大小限制');}chunks.push(Buffer.from(chunk));}const expected=Number(response.headers.get('content-length'));if(expected && size!==expected)throw new Error('音源文件未下载完整');const bytes=tagAudio(Buffer.concat(chunks),r.codec,p.track||{});const root=await this.root();await mkdir(root,{recursive:true});const key=this.key(provider,p.id,p.quality),settings=await getSettings(this.privateDir);let filename=musicFilename(p.track||{},r.codec,settings.naming),file=path.join(root,filename);const temp=path.join(root,key+'.'+randomBytes(6).toString('hex')+'.part');try{await writeFile(temp,bytes);try{await link(temp,file);}catch(e){if(e.code!=='EEXIST')throw e;filename=filename.slice(0,-r.codec.length-1)+' ['+key+'-'+randomBytes(3).toString('hex')+'].'+r.codec;file=path.join(root,filename);await link(temp,file);}}finally{await unlink(temp).catch(()=>{});}const item={filename,codec:r.codec,quality:r.quality,size:bytes.length,track:p.track||{}};await writeFile(path.join(root,key+'.json'),JSON.stringify(item));return {...item,url:file,local:false};}
}
