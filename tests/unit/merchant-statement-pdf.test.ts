import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMerchantSettlementPdf } from '../../apps/api/src/modules/finance/merchant-statement-pdf';

const example={
  settlement_number:'STL-20261009-1234',currency:'KES',
  merchant_id:'00000000-0000-4000-8000-000000000001',
  period_start:'2026-10-01T00:00:00Z',period_end:'2026-10-08T00:00:00Z',
  status:'APPROVED',gross_order_value_minor:450000,commission_amount_minor:45000,
  refund_amount_minor:2500,net_settlement_amount_minor:402500
};
test('downloadable settlement PDF has valid object offsets, financial totals, pagination and a non-tax disclaimer',()=>{
 const lines=Array.from({length:95},(_,n)=>({entry_type:'ORDER',reference_id:'DT-'+n,
   gross_amount_minor:10000,commission_amount_minor:1000,net_amount_minor:9000}));
 const pdf=renderMerchantSettlementPdf(example,lines);
 const text=pdf.toString('latin1');
 assert.ok(text.startsWith('%PDF-1.4'));
 assert.ok(text.includes('NOT A TAX INVOICE'));
 assert.ok(text.includes('KES 4500.00'));
 assert.equal((text.match(/\/Type \/Page /g)||[]).length,3);
 assert.ok(text.endsWith('%%EOF\n'));
 const xref=Number(text.match(/startxref\n(\d+)/)?.[1]);
 assert.equal(text.slice(xref,xref+4),'xref');
 const offsets=[...text.matchAll(/(\d{10}) 00000 n /g)].map(m=>Number(m[1]));
 for(let i=0;i<offsets.length;i++) assert.ok(text.slice(offsets[i]).startsWith((i+1)+' 0 obj\n'),'object '+(i+1));
});
test('PDF content escapes adversarial filename/ref text without breaking stream',()=>{
 const pdf=renderMerchantSettlementPdf({...example,settlement_number:'A(\x5c)B'},[{entry_type:'ORDER',
   reference_id:'(javascript:)\\',gross_amount_minor:1,commission_amount_minor:0,net_amount_minor:1}]);
 assert.ok(pdf.toString('latin1').includes('A\\(\\\\\\)B'));
 assert.ok(pdf.toString('latin1').startsWith('%PDF-1.4'));
});
