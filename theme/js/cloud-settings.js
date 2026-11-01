import { api } from './cloud.js?v=10';
export function mount(host){
  host.innerHTML='<form style="display:grid;gap:14px;padding:18px"><label>音乐保存路径<input name="directory" style="display:block;width:100%;margin-top:8px" required placeholder="D:\\Music\\Gatefold"></label><label>文件命名 <select name="naming"><option value="artist-title">歌手 - 歌名</option><option value="title-artist">歌名 - 歌手</option><option value="artist-title-album">歌手 - 歌名 - 专辑</option></select></label><label>默认在线音质 <select name="quality"><option value="lossless">无损</option><option value="320k">320k</option></select></label><p class="sub">更改路径和命名只影响后续下载，不移动已有文件。重名时追加来源编号，避免覆盖。登录凭证自动加密保存。</p><button class="btn primary" type="submit" disabled>保存在线音乐设置</button><span role="status">正在读取设置…</span></form>';
  const form=host.querySelector('form'),status=host.querySelector('[role="status"]'),button=form.querySelector('button');
  api('settings').then(c=>{for(const k of ['directory','naming','quality'])form.elements[k].value=c[k];button.disabled=false;status.textContent='';}).catch(e=>status.textContent=e.message);
  form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{const p=Object.fromEntries(new FormData(form));await api('saveSettings',p);status.textContent='已保存，下次搜索和下载生效。';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
}
