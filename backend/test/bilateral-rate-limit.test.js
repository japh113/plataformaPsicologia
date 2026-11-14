import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

test('bilateral production router limits all endpoints before JSON, authentication and database work at request 601',async()=>{
  Object.assign(process.env,{VERIFICATION_DELIVERY:'simulated',BILATERAL_ENABLED:'true',BILATERAL_SECRET:'independent-fictitious-limiter-key-32bytes',
    EPISODE_TEST_RUN_ID:randomUUID(),
    BILATERAL_DATABASE_URL:'postgresql://unused:unused@127.0.0.1/psicopanel_episode_limiter'});
  const {default:app}=await import('../src/app.js');
  const {default:db}=await import('../src/config/db.js');
  const {default:env}=await import('../src/config/env.js');
  const original=db.query,originalError=console.error;let queries=0,logs=0;
  db.query=async()=>{queries++;throw new Error('fixture: authentication DB unavailable');};
  console.error=()=>{logs++;};
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/bilateral-invitations';
  const token=jwt.sign({sub:'fixture',sv:0},env.jwtSecret,{expiresIn:'1h'});
  try{
    for(let n=0;n<600;n++){
      const response=await fetch(base+'/terms',{headers:{Authorization:'Bearer '+token}});
      assert.equal(response.status,503);await response.arrayBuffer();
    }
    assert.equal(queries,600);
    for(const path of ['/terms','/sent','/received','/agreements','/blocks','/notices',
      '/professional-reference','/preflight','/recipient-reference','',
      ...['accept','decline','withdraw','resend','block','unblock','unlink'].map(op=>'/fixture/'+op)]){
      // Spoofed headers, different endpoint/body and token cannot reset the socket-peer budget.
      const response=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token,
        'Content-Type':'application/json','X-Forwarded-For':'192.0.2.99','X-Real-IP':'192.0.2.100'},body:'{invalid-json'});
      assert.equal(response.status,429,path);assert.ok(Number(response.headers.get('Retry-After'))>=1);
      assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.doesNotMatch(await response.text(),/fixture|unused|invalid-json/);
    }
    const get=await fetch(base+'/terms',{headers:{Authorization:'Bearer '+token}});
    assert.equal(get.status,429);await get.arrayBuffer();
    assert.equal(queries,600,'rejected requests must never reach authentication DB');
    assert.equal(logs,0,'neither DB diagnostics nor malformed bodies reach the logger');
  }finally{
    await new Promise(r=>server.close(r));db.query=original;console.error=originalError;
    for(const key of ['BILATERAL_ENABLED','BILATERAL_SECRET','EPISODE_TEST_RUN_ID','BILATERAL_DATABASE_URL'])delete process.env[key];
  }
});
