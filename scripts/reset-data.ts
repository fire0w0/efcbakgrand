import { openStore, readSeed } from '../server/store';
openStore().write(readSeed());
console.log('Local demo data reset from the frozen seed.');
