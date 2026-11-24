import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

test('admission real router rejects request 301 on every read and write before JSON JWT and authentication DB work',async()=>{
  Object.assign(process.env,{VERIFICATION_DELIVERY:'simulated',ADMISSION_ENABLED:'true',ADMISSION_SECRET:'independent-admission-limiter-fixture-32bytes',
    EPISODE_TEST_RUN_ID:randomUUID(),ADMISSION_DATABASE_URL:'postgres://unused:unused@127.0.0.1/psicopanel_episode_limiter'});
  const {default:app}=await import('../src/app.js'),{default:db}=await import('../src/config/db.js'),{default:env}=await import('../src/config/env.js');
  const original=db.query,originalError=console.error;let queries=0,logs=0;
  db.query=async()=>{queries++;throw new Error('private-auth-fixture');};console.error=()=>{logs++;};
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/admissions',id=randomUUID();
  const token=jwt.sign({sub:'own-fixture',sv:0},env.jwtSecret,{expiresIn:'1h'});
  try{
    for(let n=0;n<300;n++){
      const response=await fetch(base,{headers:{Authorization:'Bearer '+token}});
      assert.equal(response.status,503);await response.arrayBuffer();
    }
    assert.equal(queries,300);
    const paths=[['GET',''],['GET','/'+id],['GET','/'+id+'/draft'],
      ['POST','/care-context'],['POST','/care-start'],
      ['POST','/prepare'],['POST','/assign'],...['accept','save','care-send','care-register','submit','correct','validate','revoke'].map(op=>['POST','/'+id+'/'+op])];
    for(const [method,path]of paths){
      const response=await fetch(base+path,{method,headers:{Authorization:'Bearer deliberately-invalid-jwt','Content-Type':'application/json',
        'X-Forwarded-For':'192.0.2.99','X-Real-IP':'192.0.2.100','Forwarded':'for=192.0.2.101'},...(method==='POST'?{body:'{private-malformed-body'}:{})});
      assert.equal(response.status,429,path);assert.ok(Number(response.headers.get('Retry-After'))>=1);
      assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.doesNotMatch(await response.text(),/private-|own-fixture|unused|deliberately/);
    }
    assert.equal(queries,300,'rejected requests never reach authentication DB');
    for(let n=0;n<300;n++){
      const response=await fetch(base+'/consultations/'+id,{headers:{Authorization:'Bearer '+token}});
      assert.equal(response.status,503);await response.arrayBuffer();
    }
    for(const [method,path] of [['GET','/consultations'],['GET','/consultations/'+id+'/interview'],
      ['POST','/consultations/'+id+'/care-review'],['POST','/consultations/'+id+'/note']]){
      const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},
        ...(method==='POST'?{body:'{private-malformed-body'}:{})});
      assert.equal(response.status,429,path);
      assert.ok(Number(response.headers.get('Retry-After'))>=1);
      assert.doesNotMatch(await response.text(),/private-/);
    }
    assert.equal(queries,600,'both limits run before authentication DB');
    assert.equal(logs,0,'no body or SQL diagnostics are logged');
  }finally{
    await new Promise(r=>server.close(r));db.query=original;console.error=originalError;
    for(const key of ['ADMISSION_ENABLED','ADMISSION_SECRET','EPISODE_TEST_RUN_ID','ADMISSION_DATABASE_URL'])delete process.env[key];
  }
});
