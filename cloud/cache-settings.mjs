import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
export async function getSettings(dir){let c={};try{c=JSON.parse(await readFile(path.join(dir,'cache-settings.json'),'utf8'));}catch{}return {directory:c.directory||path.join(dir,'audio-cache'),naming:c.naming||'artist-title',quality:c.quality||'lossless'};}
export async function saveSettings(dir,p){
  if(typeof p.directory!=='string'||!path.isAbsolute(p.directory)||p.directory.length>220||/[\r\n]/.test(p.directory))throw new Error('请填写有效的完整保存路径');
  if(!['artist-title','title-artist','artist-title-album'].includes(p.naming)||!['lossless','320k'].includes(p.quality))throw new Error('无效设置');
  const c={directory:path.resolve(p.directory),naming:p.naming,quality:p.quality};
  await mkdir(c.directory,{recursive:true});
  await writeFile(path.join(dir,'cache-settings.json.tmp'),JSON.stringify(c,null,2));await rename(path.join(dir,'cache-settings.json.tmp'),path.join(dir,'cache-settings.json'));return c;
}
export function musicFilename(track,codec,naming='artist-title'){
  const clean=s=>String(s||'').replace(/\s*\/\s*/g,' _ ').replace(/[<>:"\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/g,'');
  const artist=clean(track.artist)||'未知歌手',title=clean(track.title)||'未知歌曲',album=clean(track.album)||'未知专辑';
  let name=naming==='title-artist'?`${title} - ${artist}`:naming==='artist-title-album'?`${artist} - ${title} - ${album}`:`${artist} - ${title}`;
  name=name.slice(0,130).replace(/[. ]+$/g,'');return name+'.'+codec;
}
