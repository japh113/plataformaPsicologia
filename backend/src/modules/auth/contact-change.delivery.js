import {Worker} from 'node:worker_threads';
export const NOTICE_DELIVERY_TIMEOUT_MS=10000;
const defaultWorker=new URL('./contact-change.delivery-worker.js',import.meta.url);
const failure=code=>Object.assign(new Error('Notice delivery unavailable'),{code});

// A deadline terminates the isolate and awaits its exit before reporting failure.
// The underlying JS, timers and network handles cannot continue in a raced promise.
export async function deliverContactNotice(message,{timeoutMs=NOTICE_DELIVERY_TIMEOUT_MS,workerUrl=defaultWorker,workerData={}}={}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs<=0 || timeoutMs>NOTICE_DELIVERY_TIMEOUT_MS) throw failure('INVALID_DELIVERY_DEADLINE');
  if (workerUrl.href!==defaultWorker.href && (process.env.NODE_ENV!=='test' || process.env.LOCAL_DEVELOPMENT!=='true')) throw failure('TEST_WORKER_FORBIDDEN');
  // CLI/eval flags such as --input-type apply to the parent, not this file worker.
  const worker=new Worker(workerUrl,{execArgv:[],workerData:{...workerData,message},stdout:true,stderr:true});
  // Adapter output never escapes into server logs, including accidental payload logs.
  worker.stdout.resume();worker.stderr.resume();
  return new Promise((resolve,reject)=>{
    let finishing=false;
    const finish=async error=>{
      if(finishing)return;finishing=true;clearTimeout(timer);
      try {await worker.terminate();}
      catch {error=failure('DELIVERY_TERMINATION_FAILED');}
      if(error)reject(error);else resolve();
    };
    const timer=setTimeout(()=>{void finish(failure('DELIVERY_TIMEOUT'));},timeoutMs);
    worker.on('message',result=>{
      if(typeof result?.ok==='boolean')void finish(result.ok?null:failure('DELIVERY_FAILED'));
    });
    worker.once('error',()=>{void finish(failure('DELIVERY_WORKER_FAILED'));});
    worker.once('exit',()=>{if(!finishing)void finish(failure('DELIVERY_WORKER_EXITED'));});
  });
}
