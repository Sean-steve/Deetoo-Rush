import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMinorUnits, fromMinorUnits, addMoney, multiplyBasisPoints, formatKES } from '../../packages/utils/src/index';

test('Money arithmetic enforces integer minor units without floating point', () => {
  const wholeKES = 1500;
  const minor = toMinorUnits(wholeKES);
  assert.equal(minor, 150000);
  assert.equal(fromMinorUnits(minor), 1500);

  // Addition of integer cents
  const total = addMoney(minor, 24000); // KES 1500 + KES 240
  assert.equal(total, 174000);

  // Formatting
  assert.equal(formatKES(total), 'KES 1,740');

  // Commission basis points (20% = 2000 bps)
  const commission = multiplyBasisPoints(minor, 2000);
  assert.equal(commission, 30000); // KES 300
});

test('Money arithmetic throws error if floating point is passed', () => {
  assert.throws(() => {
    addMoney(1500.5, 200);
  }, /Financial math violation/);
});
