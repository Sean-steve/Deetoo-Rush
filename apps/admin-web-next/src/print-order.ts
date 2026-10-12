import type {Order} from "./data";
import {orderDisplayId} from "./record-display";
import {formatMoney} from "./data";
const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Print a standalone, user-selected order report—not the entire Admin UI. */
export function printableOrderHtml(order:Order):string{
 const itemRows=order.items.map(it=>`<tr><td>${escape(it.name)}</td><td>${it.qty}</td><td>${escape(formatMoney(it.qty*it.price))}</td></tr>`).join("");
 const timeline=order.history.map(h=>`<li><b>${escape(h.event)}</b> — ${escape(new Date(h.at).toLocaleString("en-KE"))}: ${escape(h.detail)}</li>`).join("");
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DeeToo Order ${escape(orderDisplayId(order))}</title><style>body{font:14px system-ui,sans-serif;color:#202d28;max-width:780px;margin:30px auto;padding:12px}h1{font-size:24px;margin-bottom:0}small{color:#62756b}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:24px 0}table{width:100%;border-collapse:collapse;margin:15px 0}th,td{text-align:left;border-bottom:1px solid #d8e3de;padding:12px 6px}.total{font-size:18px;text-align:right}li{margin:8px 0}@media print{body{margin:0;max-width:none;padding:0}@page{margin:15mm}}</style></head><body>
 <header><h1>DeeToo Rush · Order ${escape(orderDisplayId(order))}</h1><small>Order report · ${escape(new Date().toLocaleString("en-KE",{timeZone:"Africa/Nairobi"}))} EAT</small></header>
 <section class="meta"><div><b>Status</b><br>${escape(order.status)}</div><div><b>Placed</b><br>${escape(order.createdAt)}</div><div><b>Merchant</b><br>${escape(order.merchant)}<br>${escape(order.pickup.name)}</div><div><b>Customer</b><br>${escape(order.customer)}<br>${escape(order.destination.name)}</div><div><b>Payment</b><br>${escape(order.paymentMethod)} · ${escape(order.paymentStatus)}</div><div><b>Full reference</b><br><small>${escape(order.id)}</small></div></section>
 <h2>Order items</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table>
 <p class="total"><b>Grand total: ${escape(formatMoney(order.subtotal+order.deliveryFee+order.serviceFee))}</b></p>
 <h2>Recorded timeline</h2>${timeline?`<ol>${timeline}</ol>`:"<p>No timeline events available.</p>"}
 <footer><small>Generated from the selected DeeToo order record. Not a payment receipt or tax invoice.</small></footer></body></html>`;
}
export function printSelectedOrder(order:Order):boolean{
 const win=window.open("","_blank","width=870,height=780");
 if(!win)return false;
 win.opener=null;
 win.document.open();win.document.write(printableOrderHtml(order));
 // Attach before close(): about:blank can emit its load event synchronously.
 win.addEventListener("load",()=>{win.focus();win.print();},{once:true});
 win.document.close();
 return true;
}
