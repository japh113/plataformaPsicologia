import {deliverVerification} from './verification.delivery.js';
import {runContactNoticeWorker} from './contact-change.worker-protocol.js';
// No DB handle, application server or retry loop in this disposable delivery isolate.
await runContactNoticeWorker(deliverVerification);
