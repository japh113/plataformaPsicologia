// Dedicated process: no database, credentials, network requests or paths from input.
import sharp from 'sharp';
const chunks=[];let size=0;
try{
  for await(const chunk of process.stdin){size+=chunk.length;if(size>5*1024*1024)throw new Error('size');chunks.push(chunk);}
  const input=Buffer.concat(chunks);
  const png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=input[0]===255&&input[1]===216&&input[2]===255;
  const webp=input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP';
  if(!png&&!jpeg&&!webp)throw new Error('format');
  // APNG may be decoded as a still by some libraries. Reject its control chunk.
  if(png){for(let offset=8;offset+12<=input.length;){const length=input.readUInt32BE(offset);if(offset+12+length>input.length)throw new Error('truncated');
    if(input.toString('ascii',offset+4,offset+8)==='acTL')throw new Error('animation');offset+=12+length;}}
  if(webp){for(let offset=12;offset+8<=input.length;){const length=input.readUInt32LE(offset+4);if(input.toString('ascii',offset,offset+4)==='ANIM')throw new Error('animation');offset+=8+length+(length%2);}}
  const options={failOn:'warning',limitInputPixels:16000000};
  const metadata=await sharp(input,options).metadata();
  if(metadata.format!==(png?'png':jpeg?'jpeg':'webp') || metadata.width>4096 || metadata.height>4096 || (metadata.pages||1)>1 || metadata.delay)throw new Error('dimensions');
  if(process.argv[2]!==`image/${metadata.format}`)throw new Error('mime');
  const result=await sharp(input,options).autoOrient().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').webp({quality:80}).toBuffer();
  if(result.length>1024*1024)throw new Error('output');
  const out=await sharp(result).metadata();
  if(out.width>1024||out.height>1024||out.exif||out.xmp||out.icc)throw new Error('metadata');
  process.stdout.write(result);
}catch{process.exitCode=1;}
