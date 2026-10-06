const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function renderIcons() {
  const root = path.resolve(__dirname, '..');
  const source = await fs.readFile(path.join(root, 'icon.svg'));
  if (/<image\b/i.test(source.toString())) {
    throw new Error('icon.svg must contain vector artwork, not an embedded raster image');
  }
  for (const size of [180, 192, 512]) {
    // Rasterize the vector at 4x the target size, then downsample for smooth edges.
    await sharp(source, { density: 72 * size * 4 / 1024 })
      .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
      .png()
      .toFile(path.join(root, `icon-${size}-v2.png`));
  }
}
renderIcons().catch(error => { console.error(error); process.exitCode = 1; });
