import {parentPort,workerData} from 'node:worker_threads';
if(process.env.NODE_ENV!=='test')throw Error('Test fixture only');
const {message,observation,mode='fail'}=workerData;
if(message.secret)throw Error('Unexpected secret in notice');
if(observation)Atomics.add(new Int32Array(observation),0,1);
if(mode==='hang'){
 setInterval(()=>{if(observation)Atomics.add(new Int32Array(observation),0,1);},10);
 await new Promise(()=>{});
}else{parentPort.postMessage({ok:mode==='success'});}
