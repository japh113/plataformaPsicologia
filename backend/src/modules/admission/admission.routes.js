import { Router,json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createPublicAuthLimiter, publicAuthClientKey } from '../auth/public-auth-limiter.js';
import { command,configuration,consultation } from './admission.service.js';
import { errorFor } from './admission.policy.js';

const listOperations = new Set(['list', 'withdrawals', 'care-context']);
const authenticatedAccount = req => req.user?.id || null;
// Shared by both routers. The list budget counts requests with fan-out and
// leaves two of the four clinical work slots available for short operations.
const authenticatedBudget = createPublicAuthLimiter({ limit: 180, windowMs: 60_000, clientKey: authenticatedAccount });
const listBudget = createPublicAuthLimiter({ limit: 40, windowMs: 60_000, clientKey: authenticatedAccount });
// Extra shared budget for the unified workflow across both routers. The
// original socket-peer guard runs before JSON/auth and bounds the key space.
const peerBudgetOptions = {
  windowMs: 60_000,
  limit: 300,
  keyGenerator: publicAuthClientKey,
  // The shared key function already groups IPv6 by /64 and normalizes mapped IPv4.
  validate: { keyGeneratorIpFallback: false },
  legacyHeaders: false,
  standardHeaders: 'draft-7',
  message: { success: false, message: 'Demasiadas solicitudes. Intenta más tarde.' },
};
const careBudget = rateLimit(peerBudgetOptions);
const admissionAuthBudget = rateLimit(peerBudgetOptions);
const consultationAuthBudget = rateLimit(peerBudgetOptions);
let active = 0;
let activeLists = 0;

function protect(router) {
  router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});try{configuration();next();}catch(error){const safe=errorFor(error);res.status(safe.status).json({success:false,message:safe.message});}});
  router.use(createPublicAuthLimiter({limit:300,windowMs:60_000}));
  router.use(json({limit:'80kb'}));
  router.use((error,req,res,next)=>res.status(error.status===413?413:400).json({success:false,message:'Entrada no válida.'}));
}
const authenticateAdmission = (req, res, next) => authenticate(req, res, error => error
  ? res.status(503).json({ success: false, message: 'Autenticación temporalmente no disponible.' })
  : next());
const handle = (operation, submit = command) => {
  const isList = listOperations.has(operation);
  const execute = async (req, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'Entrada no válida.' });
    if (active >= 4 || (isList && activeLists >= 2)) {
      res.setHeader('Retry-After', '1');
      return res.status(429).json({ success: false, message: 'Demasiadas solicitudes en curso. Intenta más tarde.' });
    }

    active++;
    if (isList) activeLists++;
    try {
      const data = await submit(req.user, operation, req.method === 'GET' ? {} : req.body, req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      const safe = errorFor(error);
      return res.status(safe.status).json({ success: false, message: safe.message });
    } finally {
      active--;
      if (isList) activeLists--;
    }
  };
  return (req, res) => authenticatedBudget(req, res, () => isList
    ? listBudget(req, res, () => execute(req, res))
    : execute(req, res));
};

const router=Router();
const consultations=Router();
router.use('/consultations',consultations);
protect(consultations);
consultations.get('/:id/interview', careBudget, authenticateAdmission, handle('interview', consultation));
consultations.post('/:id/care-review', careBudget, authenticateAdmission, handle('care-review', consultation));
consultations.use(consultationAuthBudget, authenticateAdmission);
consultations.get('/',handle('list',consultation));
consultations.get('/withdrawals',handle('withdrawals',consultation));
consultations.get('/:id',handle('status',consultation));
for(const op of ['sufficiency','consent','withdraw','revoke-admission','activate','book','complete','note']) {
  consultations.post('/:id/'+op,handle(op,consultation));
}

protect(router);
router.post('/care-context', careBudget, authenticateAdmission, handle('care-context'));
router.post('/care-start', careBudget, authenticateAdmission, handle('care-start'));
router.post('/:id/care-send', careBudget, authenticateAdmission, handle('care-send'));
router.post('/:id/care-register', careBudget, authenticateAdmission, handle('care-register'));
router.use(admissionAuthBudget, authenticateAdmission);
router.get('/',handle('list'));
router.post('/assign-directed',handle('assign-directed'));
router.get('/:id/directed/record',handle('directed-record'));
for(const op of ['attest','document','request','resolve','validate','assess'])router.post('/:id/directed/'+op,handle('directed-'+op));
router.post('/prepare',handle('prepare'));router.post('/assign',handle('assign'));
router.get('/:id',handle('detail'));router.get('/:id/record',handle('record'));router.get('/:id/draft',handle('draft'));
for(const op of ['accept','save','submit','correct','validate','revoke','assess'])router.post('/:id/'+op,handle(op));
export default router;
