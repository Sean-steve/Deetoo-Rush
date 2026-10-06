import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button,
  FormField,
  Input,
  Modal,
  Price,
  DataTable,
  Drawer,
  FilterChip,
  InlineBanner,
  ProgressBar,
  Surface,
} from "../../packages/ui/src/index";
import { StatusBadge } from "../../packages/ui/src/workflows";
import { normalizeUXError } from "../../packages/ui/src/errors";

test("Stitch forms associate labels and errors with their input", () => {
  const html = renderToStaticMarkup(
    React.createElement(FormField, {
      label: "Phone",
      error: "Invalid phone",
      id: "phone",
      children: React.createElement(Input),
    }),
  );
  assert.match(html, /for="phone"/);
  assert.match(html, /id="phone"/);
  assert.match(html, /aria-describedby="phone-message"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /role="alert"/);
});
test("Loading buttons block duplicate submission while explicit submit remains supported", () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { type: "submit", isLoading: true }, "Pay"),
  );
  assert.match(html, /type="submit"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(
    renderToStaticMarkup(React.createElement(Button, null, "Open")),
    /type="button"/,
  );
});
test("Money presentation preserves minor-unit cents", () => {
  assert.match(
    renderToStaticMarkup(React.createElement(Price, { minor: 125050 })),
    /1,250\.50/,
  );
});
test("Unknown backend states remain visible without inventing transitions", () => {
  assert.match(
    renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "AWAITING_PROVIDER_REVIEW" }),
    ),
    /awaiting provider review/,
  );
});
test("Closed dialogs do not render focusable fields", () => {
  assert.equal(
    renderToStaticMarkup(
      React.createElement(Modal, {
        isOpen: false,
        onClose: () => {},
        title: "Edit",
        children: React.createElement(Input),
      }),
    ),
    "",
  );
});


test("Phase 1 surfaces expose explicit density and variants", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Surface,
      { density: "dense", variant: "raised", interactive: true },
      "Operations",
    ),
  );
  assert.match(html, /data-density="dense"/);
  assert.match(html, /deetoo-surface-raised/);
  assert.match(html, /data-interactive="true"/);
});

test("Filter chips expose pressed selection semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(FilterChip, { selected: true, count: 4 }, "Open"),
  );
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /deetoo-chip-count/);
});

test("Progress bars expose bounded accessible values", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProgressBar, {
      value: 72,
      max: 100,
      label: "On-time delivery",
      showValue: true,
    }),
  );
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="72"/);
  assert.match(html, /72%/);
});

test("DataTable preserves semantic headers and row content", () => {
  const html = renderToStaticMarkup(
    React.createElement(DataTable<any>, {
      rows: [{ id: "1", name: "Westlands", status: "OPEN" }],
      rowKey: (row: any) => row.id,
      columns: [
        { key: "name", label: "Zone" },
        { key: "status", label: "Status" },
      ],
    }),
  );
  assert.match(html, /<th[^>]*scope="col"/);
  assert.match(html, /Westlands/);
  assert.match(html, /OPEN/);
});

test("Closed drawers do not render interactive content", () => {
  assert.equal(
    renderToStaticMarkup(
      React.createElement(Drawer, {
        isOpen: false,
        onClose: () => {},
        title: "Details",
        children: React.createElement(Button, null, "Act"),
      }),
    ),
    "",
  );
});

test("Inline danger banners use alert semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(InlineBanner, { kind: "danger" }, "Payment failed"),
  );
  assert.match(html, /role="alert"/);
});

test("Internal backend codes are normalized to human-safe messaging", () => {
  const result = normalizeUXError({
    status: 503,
    error: {
      code: "DURABLE_STORAGE_REQUIRED",
      message: "Durable storage is unavailable for this operation",
      request_id: "req-123",
    },
  });
  assert.notEqual(result.message, "Durable storage is unavailable for this operation");
  assert.equal(result.retryable, true);
  assert.equal(result.referenceId, "req-123");
});
