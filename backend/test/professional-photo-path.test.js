import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import sharp from 'sharp';

test('D2 photo child processes raster safely from a repository path with spaces and special characters',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'psicopanel photo # \u00e9 '));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  // Relocate actual source and resolve the installed dependencies without copying
  // native binaries or substituting the worker/process launcher under test.
  await fs.cp(fileURLToPath(new URL('../src/',import.meta.url)),path.join(root,'src'),{recursive:true});
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({type:'module'}));
  await fs.symlink(fileURLToPath(new URL('../node_modules/',import.meta.url)),path.join(root,'node_modules'),'junction');
  const moduleURL=pathToFileURL(path.join(root,'src/modules/professional/professional.photos.js'));
  const workerURL=new URL('./photo-worker.js',moduleURL);
  await fs.access(fileURLToPath(workerURL));
  assert.match(workerURL.pathname,/%20/);
  assert.match(workerURL.pathname,/%23/);
  assert.match(workerURL.pathname,/%C3%A9/);
  const {processImage}=await import(moduleURL.href);
  const {safeHandler}=await import(new URL('./professional.core.js',moduleURL).href);

  for(const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']]){
    const input=await sharp({create:{width:24,height:16,channels:3,background:'red'}}).withMetadata().toFormat(format).toBuffer();
    const output=await processImage(input,mime);
    const metadata=await sharp(output).metadata();
    assert.equal(metadata.format,'webp');
    assert.equal(metadata.width,24);
    assert.equal(metadata.height,16);
    for(const key of ['exif','xmp','icc'])assert.equal(metadata[key],undefined);
    for(const [bytes,declared] of [[input,'image/not-real'],[input.subarray(0,Math.floor(input.length/2)),mime]]){
      await assert.rejects(processImage(bytes,declared),{status:400,message:'Imagen inválida, excesiva o no permitida.'});
    }
  }
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const excessive=await sharp({create:{width:4097,height:2,channels:3,background:'white'}}).png().toBuffer();
  await assert.rejects(processImage(excessive,'image/png'),{status:400,message:'Imagen inválida, excesiva o no permitida.'});
  const response={headersSent:false,status(code){this.code=code;return this;},json(body){this.body=body;}};
  await safeHandler(()=>processImage(svg,'image/png'))({},response);
  assert.equal(response.code,400);
  assert.deepEqual(response.body,{success:false,message:'Imagen inválida, excesiva o no permitida.'});
  assert.doesNotMatch(JSON.stringify(response.body),/psicopanel photo|%20|ENOENT|photo-worker|sharp|stack/);
});
