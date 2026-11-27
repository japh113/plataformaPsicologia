import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {authenticate} from '../../middlewares/authMiddleware.js';
import env from '../../config/env.js';
import {safeHandler,fail} from './professional.core.js';
import {exact} from './professional.validators.js';
import * as service from './professional.service.js';
import {getPhoto,uploadPhoto,retirePhoto,recoverUploads} from './professional.photos.js';
import {createPublicAuthLimiter,publicAuthClientKey} from '../auth/public-auth-limiter.js';
import {getManualAccreditation,submitManualAccreditation,decideManualAccreditation} from './manual-accreditation.service.js';
import {getPublicationPreview,requireDirectory,setPublicationPreferences} from './directory.service.js';
export const profileRoutes=Router(),reviewRoutes=Router();
const enabled=(req,res,next)=>env.d2Enabled?next():res.status(404).json({success:false,message:'Not found'});
const privateBudget=createPublicAuthLimiter({limit:240,windowMs:60_000});
// Bound the socket-peer key space before the Express limiter and authentication.
const expressBudget=rateLimit({
  windowMs:60_000, limit:240, keyGenerator:publicAuthClientKey,
  validate:{keyGeneratorIpFallback:false}, legacyHeaders:false, standardHeaders:'draft-7',
  handler:(_req,res)=>res.set('Cache-Control','no-store').status(429)
    .json({success:false,message:'Demasiadas solicitudes. Intenta más tarde.'}),
});
const privateResponse=(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();};
profileRoutes.use(enabled,privateBudget,expressBudget,authenticate,privateResponse);
reviewRoutes.use(enabled,privateBudget,expressBudget,authenticate,privateResponse);
profileRoutes.get('/me',safeHandler(req=>service.getProfile(req.user)));
profileRoutes.post('/me',safeHandler(req=>{exact(req.body||{},[]);return service.createProfile(req.user);}));
profileRoutes.patch('/me',safeHandler(req=>service.updateProfile(req.user,req.body)));
profileRoutes.get('/me/publication',safeHandler(req=>{requireDirectory();return getPublicationPreview(req.user);}));
profileRoutes.patch('/me/publication',safeHandler(req=>{requireDirectory();return setPublicationPreferences(req.user,req.body);}));
profileRoutes.get('/me/credentials',safeHandler(req=>service.getCredentials(req.user)));
profileRoutes.post('/me/credential-proposals',safeHandler(req=>service.submitProposal(req.user,req.body)));
profileRoutes.get('/me/accreditation',safeHandler(req=>getManualAccreditation(req.user)));
profileRoutes.post('/me/accreditation',safeHandler(req=>submitManualAccreditation(req.user,req.body)));
profileRoutes.get('/me/photo',safeHandler(getPhoto));
profileRoutes.post('/me/photo',safeHandler(uploadPhoto));
profileRoutes.delete('/me/photo',safeHandler(req=>retirePhoto(req.user,req.body)));
profileRoutes.post('/me/photo/recover',safeHandler(req=>recoverUploads(req.user,req.body)));
reviewRoutes.use((req,res,next)=>['admin','superadmin'].includes(req.user.role)?next():res.status(403).json({success:false,message:'Operación no autorizada.'}));
reviewRoutes.get('/pending',safeHandler(req=>service.listReviews(req.user)));
reviewRoutes.get('/revalidation',safeHandler(req=>service.listRevalidations(req.user)));
reviewRoutes.get('/:owner/:version/revalidation',safeHandler(req=>service.getReview(req.user,req.params.owner,req.params.version,'revalidation')));
reviewRoutes.get('/:owner/:version',safeHandler(req=>service.getReview(req.user,req.params.owner,req.params.version)));
reviewRoutes.post('/:owner/:version/manual-decision',safeHandler(req=>decideManualAccreditation(req.user,req.params.owner,req.params.version,req.body,'proposal')));
reviewRoutes.post('/:owner/:version/revalidation',safeHandler(req=>decideManualAccreditation(req.user,req.params.owner,req.params.version,req.body,'revalidation')));
reviewRoutes.post('/:owner/:version/decision',safeHandler(req=>{
  if(!req.body)throw fail('Decisión requerida.');
  return service.decideCredential(req.user,req.params.owner,req.params.version,req.body);
}));
