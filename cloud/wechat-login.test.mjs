import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WechatLogin, parseWechatStatus } from './wechat-login.mjs';

test('WeChat statuses distinguish waiting, confirmation, refusal and expiry', () => {
  for (const [code, state] of [[408,'waiting'],[404,'confirm'],[403,'refused'],[402,'expired']]) {
    assert.equal(parseWechatStatus(`window.wx_errcode=${code};window.wx_code='';`).state, state);
  }
  assert.throws(() => parseWechatStatus("window.wx_errcode=405;window.wx_code='';"));
  assert.throws(() => parseWechatStatus('window.wx_errcode=500;'));
});
test('authorization uses WeChat account type and does not leak authorization code', async () => {
  let request;
  const client = { execute: async r => { request = r; return { musicid: 123, musickey: 'test-only-key' }; } };
  const login = new WechatLogin(client, async () => new Response("window.wx_errcode=405;window.wx_code='test-code';"));
  const result = await login.poll({ identifier: 'test-id' });
  assert.equal(request.comm.tmeLoginType, 1);
  assert.equal(request.param.code, 'test-code');
  assert.equal(result.credential.loginType, 1);
  assert.equal(result.state, 'done');
  assert.equal(result.code, undefined);
  client.execute = async () => ({});
  await assert.rejects(login.poll({ identifier: 'test-id' }), /未取得音乐账号/);
});
test('long polling timeout is waiting, network failure is not hidden', async () => {
  const login = new WechatLogin({}, async () => { throw new DOMException('timeout','TimeoutError'); });
  assert.deepEqual(await login.poll({ identifier: 'test-id' }), { state:'waiting' });
  login.fetch = async () => { throw new Error('network down'); };
  await assert.rejects(login.poll({ identifier: 'test-id' }), /network down/);
});
test('QR parser uses fixed WeChat origin and rejects non-images', async () => {
  const urls = [];
  const login = new WechatLogin({}, async url => {
    urls.push(url);
    return urls.length === 1 ? new Response('<img src="/connect/qrcode/test-id">') : new Response('invalid image', {headers:{'content-type':'text/html'}});
  });
  await assert.rejects(login.getQr(), /图片无效/);
  assert.equal(urls[1], 'https://open.weixin.qq.com/connect/qrcode/test-id');
});
