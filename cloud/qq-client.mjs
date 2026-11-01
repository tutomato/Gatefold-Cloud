// Copyright (c) 2026 tutomato. MIT License.
// Small QQ Music protocol client. No third-party SDK implementation is bundled.
import {randomBytes,randomUUID} from 'node:crypto';
const fields={refresh_token:'refreshToken',access_token:'accessToken',expired_at:'expiredAt',str_musicid:'strMusicid',refresh_key:'refreshKey',login_type:'loginType',musickey_create_time:'musickeyCreateTime',key_expires_in:'keyExpiresIn'};
export class Credential{
 constructor(data={}){for(const [k,v] of Object.entries(data))this[fields[k]||k]=v;this.musicid??=0;this.musickey??='';this.strMusicid||=String(this.musicid||'');this.loginType??=this.musickey.startsWith('W_X')?1:2;}
 static fromDict(data){return new Credential(data);}
 isLoggedIn(){return !!this.musicid&&!!this.musickey;}
 toJSON(){return {...this};}
}
export class Request{constructor(options){Object.assign(this,options);}}
export function qqHash(value,start=0){let n=start;for(const c of value)n=(n*33+c.charCodeAt(0))>>>0;return n&0x7fffffff;}
export function parseQQStatus(text){const m=/ptuiCB\(([^]*?)\)/.exec(text);if(!m)throw new Error('QQ 二维码状态格式变化');const values=[...m[1].matchAll(/'((?:\\.|[^'\\])*)'/g)].map(x=>x[1]);if(!/^\d+$/.test(values[0]))throw new Error('QQ 二维码状态无效');return{code:Number(values[0]),redirect:values[2]||''};}
const validCookie=s=>typeof s==='string'&&!/[\r\n;]/.test(s);
export class Client{
 constructor({fetcher=fetch}={}){this.fetch=fetcher;this.credential=new Credential();this.guid=String(randomBytes(4).readUInt32BE());this.search={searchByType:(query,type=0,num=30,page=1)=>this.searchSongs(query,num,page)};this.song={getDetail:async ids=>{const d=await this.execute({module:'music.pf_song_detail_svr',method:'get_song_detail_yqq',param:{song_mid:ids[0]}});return {tracks:d.track_info?[d.track_info]:[]};},getPlayUrls:(ids,quality)=>this.playUrls(ids,quality)};this.user={getUserSonglist:(uin,page=1,num=30)=>this.execute({module:'music.musicasset.PlaylistBaseRead',method:'GetPlaylistByUin',param:{uin:String(uin)}})};this.login={getQrcode:()=>this.qr(),checkQrcode:q=>this.poll(q)};}
 async http(url,{method='GET',body,headers={},cookies={}}={}){
  const cookie=Object.entries(cookies).filter(([,v])=>validCookie(v)).map(([k,v])=>k+'='+v).join('; ');
  const r=await this.fetch(url,{method,body,headers:{'User-Agent':'GatefoldCloud/1.0',...headers,...(cookie?{Cookie:cookie}:{})},redirect:'manual',signal:AbortSignal.timeout(25000)});
  const saved={};for(const line of r.headers.getSetCookie?.()||[]){const part=line.split(';')[0],i=part.indexOf('=');if(i>0&&part.slice(i+1))saved[part.slice(0,i)]=part.slice(i+1);}
  return{response:r,cookies:saved};
 }
 async execute(request){
  const c=request.credential||this.credential;
  if(!validCookie(c.musickey)||!validCookie(c.strMusicid))throw new Error('QQ 登录凭证无效，请重新登录');
  const comm={ct:11,cv:14090008,v:14090008,qq:String(c.musicid||0),authst:c.musickey,tmeAppID:'qqmusic',tmeLoginType:c.isLoggedIn()?c.loginType:0,...request.comm};
  const payload={comm,req_0:{module:request.module,method:request.method,param:request.param||{}}};
  const {response}=await this.http('https://u.y.qq.com/cgi-bin/musicu.fcg',{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://y.qq.com/'},body:JSON.stringify(payload),cookies:c.isLoggedIn()?{uin:c.strMusicid,qqmusic_uin:c.strMusicid,qm_keyst:c.musickey,qqmusic_key:c.musickey}:{}});
  if(!response.ok)throw new Error('QQ 音乐服务暂不可用');const r=await response.json(),item=r.req_0;if(r.code!==0||!item||item.code!==0)throw new Error(`QQ 接口返回 ${item?.code??r.code??'未知错误'}，请检查登录和账号权限`);return item.data;
 }
 async searchSongs(query,num,page){
  const params=new URLSearchParams({w:query,format:'json',p:String(page),n:String(num),t:'0',aggr:'1',cr:'1'});
  const {response}=await this.http('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?'+params,{headers:{Referer:'https://y.qq.com/'}});if(!response.ok)throw new Error('QQ 搜索暂不可用');const r=await response.json();if(r.code!==0)throw new Error('QQ 搜索返回错误');return {body:{item_song:r.data?.song?.list||[]},meta:{sum:r.data?.song?.totalnum||0}};
 }
 async playUrls(ids,quality){
  if(!['F000','M800'].includes(quality))throw new Error('QQ 不支持此音质');
  const ext=quality==='F000'?'flac':'mp3';
  const param={guid:this.guid,songmid:ids,songtype:ids.map(()=>0),filename:ids.map(m=>quality+m+m+'.'+ext),uin:this.credential.strMusicid,loginflag:1,platform:'23',h5queryversion:1,nettype:'',jsonpCallback:'jsonp1',cms:0,firstlogin:1,newver:1,nohash:0,format:'json',inCharset:'utf-8',outCharset:'utf-8',notice:0,needNewCode:0,songmid_pre:'',soundname:'',bitrate:0,quality};
  const r=await this.execute({module:'music.vkey.GetVkey',method:'UrlGetVkey',param});return Object.fromEntries((r.midurlinfo||[]).map(x=>[x.songmid,{url:x.purl?new URL(x.purl,r.sip?.[0]||'https://dl.stream.qqmusic.qq.com/').href:'',size:0}]));
 }
 async qr(){
  const params=new URLSearchParams({appid:'716027609',daid:'383',pt_3rd_aid:'100497308',e:'2',l:'M',s:'3',d:'72',v:'4',t:String(Math.random())});
  const {response,cookies}=await this.http('https://ssl.ptlogin2.qq.com/ptqrshow?'+params);
  if(!response.ok||!cookies.qrsig)throw new Error('QQ 二维码获取失败');const data=Buffer.from(await response.arrayBuffer());if(data.length>1024*1024)throw new Error('QQ 二维码无效');return{data,mime:'image/png',identifier:cookies.qrsig};
 }
 async poll(q){
  if(!validCookie(q.identifier))throw new Error('QQ 二维码标识无效');
  const params=new URLSearchParams({u1:'https://graph.qq.com/oauth2.0/login_jump',ptqrtoken:String(qqHash(q.identifier)),ptredirect:'0',h:'1',t:'1',g:'1',from_ui:'1',ptlang:'2052',action:'0-0-'+Date.now(),js_ver:'20102616',js_type:'1',pt_uistyle:'40',aid:'716027609',daid:'383',pt_3rd_aid:'100497308',has_onekey:'1'});
  const {response}=await this.http('https://ssl.ptlogin2.qq.com/ptqrlogin?'+params,{cookies:{qrsig:q.identifier}});const status=parseQQStatus(await response.text());
  if(status.code!==0){const event={66:1,67:2,65:4,68:3}[status.code];if(event===undefined)throw new Error('QQ 登录需要进一步验证，请使用官方客户端完成验证');return{event};}
  const redirect=new URL(status.redirect);if(redirect.protocol!=='https:'||!redirect.hostname.endsWith('.qq.com'))throw new Error('QQ 授权地址无效');
  const uin=redirect.searchParams.get('uin'),sig=redirect.searchParams.get('ptsigx');if(!/^\d+$/.test(uin||'')||!sig)throw new Error('QQ 授权参数缺失');
  const check=new URLSearchParams({uin,pttype:'1',service:'ptqrlogin',nodirect:'0',ptsigx:sig,s_url:'https://graph.qq.com/oauth2.0/login_jump',ptlang:'2052',ptredirect:'100',aid:'716027609',daid:'383',pt_login_type:'3',pt_3rd_aid:'100497308'});
  const {cookies}=await this.http('https://ssl.ptlogin2.graph.qq.com/check_sig?'+check);if(!cookies.p_skey)throw new Error('QQ 授权凭证未返回，请重新扫码');
  const form=new URLSearchParams({response_type:'code',client_id:'100497308',redirect_uri:'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/',scope:'get_user_info,get_app_friends',state:'state',from_ptlogin:'1',src:'1',update_auth:'1',openapi:'1010_1030',g_tk:String(qqHash(cookies.p_skey,5381)),auth_time:String(Date.now()),ui:randomUUID()});
  const auth=await this.http('https://graph.qq.com/oauth2.0/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:'https://xui.ptlogin2.qq.com/'},body:form.toString(),cookies});
  const location=auth.response.headers.get('location');if(!location)throw new Error('QQ 授权未完成');const target=new URL(location);if(target.origin!=='https://y.qq.com')throw new Error('QQ 授权返回地址无效');const code=target.searchParams.get('code');if(!code)throw new Error('QQ 授权码缺失');
  const data=await this.execute({module:'QQConnectLogin.LoginServer',method:'QQLogin',param:{code},credential:new Credential(),comm:{tmeLoginType:2}});const credential=Credential.fromDict({...data,login_type:2});if(!credential.isLoggedIn())throw new Error('QQ 授权未取得有效音乐账号');return{event:0,credential};
 }
}
