import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyDocuments, emptyRegistration, emptyVehicle,
  kes, validIdentity, validKenyanPhone, validateDocuments,
  validateRegistration, validateVehicle, requiresDrivingLicence,
} from '../../apps/rider-android/src/preview/phase1-model';

test('Rider preview accepts Kenyan contact formats and email identities', () => {
  assert.equal(validKenyanPhone('0712 345 678'), true);
  assert.equal(validKenyanPhone('0112345678'), true);
  assert.equal(validKenyanPhone('+254712345678'), true);
  assert.equal(validKenyanPhone('0700000'), false);
  assert.equal(validIdentity('rider@example.co.ke'), true);
  assert.equal(validIdentity('broken@'), false);
});

test('Rider registration requires emergency contact and personal information', () => {
  assert.match(validateRegistration(emptyRegistration) || '', /name/);
  const valid = {
    ...emptyRegistration, fullName: 'Jane Wanjiku', phone: '0712345678',
    email: 'jane@example.com', nationalId: '12345678',
    dateOfBirth: '1998-05-14', county: 'Nairobi', address: 'Westlands',
    emergencyName: 'John Kamau', emergencyPhone: '0723456789',
  };
  assert.equal(validateRegistration(valid), null);
  assert.match(validateRegistration({ ...valid, emergencyPhone: valid.phone }) || '', /different/);
});

test('Document staging varies with transport type', () => {
  const staged = { ...emptyDocuments, idFront: true, idBack: true, selfie: true };
  assert.equal(validateDocuments(staged, 'Bicycle'), null);
  assert.equal(requiresDrivingLicence('Bicycle'), false);
  assert.match(validateDocuments(staged, 'Motorcycle') || '', /licence/);
  assert.equal(validateDocuments({ ...staged, licence: true }, 'Motorcycle'), null);
});

test('Vehicle and equipment gates are vehicle-specific and mock only', () => {
  assert.match(validateVehicle(emptyVehicle) || '', /registration/);
  const bicycle = { ...emptyVehicle, type: 'Bicycle' as const, make: 'Giant', model: 'Escape', deliveryBag: true };
  assert.equal(validateVehicle(bicycle), null);
  const bike = {
    ...emptyVehicle, registrationNumber: 'KDG 123A', make: 'Bajaj',
    model: 'Boxer', logbook: true, insurance: true,
    deliveryBag: true, helmet: true, reflectiveVest: true,
  };
  assert.equal(validateVehicle(bike), null);
  assert.match(validateVehicle({ ...bike, helmet: false }) || '', /helmet/);
});

test('Presentation amounts are clearly formatted in Kenyan shillings', () => {
  assert.equal(kes(2450), 'KSh 2,450');
});
