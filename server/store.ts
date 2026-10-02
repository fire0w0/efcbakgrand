import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Database } from '../src/shared/contracts';
import { config } from './config';

export function readSeed(): Database {
  return JSON.parse(readFileSync('data/seed.json', 'utf8')) as Database;
}

// One process only. Dev 1 must keep each read/validate/write mutation synchronous.
export function openStore(dataFile = config.dataFile) {
  const path = resolve(dataFile);
  const seedPath = realpathSync('data/seed.json');
  const canonical = existsSync(path) ? realpathSync(path) : path;
  const compare = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (compare(canonical) === compare(seedPath)) throw new Error('DATA_FILE cannot overwrite the seed');
  mkdirSync(dirname(path), { recursive: true });
  const write = (db: Database): void => {
    try {
      writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2) + '\n', { flush: true });
      renameSync(`${path}.tmp`, path);
    } finally {
      rmSync(`${path}.tmp`, { force: true });
    }
  };
  if (!existsSync(path)) write(readSeed());
  return {
    read: (): Database => JSON.parse(readFileSync(path, 'utf8')) as Database,
    write,
  };
}
