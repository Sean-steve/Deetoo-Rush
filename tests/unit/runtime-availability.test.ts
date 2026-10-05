import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerLocationSelector } from '../../apps/customer/src/components/CustomerLocationSelector';

test('location availability requires a backend result', () => {
  const props = {
    currentAddressText: 'Selected address', currentCoords: { latitude: 0, longitude: 0 },
    savedAddresses: [], onSelectAddress() {}, onSelectPresetCoords() {},
    onAddNewAddress() {}, isAuthenticated: false,
  };
  const render = (serviceability: any) => renderToStaticMarkup(React.createElement(CustomerLocationSelector, { ...props, serviceability }));
  const unknown = render(null);
  assert.match(unknown, /Availability unconfirmed/);
  assert.doesNotMatch(unknown, /Zone Active|Outside Zone/);
  assert.match(render({ serviceable: false }), /Outside Zone/);
  assert.match(render({ serviceable: true }), /Zone Active/);
});
