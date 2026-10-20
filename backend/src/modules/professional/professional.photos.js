import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import env from '../../config/env.js';
import {transaction,lockProfessional,expectVersion,fail} from './professional.core.js';
import {decimal,exact} from './professional.validators.js';
const MiB=1024*1024;
let processing=false;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const privateRoot=async()=>{
  const root=env.professionalMediaRoot;
  if(!root||!path.isAbsolute(root))throw fail('Almacenamiento privado no configurado.',503);
  const stat=await fs.lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(root)!==path.resolve(root) ||
    (process.getuid && (stat.uid!==process.getuid() || (stat.mode & 0o077)!==0)) ||
    /(?:^|[\\/])(public|src)(?:[\\/]|$)/i.test(root))throw fail('Almacenamiento privado no disponible.',503);
  return root;
};
export const photoPath=(root,key)=>{if(!uuid.test(key))throw fail('Fotografía no disponible.',404);return path.join(root,key+'.webp');};
export const processImage=(input,mime)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=64',new URL('./photo-worker.js',import.meta.url).pathname,mime],{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH}});
  const chunks=[];let size=0,done=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');},8000);
  const end=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
  child.on('error',()=>end(fail('No se pudo procesar la imagen.',503)));
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>MiB)child.kill('SIGKILL');else chunks.push(chunk);});
  child.on('close',code=>end(code===0&&size>0&&size<=MiB?null:fail('Imagen inválida, excesiva o no permitida.',400),Buffer.concat(chunks)));
  child.stdin.on('error',()=>{});child.stdin.end(input);
});
// Dimensions come from a second decode rather than trusting a WebP header variant.
const processedMetadata=async buffer=>{const {default:sharp}=await import('sharp');const result=await sharp(buffer).metadata();return {width:result.width,height:result.height};};
export const uploadPhoto=async req=>{
  const expected=decimal(req.headers['if-match']);
  const mime=req.headers['content-type'];if(!['image/jpeg','image/png','image/webp'].includes(mime)||req.headers['content-encoding'])throw fail('Formato de subida no permitido.',415);
  await transaction(async client=>expectVersion(await lockProfessional(client,req.user),expected));
  const root=await privateRoot();
  if(processing)throw fail('Procesamiento ocupado. Reintenta después.',429);
  processing=true;let photo;
  const intakeDeadline=setTimeout(()=>req.destroy(),10000);
  try{
    const chunks=[];let size=0;
    req.setTimeout(10000,()=>req.destroy());
    for await(const chunk of req){size+=chunk.length;if(size>5*MiB)throw fail('La imagen supera 5 MiB.',413);chunks.push(chunk);}
    clearTimeout(intakeDeadline);
    const output=await processImage(Buffer.concat(chunks),mime),meta=await processedMetadata(output);
    photo=await transaction(async client=>{
      const profile=await lockProfessional(client,req.user);expectVersion(profile,expected);
      // Serialize reservations across owners/processes without taking another account lock.
      await client.query('SELECT pg_advisory_xact_lock(728194607)');
      const quota=(await client.query(`SELECT COALESCE(sum(byte_size),0)::text AS total,COALESCE(sum(byte_size) FILTER(WHERE owner_user_id=$1),0)::text AS own,count(*)::int AS count FROM professional_photographs`,[req.user.id])).rows[0];
      if(BigInt(quota.total)+BigInt(output.length)>64n*BigInt(MiB)||BigInt(quota.own)+BigInt(output.length)>8n*BigInt(MiB)||quota.count>=256)throw fail('Cuota privada alcanzada; no se eliminan fotografías históricas automáticamente.',409);
      return (await client.query(`INSERT INTO professional_photographs(owner_user_id,version,processed_mime,byte_size,width,height)
        SELECT $1,COALESCE(max(version),0)+1,'image/webp',$2,$3,$4 FROM professional_photographs WHERE owner_user_id=$1 RETURNING *`,[req.user.id,output.length,meta.width,meta.height])).rows[0];
    });
    const file=await fs.open(photoPath(root,photo.storage_key),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{await file.writeFile(output);await file.sync();}finally{await file.close();}
    return await transaction(async client=>{
      const profile=await lockProfessional(client,req.user);expectVersion(profile,expected);
      const ready=await client.query("UPDATE professional_photographs SET status='ready' WHERE id=$1 AND owner_user_id=$2 AND status='staged' RETURNING id",[photo.id,req.user.id]);
      if(!ready.rowCount)throw fail('Carga no vigente.',409);
      await client.query('UPDATE professional_publication_profiles SET current_photo_id=$2,row_version=row_version+1 WHERE owner_user_id=$1',[req.user.id,photo.id]);
      if(profile.current_photo_id)await client.query("UPDATE professional_photographs SET status='retired' WHERE id=$1",[profile.current_photo_id]);
      return {id:photo.id,rowVersion:String(BigInt(profile.row_version)+1n)};
    });
  }catch(error){
    // Preserve metadata and any final orphan; never delete accepted/historical files.
    if(photo)try{await transaction(async client=>{await lockProfessional(client,req.user);await client.query("UPDATE professional_photographs SET status='retired' WHERE id=$1 AND status='staged'",[photo.id]);});}catch{/* quarantined staged reservation remains private and counts towards quota */}
    throw error;
  }finally{clearTimeout(intakeDeadline);processing=false;}
};
export const getPhoto=async(req,res)=>{
  const buffer=await transaction(async client=>{
    const profile=await lockProfessional(client,req.user);if(!profile?.current_photo_id)throw fail('Fotografía no disponible.',404);
    const photo=(await client.query("SELECT * FROM professional_photographs WHERE id=$1 AND owner_user_id=$2 AND status='ready'",[profile.current_photo_id,req.user.id])).rows[0];
    if(!photo)throw fail('Fotografía no disponible.',404);
    const file=await fs.open(photoPath(await privateRoot(),photo.storage_key),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const stat=await file.stat();if(!stat.isFile()||stat.size!==Number(photo.byte_size)||stat.size>MiB)throw fail('Fotografía no disponible.',404);return await file.readFile();}finally{await file.close();}
  });
  res.set({'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(buffer);
};
export const retirePhoto=(actor,body)=>{
  exact(body,['rowVersion']);decimal(body.rowVersion);return transaction(async client=>{
    const profile=await lockProfessional(client,actor);expectVersion(profile,body.rowVersion);
    await client.query('UPDATE professional_publication_profiles SET current_photo_id=NULL,row_version=row_version+1 WHERE owner_user_id=$1',[actor.id]);
    if(profile.current_photo_id)await client.query("UPDATE professional_photographs SET status='retired' WHERE id=$1",[profile.current_photo_id]);
    return {rowVersion:String(BigInt(profile.row_version)+1n)};
  });
};
export const recoverUploads=(actor,body)=>{
  exact(body,['rowVersion']);decimal(body.rowVersion);return transaction(async client=>{
    const profile=await lockProfessional(client,actor);expectVersion(profile,body.rowVersion);
    await client.query("UPDATE professional_photographs SET status='retired' WHERE owner_user_id=$1 AND status='staged'",[actor.id]);
    await client.query('UPDATE professional_publication_profiles SET row_version=row_version+1 WHERE owner_user_id=$1',[actor.id]);
    return {rowVersion:String(BigInt(profile.row_version)+1n)};
  });
};
