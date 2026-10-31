// Convert the selected, unchanged artwork to the formats required by Windows.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  const directory = path.join(__dirname, '..', 'assets', 'icon');
  const source = nativeImage.createFromPath(path.join(directory, 'floatdeck-source.png'));
  if (source.isEmpty()) throw new Error('The selected icon artwork is missing');
  const { width, height } = source.getSize();
  const bitmap = source.toBitmap();
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) throw new Error('The selected artwork is empty');
  // Trim only excess transparent margin, leaving comfortable optical padding.
  const edge = Math.min(width, height, Math.ceil(Math.max(right - left + 1, bottom - top + 1) / 0.84));
  const crop = source.crop({
    x: Math.max(0, Math.min(width - edge, Math.round((left + right + 1 - edge) / 2))),
    y: Math.max(0, Math.min(height - edge, Math.round((top + bottom + 1 - edge) / 2))),
    width: edge, height: edge
  });
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map(size => crop.resize({ width: size, height: size, quality: 'best' }).toPNG());
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  fs.writeFileSync(path.join(directory, 'floatdeck.ico'), Buffer.concat([header, ...images]));
  fs.writeFileSync(path.join(directory, 'floatdeck-256.png'), images.at(-1));
  console.log(JSON.stringify({ source: { width, height }, artworkBounds: { left, top, right, bottom }, iconSizes: sizes }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
