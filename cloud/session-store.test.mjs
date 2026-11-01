import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Providers } from './providers.mjs';
import { Credential } from './qq-client.mjs';

test('Windows encrypted sessions survive provider restart; logout removes only selected account', {skip:process.platform!=='win32'}, async t => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'gatefold-session-test-'));
  t.after(async()=>{for(const file of await readdir(dir))await unlink(path.join(dir,file));await rmdir(dir);});
  const first=new Providers(dir);
  first.qq.credential=new Credential({musicid:123,musickey:'test-secret-key',loginType:1});
  first.neCookie='test-cookie-secret';
  await first.persist('qq');await first.persist('netease');
  const disk=await readFile(path.join(dir,'qq.session.dpapi'));
  assert.equal(disk.includes(Buffer.from('test-secret-key')),false);
  const second=new Providers(dir);await second.restore();
  assert.equal(second.qq.credential.musickey,'test-secret-key');
  assert.equal(second.qq.credential.loginType,1);
  assert.equal(second.neCookie,'test-cookie-secret');
  await second.run('qq','logout',{});
  const third=new Providers(dir);await third.restore();
  assert.equal(third.qq.credential.isLoggedIn(),false);
  assert.equal(third.neCookie,'test-cookie-secret');
  await third.run('netease','logout',{});
  const fourth=new Providers(dir);await fourth.restore();
  assert.equal(fourth.neCookie,'');
});
