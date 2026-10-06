const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

module.exports = async function renderFavicon(source, root, name) {
  const {width,height} = await sharp(source).metadata();
  if (width !== height || width < 1024) throw new Error('Native high-resolution source required');
  const sizes = [16,32,48], blocks = [];
  for (const size of sizes) {
    const rgba = await sharp(source).resize(size,size,{withoutEnlargement:true,kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
    const maskStride = Math.ceil(size/32)*4;
    const dib = Buffer.alloc(40 + size*size*4 + maskStride*size);
    dib.writeUInt32LE(40,0); dib.writeInt32LE(size,4); dib.writeInt32LE(size*2,8);
    dib.writeUInt16LE(1,12); dib.writeUInt16LE(32,14); dib.writeUInt32LE(size*size*4,20);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const src=(y*size+x)*4, dst=40+((size-1-y)*size+x)*4;
      dib[dst]=rgba[src+2];dib[dst+1]=rgba[src+1];dib[dst+2]=rgba[src];dib[dst+3]=rgba[src+3];
    }
    blocks.push(dib);
  }
  const header=Buffer.alloc(6+16*sizes.length);
  header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  sizes.forEach((size,i)=>{const p=6+i*16;header[p]=size;header[p+1]=size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(blocks[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=blocks[i].length;});
  const ico=Buffer.concat([header,...blocks]);
  await fs.writeFile(path.join(root,`favicon-${name}-20261007f.ico`),ico);
  await fs.writeFile(path.join(root,'favicon.ico'),ico);
  await sharp(source).resize(32,32,{withoutEnlargement:true,kernel:'lanczos3'}).png().toFile(path.join(root,`favicon-${name}-32-20261007f.png`));
};
