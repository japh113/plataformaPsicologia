import {parentPort,workerData} from 'node:worker_threads';
import {deliverVerification} from './verification.delivery.js';
// No DB handle, application server or retry loop in this disposable delivery isolate.
try {
  await deliverVerification(workerData.message);
  parentPort.postMessage({ok:true});
} catch {
  parentPort.postMessage({ok:false});
}
