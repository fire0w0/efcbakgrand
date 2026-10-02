import test from 'node:test';
import assert from 'node:assert/strict';
import { readSeed } from '../../server/store';

test('backend seed loads (Dev 1 extends this suite)', () => {
  assert.equal(readSeed().customers.length, 50);
});
