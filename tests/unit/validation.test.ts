import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MoneySchema,
  PhoneE164Schema,
  GeoPointSchema,
  OrderAcceptSchema,
} from '../../packages/validation/src/index';

test('PhoneE164Schema validates E.164 phone formats', () => {
  // Valid Kenyan numbers in E.164
  assert.equal(PhoneE164Schema.safeParse('+254712345678').success, true);
  assert.equal(PhoneE164Schema.safeParse('+254799999999').success, true);

  // Invalid formats without + or improper length
  assert.equal(PhoneE164Schema.safeParse('0712345678').success, false);
  assert.equal(PhoneE164Schema.safeParse('254712345678').success, false);
  assert.equal(PhoneE164Schema.safeParse('not-a-number').success, false);
});

test('GeoPointSchema validates latitude and longitude coordinates', () => {
  // Valid Nairobi coordinates
  assert.equal(GeoPointSchema.safeParse({ lat: -1.2864, lng: 36.8172 }).success, true);

  // Out of bounds
  assert.equal(GeoPointSchema.safeParse({ lat: 100, lng: 36.8172 }).success, false);
  assert.equal(GeoPointSchema.safeParse({ lat: -1.2864, lng: 200 }).success, false);
});

test('OrderAcceptSchema enforces preparation minutes range (1 - 180)', () => {
  assert.equal(OrderAcceptSchema.safeParse({ preparation_minutes: 20 }).success, true);
  assert.equal(OrderAcceptSchema.safeParse({ preparation_minutes: 0 }).success, false);
  assert.equal(OrderAcceptSchema.safeParse({ preparation_minutes: 240 }).success, false);
});
