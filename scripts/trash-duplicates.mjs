#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ENDPOINT = 'https://photos-api.vegvisr.org/delete-r2-image';

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
const reportPath = args.get('report') || path.join('scripts', 'duplicate-report.json');
const endpoint = args.get('endpoint') || DEFAULT_ENDPOINT;
const apply = args.get('apply') === 'true' || args.get('apply') === '1';
const keep = (args.get('keep') || 'a').toLowerCase();

const loadReport = async () => {
  const raw = await fs.readFile(reportPath, 'utf8');
  return JSON.parse(raw);
};

const buildDeleteList = (duplicates, keepSide) => {
  const deletions = new Map();
  for (const pair of duplicates) {
    const deleteKey = keepSide === 'a' ? pair.keyB : pair.keyA;
    if (!deleteKey) continue;
    deletions.set(deleteKey, pair);
  }
  return Array.from(deletions.keys());
};

const deleteKey = async (key) => {
  const url = `${endpoint}?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Delete failed (${res.status})`);
  }
  return res.json();
};

const main = async () => {
  const report = await loadReport();
  const duplicates = Array.isArray(report?.duplicates) ? report.duplicates : [];
  if (duplicates.length === 0) {
    console.log('No duplicates in report.');
    return;
  }

  const targets = buildDeleteList(duplicates, keep);
  console.log(`Found ${targets.length} unique delete targets (keep=${keep}).`);

  if (!apply) {
    console.log('Dry run only. Use --apply to move to trash.');
    targets.slice(0, 20).forEach((key) => console.log(`- ${key}`));
    if (targets.length > 20) {
      console.log(`... ${targets.length - 20} more`);
    }
    return;
  }

  let success = 0;
  for (const key of targets) {
    try {
      await deleteKey(key);
      success += 1;
      console.log(`🗑️  Trashed: ${key}`);
    } catch (error) {
      console.error(`Failed to trash ${key}:`, error.message || error);
    }
  }

  console.log(`Done. Trashed ${success}/${targets.length} files.`);
};

main().catch((error) => {
  console.error('❌ Trash duplicates failed:', error);
  process.exit(1);
});
