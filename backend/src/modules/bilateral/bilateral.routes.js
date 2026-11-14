import { Router,json } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createPublicAuthLimiter } from '../auth/public-auth-limiter.js';
import { command,configuration } from './bilateral.service.js';
import { sha256,conditionsText,conditionsVersion,declarationVersion,declarationText,errorFor } from './bilateral.policy.js';

const router=Router();
router.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  try{configuration();next();}catch(error){const safe=errorFor(error);res.status(safe.status).json({success:false,message:safe.message});}
});
// Bounds pre-auth DB work locally; durable actor/destination quotas are enforced by PostgreSQL.
router.use(createPublicAuthLimiter({limit:600,windowMs:60_000}));
router.use(json({limit:'8kb'}));
router.use((error,req,res,next)=>res.status(error.status===413?413:400).json({success:false,message:'Entrada no válida.'}));
router.use((req,res,next)=>authenticate(req,res,error=>error?res.status(503).json({success:false,message:'Autenticación temporalmente no disponible.'}):next()));
const handle=op=>async(req,res)=>{
  try {
    if(Object.keys(req.query).length) return res.status(400).json({success:false,message:'Entrada no válida.'});
    const data=await command(req.user,op,req.method==='GET'?{}:req.body,req.params.id);
    return res.status(op==='issue'?202:200).json({success:true,data});
  }catch(error){const safe=errorFor(error);if(safe.status===429)res.set('Retry-After','600');return res.status(safe.status).json({success:false,message:safe.message});}
};
router.get('/terms',(req,res)=>{const text=conditionsText(req.user.fullName||[req.user.firstName,req.user.lastName].filter(Boolean).join(' '));res.json({success:true,data:{conditionsVersion,conditionsText:text,conditionsHash:sha256(text),declarationVersion,declarationText,fictional:true}});});
for(const op of ['professional-reference','preflight','recipient-reference'])router.post('/'+op,handle(op));
router.post('/',handle('issue'));
for(const op of ['sent','received','agreements','blocks','notices'])router.get('/'+op,handle(op));
for(const op of ['accept','decline','withdraw','resend','block','unblock','unlink'])router.post('/:id/'+op,handle(op));
export default router;
