import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client,Credential,parseQQStatus} from './qq-client.mjs';

test('QQ search uses keyword URL encoding and normalizes search results',async()=>{
  const c=new Client({fetcher:async url=>{
    const u=new URL(url);assert.equal(u.hostname,'c.y.qq.com');assert.equal(u.searchParams.get('w'),'歌名 & 歌手');
    return Response.json({code:0,data:{song:{list:[{songmid:'a',songname:'歌名'}],totalnum:1}}});
  }});
  const result=await c.search.searchByType('歌名 & 歌手',0,30,1);
  assert.equal(result.body.item_song[0].songname,'歌名');assert.equal(result.meta.sum,1);
});
test('saved account exact ID is preserved in cookies and lossless requests',async()=>{
  const exact='1152921504896929624';
  const c=new Client({fetcher:async(url,options)=>{
    const b=JSON.parse(options.body);assert.ok(options.headers.Cookie.includes('uin='+exact));
    assert.equal(b.req_0.param.uin,exact);assert.equal(b.req_0.param.quality,'F000');
    assert.equal(b.req_0.param.filename[0],'F000testtest.flac');
    return Response.json({code:0,req_0:{code:0,data:{sip:['https://stream.qqmusic.qq.com/'],midurlinfo:[{songmid:'test',purl:'F000test.flac'}]}}});
  }});
  c.credential=new Credential({musicid:123,strMusicid:exact,musickey:'local-test-key',loginType:1});
  const r=await c.song.getPlayUrls(['test'],'F000');assert.equal(r.test.url,'https://stream.qqmusic.qq.com/F000test.flac');
});
test('QQ errors exclude upstream details, and cookie injection is rejected',async()=>{
  const c=new Client({fetcher:async()=>Response.json({code:0,req_0:{code:1000,data:{secret:'do-not-expose'}}})});
  await assert.rejects(c.execute({module:'test',method:'test'}),e=>!e.message.includes('do-not-expose')&&e.message.includes('1000'));
  c.credential=new Credential({musicid:1,musickey:'bad\r\nvalue'});
  await assert.rejects(c.execute({module:'test',method:'test'}),/凭证无效/);
});
test('QQ callback parser reads data without evaluating JavaScript',()=>{
  assert.equal(parseQQStatus("ptuiCB('66','0','','0','waiting');").code,66);
  assert.throws(()=>parseQQStatus('arbitrary javascript'));
});
