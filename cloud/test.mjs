import test from 'node:test';
import assert from 'node:assert/strict';
import { Providers, checkedAudioURL, neteaseTrack, qqTrack } from './providers.mjs';
test('reject arbitrary URLs, credentials and local servers',()=>{
  for(const u of ['file:///C:/secrets','http://localhost/a','http://127.0.0.1/a','https://music.126.net.evil.test/a','https://user:pass@music.126.net/a']) assert.throws(()=>checkedAudioURL(u));
  assert.equal(checkedAudioURL('https://m801.music.126.net/a.flac'),'https://m801.music.126.net/a.flac');
});
test('normalize provider durations and artist metadata',()=>{
  assert.equal(neteaseTrack({id:1,dt:123000,ar:[{name:'A'}]}).duration,123);
  assert.equal(qqTrack({mid:'abc',interval:123,singer:[{name:'A'}]}).artist,'A');
});
test('refuse trial and silent quality downgrade',async()=>{
  const p=Object.create(Providers.prototype);
  p.ne=async()=>({data:[{url:'https://music.126.net/a.flac',freeTrialInfo:{},level:'lossless'}]});
  await assert.rejects(p.netease('resolve',{id:'1',quality:'lossless'}),/试听/);
  p.ne=async()=>({data:[{url:'https://music.126.net/a.mp3',level:'standard'}]});
  await assert.rejects(p.netease('resolve',{id:'1',quality:'lossless'}),/只返回/);
});
