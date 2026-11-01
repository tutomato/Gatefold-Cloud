import {test} from 'node:test';
import assert from 'node:assert/strict';
import {musicFilename,saveSettings} from './cache-settings.mjs';
test('names match local artist - title convention and sanitize Windows characters',()=>{assert.equal(musicFilename({artist:'派伟俊 / 周杰伦',title:'Try'},'flac'),'派伟俊 _ 周杰伦 - Try.flac');assert.equal(musicFilename({artist:'歌手',title:'A:B?*'},'flac'),'歌手 - A_B__.flac');assert.equal(musicFilename({artist:'A',title:'T',album:'B'},'flac','artist-title-album'),'A - T - B.flac');});
test('reject relative paths and invalid settings before filesystem writes',async()=>{await assert.rejects(saveSettings('unused',{directory:'relative',naming:'artist-title',quality:'lossless'}));await assert.rejects(saveSettings('unused',{directory:'D:\\Music',naming:'../bad',quality:'lossless'}));});
