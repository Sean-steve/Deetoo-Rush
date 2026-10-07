import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RestaurantCard } from "../../apps/customer/src/components/RestaurantCard";
import { customerProgressStage } from "../../apps/customer/src/components/CustomerJourney";
import {
  instructionFor,
  runStage,
} from "../../apps/rider/src/components/RiderRun";

test("Customer delivery progress compresses backend states into a clear five-step story", () => {
  assert.equal(customerProgressStage("PLACED"), "confirmed");
  assert.equal(customerProgressStage("PREPARING"), "preparing");
  assert.equal(customerProgressStage("PREPARING", "ASSIGNED"), "collecting");
  assert.equal(customerProgressStage("PREPARING", "EN_ROUTE"), "on_way");
  assert.equal(customerProgressStage("COMPLETED", "DELIVERED"), "delivered");
});

test("Rider cockpit presents one dominant instruction for every active milestone", () => {
  assert.equal(runStage("ASSIGNED"), "restaurant");
  assert.equal(runStage("ARRIVED_PICKUP"), "pickup");
  assert.equal(runStage("EN_ROUTE"), "customer");
  assert.equal(runStage("DELIVERED"), "complete");

  assert.match(instructionFor("ASSIGNED").title, /restaurant/i);
  assert.match(instructionFor("ARRIVED_PICKUP").title, /collect/i);
  assert.match(instructionFor("EN_ROUTE").title, /customer/i);
  assert.match(instructionFor("ARRIVED_DROPOFF").title, /handover/i);
});

test("Restaurant discovery prioritizes food context without inventing ratings or delivery ETA", () => {
  const html = renderToStaticMarkup(
    React.createElement(RestaurantCard, {
      restaurant: {
        branch_id: "branch-1",
        merchant_id: "merchant-1",
        merchant_name: "DeeToo Kitchen",
        branch_name: "Westlands",
        categories: ["Burgers", "Chicken"],
        category_ids: ["burgers", "chicken"],
        address_text: "Westlands",
        city: "Nairobi",
        latitude: -1.2683,
        longitude: 36.8044,
        distance_km: 1.4,
        min_order_minor: 50000,
        currency: "KES",
        prep_default_min: 20,
        open_status: "OPEN",
        is_open_now: true,
        is_busy: false,
        status_badge_text: "Open",
        opening_hours: [],
        serviceable: true,
      },
      onSelect: () => {},
    }),
  );

  assert.match(html, /DeeToo Kitchen/);
  assert.match(html, /Burgers · Chicken/);
  assert.match(html, /~20 min prep/);
  assert.match(html, /1.4 km away/);
  assert.doesNotMatch(html, /rating/i);
  assert.doesNotMatch(html, /delivery ETA/i);
});
