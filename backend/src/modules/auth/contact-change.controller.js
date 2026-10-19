import { successResponse,errorResponse } from '../../utils/response.js';
import { getContactChange,startContactChange,operateContactChange } from './contact-change.service.js';
const handler=action=>async(req,res,next)=>{
  res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');
  try {return successResponse(res,await action(req));}
  catch(error) {
    if (error.code==='23505') return errorResponse(res,'La operación ya existe o el destino no está disponible. Consulta el estado.',409);
    if (error.status) {if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));return errorResponse(res,error.message,error.status);}
    // Never forward database errors, bodies, candidates or credentials to logging.
    return next(new Error('Contact change operation failed'));
  }
};
export const getContactChangeHandler=handler(req=>getContactChange(req.user));
export const startContactChangeHandler=handler(req=>startContactChange(req.user,req.body));
export const operateContactChangeHandler=handler(req=>operateContactChange(req.user,req.params.requestId,req.params.operation,req.body));
