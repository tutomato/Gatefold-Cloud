import {readFile,writeFile,stat,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
const be=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
export function embedCover(audio,image,mime,codec){
  if(codec==='flac'){
    if(audio.subarray(0,4).toString()!=='fLaC')throw new Error('Invalid FLAC');
    let pos=4,last=false;const blocks=[];
    while(!last){if(pos+4>audio.length)throw new Error('Incomplete FLAC');const type=audio[pos]&127;last=!!(audio[pos]&128);const len=audio.readUIntBE(pos+1,3);if(pos+4+len>audio.length)throw new Error('Incomplete FLAC');if(type!==6)blocks.push({type,data:audio.subarray(pos+4,pos+4+len)});pos+=4+len;}
    const m=Buffer.from(mime);blocks.push({type:6,data:Buffer.concat([be(3),be(m.length),m,be(0),be(0),be(0),be(0),be(0),be(image.length),image])});
    return Buffer.concat([Buffer.from('fLaC'),...blocks.flatMap((b,i)=>{const h=Buffer.alloc(4);h[0]=b.type|(i===blocks.length-1?128:0);h.writeUIntBE(b.data.length,1,3);return[h,b.data];}),audio.subarray(pos)]);
  }
  // Our downloaded MP3s have a fresh ID3v2.3 header from tagAudio.
  if(codec!=='mp3'||audio.subarray(0,3).toString()!=='ID3'||audio[3]!==3)throw new Error('Unsupported ID3');
  const oldSize=(audio[6]<<21)|(audio[7]<<14)|(audio[8]<<7)|audio[9];
  const data=Buffer.concat([Buffer.from([0]),Buffer.from(mime+'\0'),Buffer.from([3,0]),image]);const frame=Buffer.concat([Buffer.from('APIC'),be(data.length),Buffer.alloc(2),data]);
  const size=oldSize+frame.length,head=Buffer.from(audio.subarray(0,10));for(let i=0;i<4;i++)head[6+i]=(size>>((3-i)*7))&127;
  return Buffer.concat([head,audio.subarray(10,10+oldSize),frame,audio.subarray(10+oldSize)]);
}
async function fetchData(url, image=false){
  const u=new URL(url);if(u.protocol!=='https:'||!['music.163.com','music.126.net','y.qq.com','gtimg.cn'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw new Error('Invalid asset host');
  const r=await fetch(u,{headers:{Referer:'https://y.qq.com/'},signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw new Error('Asset unavailable');
  if(!image)return r.json();const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>10*1024*1024)throw new Error('Cover too large');chunks.push(Buffer.from(c));}const bytes=Buffer.concat(chunks);const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':'';if(!mime)throw new Error('Invalid image');return{bytes,mime};
}
export class TrackAssets {
  constructor(providers){this.providers=providers;this.pending=new Map();}
  async details(provider,id){
    if(provider==='netease'){
      const [song,lyric]=await Promise.allSettled([this.providers.ne('song_detail',{ids:id}),this.providers.ne('lyric',{id})]);
      return{cover:song.value?.songs?.[0]?.al?.picUrl||'',lyrics:lyric.value?.lrc?.lyric||''};
    }
    const [song,lyric]=await Promise.allSettled([this.providers.qq.song.getDetail([id]),fetchData('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?'+new URLSearchParams({songmid:id,format:'json',g_tk:'5381',platform:'yqq.json',nobase64:'1'}))]);
    const mid=song.value?.tracks?.[0]?.album?.mid;let text=lyric.value?.lyric||'';
    if(text&&/^[A-Za-z0-9+/=\s]+$/.test(text))text=Buffer.from(text,'base64').toString('utf8');
    text=text.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
    return{cover:mid&&/^[a-zA-Z0-9]+$/.test(mid)?`https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg`:'',lyrics:text};
  }
  async ensure(provider,p,result){
    if(this.pending.has(result.url))return this.pending.get(result.url);
    const task=this.save(provider,p,result).catch(()=>result).finally(()=>this.pending.delete(result.url));this.pending.set(result.url,task);return task;
  }
  async save(provider,p,result){
    const base=result.url.slice(0,-path.extname(result.url).length),manifest=base+'.assets.json';let old={};try{old=JSON.parse(await readFile(manifest,'utf8'));}catch{}
    const exists=async file=>!!(await stat(file).catch(()=>null));
    const lyricsExists=await exists(base+'.lrc')||await exists(base+'.txt');
    const coverExists=await exists(base+'.jpg')||await exists(base+'.png');
    if((lyricsExists&&coverExists&&old.embedded)||Date.now()-(old.checked||0)<86400000)return result;
    const data=await this.details(provider,p.id);let embedded=old.embedded||false;
    if(!lyricsExists&&data.lyrics&&data.lyrics.length<1024*1024){const ext=/\[\d+:\d+/.test(data.lyrics)?'.lrc':'.txt';await writeFile(base+ext,data.lyrics,{flag:'wx'}).catch(()=>{});}
    if(!embedded){
      try{let image;if(coverExists){const ext=await exists(base+'.jpg')?'.jpg':'.png';image={bytes:await readFile(base+ext),mime:ext==='.jpg'?'image/jpeg':'image/png'};}else if(data.cover){const u=new URL(data.cover);u.protocol='https:';image=await fetchData(u.href,true);await writeFile(base+(image.mime==='image/jpeg'?'.jpg':'.png'),image.bytes,{flag:'wx'}).catch(()=>{});}
        if(image){const bytes=embedCover(await readFile(result.url),image.bytes,image.mime,result.codec);const temp=result.url+'.art.tmp';try{await writeFile(temp,bytes);await rename(temp,result.url);}finally{await unlink(temp).catch(()=>{});}const index=path.join(path.dirname(result.url),`${provider}-${p.id}-${p.quality}.json`);const item=JSON.parse(await readFile(index,'utf8'));item.size=bytes.length;await writeFile(index,JSON.stringify(item));result.size=bytes.length;embedded=true;}
      }catch{}
    }
    await writeFile(manifest,JSON.stringify({provider,id:p.id,checked:Date.now(),embedded}));return result;
  }
}
