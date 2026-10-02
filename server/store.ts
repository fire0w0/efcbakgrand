import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Database } from '../src/shared/contracts';
import { config } from './config';

export function readSeed(): Database {
  return JSON.parse(readFileSync('data/seed.json', 'utf8')) as Database;
}

// One process only. Dev 1 must keep each read/validate/write mutation synchronous.
export function openStore() {
  const path = resolve(config.dataFile);
  if (path === resolve('data/seed.json')) throw new Error('DATA_FILE cannot overwrite the seed');
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(readSeed(), null, 2) + '\n');
  return {
    read: (): Database => JSON.parse(readFileSync(path, 'utf8')) as Database,
    write: (db: Database): void => {
      writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2) + '\n');
      renameSync(`${path}.tmp`, path);
    },
  };
}
