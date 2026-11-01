import {test} from 'node:test';
import assert from 'node:assert/strict';
import {embedCover,TrackAssets} from './track-assets.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
test('embedding a FLAC cover preserves audio frames',()=>{const audio=Buffer.concat([Buffer.from('fLaC'),Buffer.from([128,0,0,34]),Buffer.alloc(34),Buffer.from('frames')]);const result=embedCover(audio,Buffer.from('image'),'image/jpeg','flac');assert.equal(result.subarray(-6).toString(),'frames');assert.ok(result.includes(Buffer.from('image/jpeg')));});
test('same-source lyrics saved locally and repeat play makes no request',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'gf-assets-'));try{const file=path.join(dir,'song.flac');await writeFile(file,'unused');let calls=0;const a=new TrackAssets({});a.details=async(provider,id)=>{calls++;assert.equal(provider,'qq');assert.equal(id,'123');return{lyrics:'[00:01.00]测试歌词'};};const r={url:file,codec:'flac'};await a.ensure('qq',{id:'123',quality:'lossless'},r);assert.equal(await readFile(path.join(dir,'song.lrc'),'utf8'),'[00:01.00]测试歌词');await a.ensure('qq',{id:'123',quality:'lossless'},r);assert.equal(calls,1);}finally{if(path.dirname(dir)!==os.tmpdir())throw new Error('Unexpected test directory');await rm(dir,{recursive:true,force:true});}});
