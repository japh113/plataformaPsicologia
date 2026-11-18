import { Router,json } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createPublicAuthLimiter } from '../auth/public-auth-limiter.js';
import { command,configuration } from './admission.service.js';
import { errorFor } from './admission.policy.js';
const router=Router();
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});try{configuration();next();}catch(error){const safe=errorFor(error);res.status(safe.status).json({success:false,message:safe.message});}});
router.use(createPublicAuthLimiter({limit:300,windowMs:60_000}));
router.use(json({limit:'16kb'}));
router.use((error,req,res,next)=>res.status(error.status===413?413:400).json({success:false,message:'Entrada no válida.'}));
router.use((req,res,next)=>authenticate(req,res,error=>error?res.status(503).json({success:false,message:'Autenticación temporalmente no disponible.'}):next()));
const handle=op=>async(req,res)=>{
  try{
    if(Object.keys(req.query).length)return res.status(400).json({success:false,message:'Entrada no válida.'});
    const data=await command(req.user,op,req.method==='GET'?{}:req.body,req.params.id);
    res.json({success:true,data});
  }catch(error){const safe=errorFor(error);res.status(safe.status).json({success:false,message:safe.message});}
};
router.get('/',handle('list'));
router.post('/prepare',handle('prepare'));router.post('/assign',handle('assign'));
router.get('/:id',handle('detail'));router.get('/:id/draft',handle('draft'));
for(const op of ['accept','save','submit','correct','validate','revoke'])router.post('/:id/'+op,handle(op));
export default router;
