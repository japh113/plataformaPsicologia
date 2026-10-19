import {parentPort,workerData} from 'node:worker_threads';
if(process.env.NODE_ENV!=='test')throw Error('Test fixture only');
const counter=new Int32Array(workerData.observation);
let effectiveDeadline=workerData.deadlineNs;
parentPort.on('message',grant=>{if(typeof grant.deadlineNs==='bigint'&&grant.deadlineNs<effectiveDeadline)effectiveDeadline=grant.deadlineNs;});
Atomics.store(counter,2,1);
if(workerData.startupGate)Atomics.wait(new Int32Array(workerData.startupGate),0,0);
const adapter=async()=>{
 Atomics.add(counter,0,1);
 if(typeof effectiveDeadline==='bigint')Atomics.store(counter,1,Math.ceil(Number(effectiveDeadline-process.hrtime.bigint())/1e6));
 if(workerData.mode==='collision'){
  while(process.hrtime.bigint()<effectiveDeadline){Atomics.add(counter,3,1);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1);}
 }
};
// Same red regression on the reviewed implementation, before it had a deadline protocol.
if(workerData.deadlineNs===undefined){await adapter();parentPort.postMessage({ok:true});}
else {
 const {runContactNoticeWorker}=await import('../../src/modules/auth/contact-change.worker-protocol.js');
 await runContactNoticeWorker(adapter);
}
