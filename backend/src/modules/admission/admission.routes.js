import { Router,json } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createPublicAuthLimiter } from '../auth/public-auth-limiter.js';
import { command,configuration,consultation } from './admission.service.js';
import { errorFor } from './admission.policy.js';

function protect(router) {
  router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});try{configuration();next();}catch(error){const safe=errorFor(error);res.status(safe.status).json({success:false,message:safe.message});}});
  router.use(createPublicAuthLimiter({limit:300,windowMs:60_000}));
  router.use(json({limit:'80kb'}));
  router.use((error,req,res,next)=>res.status(error.status===413?413:400).json({success:false,message:'Entrada no válida.'}));
  router.use((req,res,next)=>authenticate(req,res,error=>error?res.status(503).json({success:false,message:'Autenticación temporalmente no disponible.'}):next()));
}
const handle=(op,submit=command)=>async(req,res)=>{
  try{
    if(Object.keys(req.query).length)return res.status(400).json({success:false,message:'Entrada no válida.'});
    const data=await submit(req.user,op,req.method==='GET'?{}:req.body,req.params.id);
    res.json({success:true,data});
  }catch(error){const safe=errorFor(error);res.status(safe.status).json({success:false,message:safe.message});}
};

const router=Router();
const consultations=Router();
router.use('/consultations',consultations);
protect(consultations);
consultations.get('/',handle('list',consultation));
consultations.get('/:id',handle('status',consultation));
for(const op of ['sufficiency','consent','withdraw','revoke-admission','activate','book','complete','note']) {
  consultations.post('/:id/'+op,handle(op,consultation));
}

protect(router);
router.get('/',handle('list'));
router.post('/assign-directed',handle('assign-directed'));
router.get('/:id/directed/record',handle('directed-record'));
for(const op of ['attest','document','request','resolve','validate','assess'])router.post('/:id/directed/'+op,handle('directed-'+op));
router.post('/prepare',handle('prepare'));router.post('/assign',handle('assign'));
router.get('/:id',handle('detail'));router.get('/:id/record',handle('record'));router.get('/:id/draft',handle('draft'));
for(const op of ['accept','save','submit','correct','validate','revoke','assess'])router.post('/:id/'+op,handle(op));
export default router;
