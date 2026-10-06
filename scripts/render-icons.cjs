const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function renderIcons() {
  const root = path.resolve(__dirname, '..');
  const source = await fs.readFile(path.join(root, 'branding/terminology-master.png'));
  const metadata = await sharp(source).metadata();
  if (metadata.width !== metadata.height || metadata.width < 1024) {
    throw new Error('Artwork must be square and at least 1024px; upscaling is not allowed');
  }
  for (const size of [180, 192, 512]) {
    await sharp(source)
      .resize(size, size, { kernel: 'lanczos3', withoutEnlargement: true })
      .png()
      .toFile(path.join(root, `icon-${size}-v2.png`));
  }
  await require('./render-favicon.cjs')(source, root, 'terminology');
  // Compatibility SVG wraps the original high-resolution artwork, not a vector recreation.
  await fs.writeFile(path.join(root, 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${metadata.width} ${metadata.height}" role="img" aria-label="ZERO ONE TERMINOLOGY"><image width="${metadata.width}" height="${metadata.height}" href="data:image/png;base64,${source.toString('base64')}"/></svg>\n`);
}
renderIcons().catch(error => { console.error(error); process.exitCode = 1; });
