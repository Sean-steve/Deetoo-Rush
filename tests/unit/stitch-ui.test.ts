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
} from "../../packages/ui/src/index";
import { StatusBadge } from "../../packages/ui/src/workflows";

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
