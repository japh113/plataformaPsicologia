import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {deadlineFromDatabase,monotonicNow} from '../src/modules/auth/contact-change.deadline.js';
import {deliverContactNotice} from '../src/modules/auth/contact-change.delivery.js';
const workerUrl=new URL('./fixtures/contact-deadline-worker.js',import.meta.url);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('database budget rounds down, includes entire query latency and never extends its ceiling',()=>{
 const sent=1000000000n;
 assert.equal(deadlineFromDatabase('600.99',sent,{maxMs:10000}),1600000000n);
 assert.equal(deadlineFromDatabase(3000,sent,{maxMs:10000}),4000000000n);
 assert.equal(deadlineFromDatabase(15000,sent,{maxMs:10000}),11000000000n);
 assert.equal(deadlineFromDatabase(600,sent,{maxMs:10000,ceilingNs:1200000000n}),1200000000n);
 // Returning 400ms after query start leaves only 200ms of a 600ms DB sample.
 assert.equal(Number(deadlineFromDatabase(600,sent,{maxMs:10000})-(sent+400000000n))/1e6,200);
 for(const remaining of [0,-1,Infinity,NaN,0.9])assert.equal(deadlineFromDatabase(remaining,sent,{maxMs:10000}),null);
});
test('worker itself rejects deadline expired during startup, without parent timeout intervention',async()=>{
 const observation=new SharedArrayBuffer(16),startupGate=new SharedArrayBuffer(4),counter=new Int32Array(observation);
 const worker=new Worker(workerUrl,{workerData:{message:{},observation,startupGate,deadlineNs:monotonicNow()+250000000n},execArgv:[]});
 try {
  for(let i=0;i<100&&!counter[2];i++)await wait(5);assert.equal(counter[2],1);
  await wait(260);const response=once(worker,'message');Atomics.store(new Int32Array(startupGate),0,1);Atomics.notify(new Int32Array(startupGate),0);
  assert.deepEqual((await response)[0],{ok:false,expired:true});assert.equal(counter[0],0);
 } finally {await worker.terminate();}
});
test('worker checks tightened grant immediately before adapter, even without parent timer',async()=>{
 const observation=new SharedArrayBuffer(16),counter=new Int32Array(observation);
 const worker=new Worker(workerUrl,{workerData:{message:{},observation,deadlineNs:monotonicNow()+2000000000n},execArgv:[]});
 try {
  assert.deepEqual((await once(worker,'message'))[0],{ready:true});const response=once(worker,'message');
  worker.postMessage({deliver:true,deadlineNs:monotonicNow()-1n});
  assert.deepEqual((await response)[0],{ok:false,expired:true});assert.equal(counter[0],0);
 } finally {await worker.terminate();}
});
test('response at timeout has one effective termination and no residual worker tasks',async()=>{
 const observation=new SharedArrayBuffer(16),counter=new Int32Array(observation);
 const terminate=Worker.prototype.terminate;let closures=0;
 Worker.prototype.terminate=function(...args){closures++;return terminate.apply(this,args);};
 try {
  await assert.rejects(deliverContactNotice({}, {workerUrl,workerData:{observation,mode:'collision'},timeoutMs:300}),{code:'DELIVERY_TIMEOUT'});
  assert.equal(counter[0],1);assert.equal(closures,1);const stopped=counter[3];await wait(100);assert.equal(counter[3],stopped);assert.equal(closures,1);
 } finally {Worker.prototype.terminate=terminate;}
});
test('expired absolute deadline creates no worker or adapter',async()=>{
 const observation=new SharedArrayBuffer(16);
 await assert.rejects(deliverContactNotice({}, {workerUrl,workerData:{observation},deadlineNs:monotonicNow()-1n}),{code:'DELIVERY_TIMEOUT'});
 assert.deepEqual([...new Int32Array(observation)],[0,0,0,0]);
});
