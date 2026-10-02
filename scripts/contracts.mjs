import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('docs/CONTRACTS.md', 'utf8');
const match = source.match(/<!-- TYPES:START -->\s*```typescript\r?\n([\s\S]*?)```\s*<!-- TYPES:END -->/);
if (!match) throw new Error('CONTRACTS.md must contain exactly one marked TypeScript block.');
const output = '// GENERATED from docs/CONTRACTS.md. Do not edit directly.\n' + match[1].replace(/\r\n/g, '\n');
if (process.argv.includes('--check')) {
  if (readFileSync('src/shared/contracts.ts', 'utf8').replace(/\r\n/g, '\n') !== output) {
    throw new Error('Shared types drifted. Agree on CONTRACTS.md, then npm run contracts:generate.');
  }
  console.log('Contract mirror matches.');
} else {
  writeFileSync('src/shared/contracts.ts', output);
}
