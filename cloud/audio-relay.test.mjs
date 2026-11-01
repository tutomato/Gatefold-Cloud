import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AudioRelay } from './audio-relay.mjs';

test('relay corrects MIME while preserving FLAC bytes and byte ranges', async () => {
  const bytes = Buffer.from('fLaC0123456789abcdef');
  const ranges = [];
  const relay = new AudioRelay(u => { assert.equal(new URL(u).hostname, 'example.test'); return u; }, async (url, options) => {
    const range = options.headers.Range; ranges.push(range);
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(range);
    const data = bytes.subarray(Number(start), Math.min(Number(end)+1,bytes.length));
    return new Response(data, {status:206,headers:{'content-type':'audio/x-ogg','content-length':String(data.length),'content-range':`bytes ${start}-${Number(start)+data.length-1}/${bytes.length}`}});
  });
  const server = http.createServer((req,res) => relay.serve(req,res));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const result = await relay.register({url:'https://example.test/song',codec:'flac'},base);
    const response = await fetch(result.url,{headers:{Range:'bytes=4-9'}});
    assert.equal(response.status,206);
    assert.equal(response.headers.get('content-type'),'audio/flac');
    assert.equal(response.headers.get('content-range'),'bytes 4-9/20');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(4,10));
    assert.deepEqual(ranges,['bytes=0-4095','bytes=4-9']);
    assert.equal((await fetch(base+'/audio/'+'0'.repeat(48)+'.flac')).status,404);
  } finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
});
test('relay rejects HTML masquerading as audio and validates redirect destinations', async () => {
  const relay = new AudioRelay(u=>{if(new URL(u).hostname !== 'example.test') throw new Error('blocked');return u;}, async()=>new Response('<html>error</html>'));
  await assert.rejects(relay.register({url:'https://example.test/song',codec:'flac'},'http://localhost'),/实际内容/);
  relay.fetch = async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  await assert.rejects(relay.register({url:'https://example.test/song',codec:'flac'},'http://localhost'),/blocked/);
});
