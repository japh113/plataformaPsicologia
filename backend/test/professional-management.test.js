import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import {resolveRestrictedSecret} from '../src/config/security.js';
import {signRestrictedToken,verifyRestrictedToken,validateRestrictedSession} from '../src/modules/auth/restricted-session.js';
import {verifyAuthToken} from '../src/modules/auth/auth.service.js';
import {directPayload,proposalPayload,decimal,decisionPayload} from '../src/modules/professional/professional.validators.js';
import {photoPath,processImage} from '../src/modules/professional/professional.photos.js';
import sharp from 'sharp';
const restrictedKey='D2-unit-ONLY-independent-7831924-SyntheticKey!';
test('D2 configuration has no ordinary-key fallback or shared-key mode',()=>{
  assert.equal(resolveRestrictedSecret({},'ordinary'),'');
  for(const key of ['',env.jwtSecret,'short','x'.repeat(64)])assert.throws(()=>resolveRestrictedSecret({D2_ENABLED:'true',RESTRICTED_JWT_SECRET:key},env.jwtSecret));
  assert.equal(resolveRestrictedSecret({D2_ENABLED:'true',RESTRICTED_JWT_SECRET:restrictedKey},env.jwtSecret),restrictedKey);
});
test('D2 restricted JWT isolates signature, issuer, audience, algorithm, purpose and expiry',()=>{
  env.d2Enabled=true;env.restrictedJwtSecret=restrictedKey;
  const user={id:'fictional',role:'psychologist',isActive:true,psychologistStatus:'pending_review',sessionVersion:2};
  const token=signRestrictedToken(user),claims=verifyRestrictedToken(token);
  assert.equal(claims.exp-claims.iat,600);assert.equal('email'in claims,false);assert.equal('role'in claims,false);
  assert.throws(()=>verifyAuthToken(token));
  const base={sub:user.id,sv:2,jti:'fixture',purpose:'professional-status'};
  const make=(values={},options={},key=restrictedKey)=>jwt.sign({...base,...values},key,{algorithm:'HS256',issuer:'psicopanel',audience:'professional-status',expiresIn:600,header:{typ:'professional-status+jwt'},...options});
  for(const token of [make({}, {}, env.jwtSecret),make({}, {issuer:'other'}),make({}, {audience:'ordinary'}),make({purpose:'ordinary'}),make({}, {algorithm:'HS384'}),make({}, {expiresIn:-1}),jwt.sign(base,restrictedKey,{algorithm:'HS256',issuer:'psicopanel',audience:'professional-status',header:{typ:'professional-status+jwt'}}),make({}, {header:{typ:'JWT'}})])assert.throws(()=>verifyRestrictedToken(token));
  validateRestrictedSession(user,claims);
  assert.throws(()=>validateRestrictedSession({...user,sessionVersion:3},claims));
  for(const psychologistStatus of ['active',null,'unknown'])assert.throws(()=>validateRestrictedSession({...user,psychologistStatus},claims));
  assert.throws(()=>validateRestrictedSession({...user,isActive:false},claims));
  assert.throws(()=>verifyRestrictedToken(jwt.sign({sub:user.id,sv:2},env.jwtSecret)));
  for(const field of ['aud','iss','purpose'])assert.throws(()=>verifyAuthToken(jwt.sign({sub:user.id,sv:2,[field]:'contradictory'},env.jwtSecret)));
  const local=env.localDevelopment;env.localDevelopment=false;
  assert.throws(()=>signRestrictedToken({...user,id:'u_psy_pending_1'}));env.localDevelopment=local;
  env.d2Enabled=false;
});
test('D2 strict field contracts reject protected assignment, unknown fields and unsafe BIGINT',()=>{
  for(const key of ['ownerId','is_public','isPublic','acceptsNewPatients','approvedCredentialVersion','professionalName','row_version'])assert.throws(()=>directPayload({rowVersion:'0',[key]:'x'}));
  for(const value of [0,-1,'01','1.5','9223372036854775807',null])assert.throws(()=>decimal(value));
  assert.equal(decimal('9007199254740993'),'9007199254740993');
  assert.throws(()=>directPayload({rowVersion:'0',description:'x'.repeat(2001)}));
  assert.throws(()=>proposalPayload({rowVersion:'0',approved:true}));
  assert.throws(()=>decisionPayload({rowVersion:'0',outcome:'approved',ownerMessage:'',evidenceReference:'arbitrary',evidenceSupported:false}));
  assert.throws(()=>photoPath('/private','../../public'));
});
test('D2 decoder rewrites raster and strips metadata, rejects spoofing, truncation, SVG and excessive pixels',async()=>{
  for(const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']]){
    const input=await sharp({create:{width:24,height:16,channels:3,background:'red'}}).withMetadata().toFormat(format).toBuffer();
    const output=await processImage(input,mime),metadata=await sharp(output).metadata();
    assert.equal(metadata.format,'webp');assert.equal(metadata.width,24);assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
    await assert.rejects(processImage(input,'image/not-real'));
    await assert.rejects(processImage(input.subarray(0,Math.floor(input.length/2)),mime));
  }
  await assert.rejects(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/png'));
  const huge=await sharp({create:{width:4097,height:2,channels:3,background:'white'}}).png().toBuffer();await assert.rejects(processImage(huge,'image/png'));
  const pixels=await sharp({create:{width:4096,height:4096,channels:3,background:'white'}}).png().toBuffer();await assert.rejects(processImage(pixels,'image/png'));
  const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
  const chunk=Buffer.alloc(20);chunk.writeUInt32BE(8);chunk.write('acTL',4);await assert.rejects(processImage(Buffer.concat([png.subarray(0,8),chunk,png.subarray(8)]),'image/png'));
});
