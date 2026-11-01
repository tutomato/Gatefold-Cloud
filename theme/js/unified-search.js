import { call, ok, esc, fmtTime } from './bridge.js';
import { router, $, backButton } from './ui.js';
import { api, play } from './cloud.js?v=10';
import { rankResults } from './search-rank.js';
let revision=0;
const names={local:'本地音乐',netease:'网易云',qq:'QQ 音乐'};
export async function open(text) {
  const q=String(text||'').trim().slice(0,160);if(!q)return;
  const token=++revision;
  router.go('search');
  $('searchInput').value=q;
  $('searchBack').replaceChildren(backButton('library'));
  $('searchTitle').textContent=q;
  $('searchSub').textContent='正在搜索本地、网易云和 QQ 音乐…';
  const body=$('searchBody');body.replaceChildren();
  const query=q.replace(/"/g,' ').split(/\s+/).filter(Boolean).slice(0,8).map(w=>`(%title% HAS "${w}" OR %artist% HAS "${w}" OR %album% HAS "${w}")`).join(' AND ');
  const results=await Promise.allSettled([
    call('library.search',{query,limit:100,fields:['title','artist','album','duration','absolutePath']}).then(r=>{if(!ok(r))throw new Error();return (r.tracks||[]).map(t=>({...t,source:'local'}));}),
    ...['netease','qq'].map(source=>api('search',{query:q,page:1},source).then(r=>r.tracks.map(t=>({...t,source}))))
  ]);
  if(token!==revision)return;
  const tracks=rankResults(q,results.flatMap(r=>r.status==='fulfilled'?r.value:[]));
  const failed=results.map((r,i)=>r.status==='rejected'?['本地','网易云','QQ 音乐'][i]:null).filter(Boolean);
  $('searchSub').textContent=`${tracks.length} 条综合结果 · 按关联度排序`+(failed.length?' · 暂不可用：'+failed.join('、'):'');
  const controls=document.createElement('div');controls.style.cssText='padding:12px 30px;display:flex;gap:14px;align-items:center';
  controls.innerHTML='<span>在线音质</span><select aria-label="综合搜索音质"><option value="lossless">无损</option><option value="320k">320k</option></select><span role="status" class="sub"></span>';
  api('settings').then(c=>{if(token===revision)quality.value=c.quality||'lossless';}).catch(()=>{});
  body.append(controls);const report=controls.querySelector('[role="status"]'),quality=controls.querySelector('select');
  const head=document.createElement('div');head.style.cssText='display:grid;grid-template-columns:32px minmax(160px,2fr) minmax(100px,1fr) minmax(140px,1.5fr) 85px 60px 62px;gap:14px;padding:12px 30px;opacity:.65';head.innerHTML='<span>#</span><span>歌曲</span><span>歌手</span><span>专辑</span><span>来源</span><span>时长</span><span>操作</span>';body.append(head);
  let index=0;
  for(const t of tracks){
    const row=document.createElement('div');row.className='unified-search-row';row.style.cssText='display:grid;grid-template-columns:32px minmax(160px,2fr) minmax(100px,1fr) minmax(140px,1.5fr) 85px 60px 62px;align-items:center;gap:14px;padding:14px 30px;border-bottom:1px solid rgba(128,128,128,.15)';
    row.innerHTML=`<span class="sub">${++index}</span><strong style="overflow:hidden;text-overflow:ellipsis" title="${esc(t.title)}">${esc(t.title)}</strong><span class="sub" title="${esc(t.artist)}">${esc(t.artist)||'未知歌手'}</span><span class="sub" title="${esc(t.album)}">${esc(t.album)||'未知专辑'}</span><span class="source-tag" style="font-size:12px;border:1px solid currentColor;border-radius:12px;padding:3px 10px">${names[t.source]}</span><span>${fmtTime(t.duration)}</span><button class="btn sm">播放</button>`;
    const start=()=>play(t,{quality:quality.value,report:text=>{report.textContent=text;}});
    row.querySelector('button').onclick=start;
    row.ondblclick=e=>{if(!e.target.closest('button'))start();};
    body.append(row);
  }
  if(!tracks.length){const empty=document.createElement('p');empty.textContent='没有找到匹配的歌曲';empty.style.padding='30px';body.append(empty);}
}
