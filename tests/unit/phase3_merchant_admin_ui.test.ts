import { test } from "node:test";
import assert from "node:assert/strict";
import { kitchenTiming } from "../../apps/merchant/src/components/KitchenOrders";
import { supportProgressStage } from "../../apps/admin/src/components/SupportCaseConsole";
import {
  blockerLabels,
  readinessCount,
} from "../../apps/admin/src/components/MerchantOnboardingPipeline";
import { geometryPolygons } from "../../apps/admin/src/components/GeographyControl";
import { adminViews } from "../../apps/admin/src/components/adminViews";

const baseOrder = {
  id: "order-1",
  order_number: "D2-1001",
  created_at: "2026-10-07T00:00:00.000Z",
  updated_at: "2026-10-07T00:00:00.000Z",
} as any;

test("Merchant kitchen timing makes response age and ready targets visually actionable", () => {
  const now = new Date("2026-10-07T00:06:00.000Z").getTime();

  assert.deepEqual(
    kitchenTiming({ ...baseOrder, status: "PLACED" }, now),
    {
      label: "Waiting 6m",
      detail: "Response age",
      tone: "overdue",
      minutes: 6,
    },
  );

  const preparing = kitchenTiming(
    {
      ...baseOrder,
      status: "PREPARING",
      estimated_ready_at: "2026-10-07T00:04:00.000Z",
    },
    now,
  );
  assert.equal(preparing.tone, "overdue");
  assert.equal(preparing.label, "2m past target");

  const ready = kitchenTiming(
    {
      ...baseOrder,
      status: "READY",
      ready_at: "2026-10-07T00:00:00.000Z",
    },
    now,
  );
  assert.equal(ready.tone, "warning");
  assert.equal(ready.label, "Ready 6m");
});

test("Support case progress preserves conversation, resolution, confirmation and closure", () => {
  assert.equal(supportProgressStage("OPEN"), "opened");
  assert.equal(supportProgressStage("WAITING_RIDER"), "conversation");
  assert.equal(supportProgressStage("RESOLUTION_PROPOSED"), "resolution");
  assert.equal(supportProgressStage("DISPUTED"), "confirmation");
  assert.equal(supportProgressStage("CLOSED"), "closed");
});

test("Merchant onboarding readiness exposes exact activation blockers", () => {
  const readiness = {
    branch_ready: true,
    menu_ready: false,
    staff_ready: true,
    commercial_ready: false,
    payout_ready: true,
  };
  assert.equal(readinessCount(readiness), 3);
  assert.deepEqual(blockerLabels(readiness), [
    "Menu & content",
    "Commercial terms",
  ]);

  const ready = {
    branch_ready: true,
    menu_ready: true,
    staff_ready: true,
    commercial_ready: true,
    payout_ready: true,
  };
  assert.equal(readinessCount(ready), 5);
  assert.deepEqual(blockerLabels(ready), []);
});

test("Service-zone visualizer accepts authoritative Polygon and MultiPolygon GeoJSON", () => {
  assert.equal(
    geometryPolygons({
      type: "Polygon",
      coordinates: [
        [
          [36.8, -1.3],
          [36.9, -1.3],
          [36.9, -1.2],
          [36.8, -1.3],
        ],
      ],
    }).length,
    1,
  );

  assert.equal(
    geometryPolygons({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [36.8, -1.3],
            [36.81, -1.3],
            [36.8, -1.3],
          ],
        ],
        [
          [
            [36.9, -1.2],
            [36.91, -1.2],
            [36.9, -1.2],
          ],
        ],
      ],
    }).length,
    2,
  );
});

test("Core Admin operation tables use server-backed filters", () => {
  assert.ok(adminViews.orders.filters?.some((filter) => filter.key === "status"));
  assert.ok(
    adminViews.dispatch.filters?.some(
      (filter) => filter.param === "attention_required",
    ),
  );
  assert.ok(
    adminViews.payments.filters?.some(
      (filter) => filter.key === "reconciliation_status",
    ),
  );
  assert.ok(
    adminViews.incidents.filters?.some(
      (filter) => filter.key === "severity",
    ),
  );
});
