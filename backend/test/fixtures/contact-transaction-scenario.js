import assert from 'node:assert/strict';
import pg from 'pg';
import {contactTransactionProxy} from './contact-transaction-proxy.js';

async function bounded(promise) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Private proxy regression deadline exceeded')),5000);})]);}
  finally {clearTimeout(timer);}
}

// All queries use the real driver/socket. Wrapping release records its argument
// and inspects server state BEFORE invoking the genuine pool release function.
export async function exerciseContactTransactionFault({database,observer,connection,request,snapshot,count,comparisons,proxyOptions}) {
  const proxy=await contactTransactionProxy(proxyOptions);
  const pool=new pg.Pool({...connection,host:'127.0.0.1',port:proxy.port,ssl:false,max:1,
    connectionTimeoutMillis:3000,query_timeout:proxyOptions.mode==='delay'?80:1000});
  const previousGet=database.getClient,driverErrors=[];
  let inspection=Promise.resolve(),oldPid,releaseError,releaseState,transportAtRelease,released=false,next;
  const before=await snapshot(),admissionsBefore=await count(),callsBefore=comparisons();
  try {
    database.getClient=async()=>{
      const c=await pool.connect();oldPid=c.processID;
      c.on('error',error=>{driverErrors.push(error.message);});
      return {
        async query(...args){try{return await c.query(...args);}catch(error){driverErrors.push(error.message);throw error;}},
        release(error){
          assert.equal(released,false);released=true;releaseError=error;
          transportAtRelease=proxy.transportOpen();
          inspection=observer.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[oldPid])
            .then(r=>{releaseState=r.rows[0]?.state;}).finally(()=>c.release(error));
        },
      };
    };
    const response=await bounded(request());
    await bounded(inspection);
    if(proxyOptions.mode!=='set-error')await bounded(proxy.settled);
    next=await bounded(pool.connect());
    const nextPid=next.processID;
    const nextState=(await observer.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[nextPid])).rows[0]?.state;
    // Sanitize only as test teardown AFTER recording contamination. This makes
    // the same harness safe when deliberately run against the rejected helper.
    if(nextState!=='idle')await next.query({text:'ROLLBACK',query_timeout:1000});
    await next.query({text:'SELECT 1',query_timeout:1000});next.release();next=null;
    if(releaseError) {
      for(let i=0;i<200;i++) {
        if(!(await observer.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1',[oldPid])).rowCount)break;
        if(i===199)assert.fail('Discarded backend remains connected');
        await new Promise(resolve=>setTimeout(resolve,10));
      }
    }
    return {response,before,after:await snapshot(),admissions:(await count())-admissionsBefore,
      comparisons:comparisons()-callsBefore,oldPid,nextPid,nextState,releaseState,releaseError,
      transportAtRelease,driverErrors,wire:proxy.observations(),queries:[...proxy.queries]};
  } finally {
    database.getClient=previousGet;
    await inspection.catch(()=>{});
    if(next)next.release(new Error('Private proxy teardown'));
    await pool.end();await proxy.close();
  }
}

export function assertDiscarded(result) {
  assert.equal(result.response.status,503);
  assert.ok(result.releaseError instanceof Error,`Uncertain connection must be discarded (reused=${result.oldPid===result.nextPid}; releaseState=${result.releaseState}; nextState=${result.nextState})`);
  assert.notEqual(result.nextPid,result.oldPid,'Pool must not reuse the contaminated PostgreSQL backend');
  assert.equal(result.nextState,'idle');
  assert.equal(JSON.stringify(result.response.body).includes('BEGIN'),false);
  assert.equal(JSON.stringify(result.response.body).includes('lock_timeout'),false);
  assert.equal(JSON.stringify(result.response.body).includes('SQL'),false);
}
