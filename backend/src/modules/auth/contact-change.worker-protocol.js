import {parentPort,workerData} from 'node:worker_threads';
import {monotonicNow} from './contact-change.deadline.js';

// The adapter is invoked only after a fresh post-startup ownership grant from the parent.
export async function runContactNoticeWorker(adapter) {
  let deadlineNs=workerData.deadlineNs;
  const expired=()=>typeof deadlineNs!=='bigint'||monotonicNow()>=deadlineNs;
  try {
    if(expired()){parentPort.postMessage({ok:false,expired:true});return;}
    const grantPromise=new Promise(resolve=>parentPort.once('message',resolve));
    parentPort.postMessage({ready:true});
    const grant=await grantPromise;
    if(grant?.deliver!==true||typeof grant.deadlineNs!=='bigint'){
      parentPort.postMessage({ok:false});return;
    }
    if(grant.deadlineNs<deadlineNs)deadlineNs=grant.deadlineNs;
    // No await or other work between this check and the adapter invocation.
    if(expired()){parentPort.postMessage({ok:false,expired:true});return;}
    await adapter(workerData.message);
    parentPort.postMessage({ok:true});
  } catch {parentPort.postMessage({ok:false});}
}
