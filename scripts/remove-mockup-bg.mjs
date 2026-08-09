import sharp from 'sharp';
import { rename, unlink } from 'node:fs/promises';

const THRESHOLD = 28;
const paths = [
  'public/guest-portal-mockup.png',
  'public/website/guest-portal-mockup.png',
];

function isBackground(r, g, b) {
  return r <= THRESHOLD && g <= THRESHOLD && b <= THRESHOLD;
}

async function processImage(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      const i = (y * width + x) * 4;
      if (isBackground(data[i], data[i + 1], data[i + 2])) queue.push(x, y);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [0, width - 1]) {
      const i = (y * width + x) * 4;
      if (isBackground(data[i], data[i + 1], data[i + 2])) queue.push(x, y);
    }
  }

  while (queue.length > 0) {
    const y = queue.pop();
    const x = queue.pop();
    const idx = y * width + x;
    if (visited[idx]) continue;

    const i = idx * 4;
    if (!isBackground(data[i], data[i + 1], data[i + 2])) continue;

    visited[idx] = 1;
    data[i + 3] = 0;

    if (x > 0) queue.push(x - 1, y);
    if (x < width - 1) queue.push(x + 1, y);
    if (y > 0) queue.push(x, y - 1);
    if (y < height - 1) queue.push(x, y + 1);
  }

  const tempPath = `${filePath}.tmp.png`;

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(tempPath);

  await unlink(filePath).catch(() => {});
  await rename(tempPath, filePath);

  console.log(`Processed ${filePath}`);
}

for (const filePath of paths) {
  await processImage(filePath);
}
