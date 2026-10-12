import {test} from "node:test";
import assert from "node:assert/strict";
import {orderDisplayId,paymentDisplayId,refundDisplayId,recordDisplayId} from "../../apps/admin-web-next/src/record-display";
import {printableOrderHtml} from "../../apps/admin-web-next/src/print-order";
test("public order code is preferred; UUID remains the authoritative API identifier",()=>{
 const id="e6b7c58c-2064-4178-9b8a-3adc96d1e686";
 assert.equal(orderDisplayId({id,publicCode:"DT-2026-001"}),"#DT-2026-001");
 assert.equal(orderDisplayId({id}),"#DT-E6B7C58C-E686");
 assert.equal(recordDisplayId(id,"DT"),"#DT-E6B7C58C-E686");
 assert.equal(paymentDisplayId({id,reference:"MPE9ABCD"}),"#MPE9ABCD");
 assert.equal(paymentDisplayId({id,reference:id}),"#PAY-E6B7C58C-E686");
 assert.equal(refundDisplayId(id),"#REF-E6B7C58C-E686");
});
test("print report is scoped to selected order and escapes untrusted content",()=>{
 const order={id:"e6b7c58c-2064-4178-9b8a-3adc96d1e686",publicCode:"DT-2026-001",
 merchant:"Test <script>alert(1)</script>",customer:"Njeri & Company",
 pickup:{name:"Kitchen",county:"Nairobi",lat:-1.27,lng:36.82},destination:{name:"Delivery",county:"Nairobi",lat:-1.29,lng:36.8},
 createdAt:"2026-10-12T10:00:00Z",status:"PREPARING",subtotal:200,deliveryFee:50,serviceFee:10,
 paymentMethod:"M-PESA",paymentStatus:"Paid",
 items:[{name:"<img src=x onerror=alert(1)>",qty:2,price:100}],
 history:[{at:"2026-10-12T10:00:00Z",event:"Placed",by:"System",detail:"Order received"}],
 } as any;
 const html=printableOrderHtml(order);
 assert.ok(html.includes("#DT-2026-001"));
 assert.ok(html.includes("Njeri &amp; Company"));
 assert.ok(html.includes("&lt;script&gt;"));
 assert.ok(!html.includes("<script>"));
 assert.ok(!html.includes("<img src=x"));
 assert.ok(html.includes("Full reference"));
 assert.ok(!html.includes("dn-sidebar"));
});
