import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import env from '../../config/env.js';
import {createPublicAuthLimiter, publicAuthClientKey} from '../auth/public-auth-limiter.js';
import {fail, safeHandler} from './professional.core.js';
import {exact} from './professional.validators.js';
import {getPublicPhoto, getPublicProfile, listDirectory} from './directory.service.js';
import {directoryLocations} from './directory.catalog.js';

const router = Router();
router.use((_req, res, next) => {
  res.set({'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff'});
  if (!env.directoryEnabled) return res.status(404).json({success: false, message: 'Perfil o fotografía no disponible.'});
  return next();
});
router.use(createPublicAuthLimiter({limit: 120, windowMs: 60_000}));
router.use(rateLimit({
  limit: 120, windowMs: 60_000, keyGenerator: publicAuthClientKey,
  validate: {keyGeneratorIpFallback: false}, legacyHeaders: false, standardHeaders: 'draft-7',
  message: {success: false, message: 'Demasiadas solicitudes. Intenta más tarde.'},
}));
router.use(createPublicAuthLimiter({limit: 600, windowMs: 60_000, clientKey: () => 'directory'}));
router.use((req, res, next) => {
  if (req.originalUrl.length > 1024) return res.status(400).json({success: false, message: 'Consulta demasiado extensa.'});
  return next();
});
router.get('/', safeHandler(req => listDirectory(req.query)));
router.get('/filters', safeHandler(req => {
  exact(req.query, []);
  return {locations: directoryLocations};
}));
router.get('/:publicId', safeHandler(req => {
  exact(req.query, []);
  return getPublicProfile(req.params.publicId);
}));
router.get('/:publicId/photo/:photoId', safeHandler(async (req, res) => {
  exact(req.query, []);
  const buffer = await getPublicPhoto(req.params.publicId, req.params.photoId);
  res.set({'Content-Type': 'image/webp', 'Content-Length': String(buffer.length)});
  res.end(req.method === 'HEAD' ? undefined : buffer);
}));
router.use(safeHandler(() => { throw fail('Perfil o fotografía no disponible.', 404); }));
export default router;
