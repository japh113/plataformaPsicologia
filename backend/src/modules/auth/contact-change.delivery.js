import {Worker} from 'node:worker_threads';
import {monotonicNow,remainingMilliseconds} from './contact-change.deadline.js';
export const NOTICE_DELIVERY_TIMEOUT_MS=10000;
const defaultWorker=new URL('./contact-change.delivery-worker.js',import.meta.url);
const failure=code=>Object.assign(new Error('Notice delivery unavailable'),{code});

// One absolute monotonic deadline includes construction, startup, authorization and delivery.
// Expiry terminates the worker and awaits its exit; no abandoned delivery promise.
export async function deliverContactNotice(message,{timeoutMs=NOTICE_DELIVERY_TIMEOUT_MS,deadlineNs,authorize,workerUrl=defaultWorker,workerData={}}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>NOTICE_DELIVERY_TIMEOUT_MS)throw failure('INVALID_DELIVERY_DEADLINE');
  if(workerUrl.href!==defaultWorker.href&&(process.env.NODE_ENV!=='test'||process.env.LOCAL_DEVELOPMENT!=='true'))throw failure('TEST_WORKER_FORBIDDEN');
  const localDeadline=monotonicNow()+BigInt(Math.floor(timeoutMs*1e6));
  if(deadlineNs!==undefined&&typeof deadlineNs!=='bigint')throw failure('INVALID_DELIVERY_DEADLINE');
  let deadline=deadlineNs!==undefined&&deadlineNs<localDeadline?deadlineNs:localDeadline;
  if(remainingMilliseconds(deadline)<=0)throw failure('DELIVERY_TIMEOUT');
  // CLI/eval flags apply to the parent, not this file worker. The deadline cannot be overridden.
  const worker=new Worker(workerUrl,{execArgv:[],workerData:{...workerData,message,deadlineNs:deadline},stdout:true,stderr:true});
  worker.stdout.resume();worker.stderr.resume();
  return new Promise((resolve,reject)=>{
    let finishing=false,authorizing=false,authorized=false,timer;
    const finish=async error=>{
      if(finishing)return;finishing=true;clearTimeout(timer);
      try {await worker.terminate();}
      catch {error=failure('DELIVERY_TERMINATION_FAILED');}
      if(error)reject(error);else resolve();
    };
    const arm=()=>{
      clearTimeout(timer);
      const remaining=remainingMilliseconds(deadline);
      if(remaining<=0){void finish(failure('DELIVERY_TIMEOUT'));return;}
      // Timers can fire early; the callback checks the absolute deadline again.
      timer=setTimeout(arm,Math.ceil(remaining));
    };
    worker.on('message',result=>{
      if(finishing)return;
      if(result?.ready===true&&!authorizing&&!authorized){
        authorizing=true;
        void (async()=>{
          try {
            const refreshed=authorize?await authorize():deadline;
            if(finishing)return;
            if(typeof refreshed!=='bigint'){await finish(failure('NOTICE_AUTHORITY_LOST'));return;}
            if(refreshed<deadline)deadline=refreshed;
            if(remainingMilliseconds(deadline)<=0){await finish(failure('DELIVERY_TIMEOUT'));return;}
            authorized=true;arm();
            if(!finishing)worker.postMessage({deliver:true,deadlineNs:deadline});
          } catch {await finish(failure('NOTICE_AUTHORITY_LOST'));}
        })();
      } else if(typeof result?.ok==='boolean'){
        const error=result.expired||remainingMilliseconds(deadline)<=0?failure('DELIVERY_TIMEOUT'):
          !result.ok||!authorized?failure('DELIVERY_FAILED'):null;
        void finish(error);
      }
    });
    worker.once('error',()=>{void finish(failure('DELIVERY_WORKER_FAILED'));});
    worker.once('exit',()=>{if(!finishing)void finish(failure('DELIVERY_WORKER_EXITED'));});
    arm();
  });
}
