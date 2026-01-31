#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const DEFAULT_ENDPOINT = 'https://photos-api.vegvisr.org/list-r2-images';
const DEFAULT_THRESHOLD = 5;
const DEFAULT_CONCURRENCY = 6;

const parseArgs = () => {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 1) {
    const raw = process.argv[i];
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (value !== undefined) {
      args.set(key, value);
    } else {
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.set(key, next);
        i += 1;
      } else {
        args.set(key, 'true');
      }
    }
  }
  return args;
};

const args = parseArgs();
const endpoint = args.get('endpoint') || DEFAULT_ENDPOINT;
const threshold = Number(args.get('threshold') || DEFAULT_THRESHOLD);
const concurrency = Number(args.get('concurrency') || DEFAULT_CONCURRENCY);
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity;
const output = args.get('output') || path.join('scripts', 'duplicate-report.json');

const hammingDistance = (a, b) => {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
};

const hashImage = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const pixels = await sharp(buffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  let hash = 0n;
  let bit = 63n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << bit;
      }
      bit -= 1n;
    }
  }
  return hash;
};

const withConcurrency = async (items, limitCount, handler) => {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: limitCount }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      results.push(await handler(item));
    }
  });
  await Promise.all(workers);
  return results;
};

const main = async () => {
  console.log(`🔍 Fetching image list from ${endpoint}`);
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`List failed (${res.status})`);
  }
  const data = await res.json();
  const images = Array.isArray(data?.images) ? data.images : [];
  const sliced = images.slice(0, Number.isFinite(limit) ? limit : images.length);
  console.log(`🧮 Hashing ${sliced.length} images (threshold=${threshold})...`);

  const hashes = [];
  let processed = 0;
  await withConcurrency(sliced, concurrency, async (image) => {
    const thumbUrl = `${image.url}?w=64&h=64&fit=crop&auto=format`;
    const hash = await hashImage(thumbUrl);
    hashes.push({ ...image, hash });
    processed += 1;
    if (processed % 50 === 0 || processed === sliced.length) {
      console.log(`✅ Hashed ${processed}/${sliced.length}`);
    }
  });

  const duplicates = [];
  for (let i = 0; i < hashes.length; i += 1) {
    const current = hashes[i];
    for (let j = 0; j < i; j += 1) {
      const other = hashes[j];
      const distance = hammingDistance(current.hash, other.hash);
      if (distance <= threshold) {
        duplicates.push({
          keyA: other.key,
          urlA: other.url,
          keyB: current.key,
          urlB: current.url,
          distance
        });
      }
    }
  }

  const summary = {
    total: hashes.length,
    threshold,
    duplicates: duplicates.length
  };

  const report = { summary, duplicates };
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(`📝 Report saved to ${output}`);
  console.log(`🔁 Duplicate pairs found: ${duplicates.length}`);
};

main().catch((error) => {
  console.error('❌ Duplicate scan failed:', error);
  process.exit(1);
});
