import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import {signRestrictedToken} from '../src/modules/auth/restricted-session.js';

test('professional routers share the ordinary peer budget and stop exhausted sessions before database access', async t => {
  const configuration = {d2Enabled:env.d2Enabled, restrictedJwtSecret:env.restrictedJwtSecret};
  Object.assign(env,{d2Enabled:true,restrictedJwtSecret:'isolated-restricted-test-secret-8088'});
  const admin = {id:'reviewer',role:'admin',is_active:true,session_version:0};
  const owner = {id:'owner',role:'psychologist',is_active:true,session_version:0,psychologist_approval_status:'pending_review'};
  const dbOperations = [];
  t.mock.method(db,'query',async (_sql,[id])=>{
    dbOperations.push('authentication');
    return {rows:[id===owner.id ? owner : admin]};
  });
  t.mock.method(db,'getClient',async ()=>{
    dbOperations.push('transaction');
    return {
      async query(sql){
        if(sql.includes('FROM users'))return {rows:[sql.includes('SELECT id,role') ? owner : admin]};
        if(sql.includes('FROM psychologist_profiles'))return {rows:[{approval_status:'pending_review'}]};
        return {rowCount:1,rows:[]};
      },
      release(){},
    };
  });
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async ()=>{
    Object.assign(env,configuration);
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  const request = (path,token,forwarded='192.0.2.10')=>fetch(
    'http://127.0.0.1:'+server.address().port+'/api/'+path,
    {headers:{'X-Forwarded-For':forwarded,...(token?{Authorization:'Bearer '+token}:{})}}
  );
  const ordinary = jwt.sign({sub:admin.id,sv:0},env.jwtSecret,{expiresIn:600});
  const restricted = signRestrictedToken({id:owner.id,role:owner.role,isActive:true,sessionVersion:0,psychologistStatus:'pending_review'});
  let response=await request('professional-reviews/pending',ordinary);
  assert.equal(response.status,200);
  assert.match(response.headers.get('ratelimit-policy'),/^240;/);
  assert.deepEqual((await response.json()).data,[]);
  response=await request('professional-status/me',restricted);
  assert.equal(response.status,200);
  assert.match(response.headers.get('ratelimit-policy'),/^120;/);
  assert.equal((await response.json()).data.status,'pending_review');

  for(const [prefix,used,limit,token] of [
    ['professional-profile/me',1,240,ordinary],
    ['professional-status/me',1,120,restricted],
  ]){
    for(let i=used;i<limit;i++){
      const denied=await request(prefix);
      assert.equal(denied.status,401);
      await denied.body.cancel();
    }
    const before=dbOperations.length;
    // Vary the forwarding header and cross the ordinary routers with a valid token.
    const exhausted=await request(prefix.startsWith('professional-profile')?'professional-reviews/pending':prefix,token,'192.0.2.99');
    assert.equal(exhausted.status,429);
    assert.match(exhausted.headers.get('retry-after'),/^\d+$/);
    assert.equal(exhausted.headers.get('cache-control'),'no-store');
    assert.equal((await exhausted.json()).success,false);
    assert.equal(dbOperations.length,before);
  }
  assert.deepEqual(dbOperations,['authentication','transaction','authentication','transaction']);
});
