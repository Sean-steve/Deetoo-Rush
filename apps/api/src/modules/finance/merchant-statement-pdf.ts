/** Dependency-free, reproducible one-or-more-page PDF for merchant settlement statements.
 * This document explicitly is NOT a KRA/eTIMS tax invoice.
 */
const ascii=(value:unknown)=>String(value??"").normalize("NFKD").replace(/[^\x20-\x7e]/g,"?");
const escapePdf=(s:string)=>ascii(s).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").slice(0,155);
const money=(value:unknown,currency="KES")=>{
  const n=BigInt(String(value??"0")),abs=n<0n?-n:n;
  return currency+" "+(n<0n?"-":"")+String(abs/100n)+"."+String(abs%100n).padStart(2,"0");
};
export type StatementLine={entry_type:string;reference_id:string;gross_amount_minor:unknown;commission_amount_minor:unknown;net_amount_minor:unknown};
export type Statement={settlement_number:string;currency:string;merchant_id:string;period_start:string;period_end:string;status:string;gross_order_value_minor:unknown;commission_amount_minor:unknown;refund_amount_minor:unknown;net_settlement_amount_minor:unknown};
export function renderMerchantSettlementPdf(statement:Statement,items:StatementLine[]):Buffer{
  const c=ascii(statement.currency||"KES");
  const lines=[
    "DeeToo Merchant Settlement Statement",
    "NOT A TAX INVOICE - No KRA/eTIMS invoice has been issued by this file",
    "Statement: "+statement.settlement_number,
    "Merchant: "+statement.merchant_id,
    "Period: "+String(statement.period_start).slice(0,10)+" to "+String(statement.period_end).slice(0,10),
    "Settlement status: "+statement.status,
    "Gross order value: "+money(statement.gross_order_value_minor,c),
    "Commission: "+money(statement.commission_amount_minor,c),
    "Refund adjustments: "+money(statement.refund_amount_minor,c),
    "Net merchant settlement: "+money(statement.net_settlement_amount_minor,c),
    " ",
    "ORDER / REFERENCE | GROSS | COMMISSION | NET",
    ...items.map(x=>[x.entry_type+" "+x.reference_id, money(x.gross_amount_minor,c),
      money(x.commission_amount_minor,c),money(x.net_amount_minor,c)].join(" | ")),
    " ",
    "All figures are ledger-derived in minor currency units.",
    "Disbursement is confirmed only by a verified provider callback."
  ];
  const chunks:string[][]=[];for(let i=0;i<lines.length;i+=43)chunks.push(lines.slice(i,i+43));
  const objects:string[]=["",""];
  objects[0]="<< /Type /Catalog /Pages 2 0 R >>";
  const pageIds=chunks.map((_,i)=>4+2*i);
  objects[1]="<< /Type /Pages /Kids ["+pageIds.map(i=>i+" 0 R").join(" ")+"] /Count "+chunks.length+" >>";
  objects[2]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for(let i=0;i<chunks.length;i++){
    const pageNumber=pageIds[i], contentNumber=pageNumber+1;
    objects[pageNumber-1]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents "+contentNumber+" 0 R >>";
    const commands=["BT","/F1 10 Tf","12 TL","42 751 Td",
      ...chunks[i].flatMap((line,j)=>[(j===0?"":"T*"),"("+escapePdf(line)+") Tj"].filter(Boolean)),
      "ET"].join("\n");
    objects[contentNumber-1]="<< /Length "+Buffer.byteLength(commands,"latin1")+" >>\nstream\n"+commands+"\nendstream";
  }
  let pdf="%PDF-1.4\n%DEETOO\n";
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(Buffer.byteLength(pdf,"latin1"));
    pdf+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xrefStart=Buffer.byteLength(pdf,"latin1");
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xrefStart+"\n%%EOF\n";
  return Buffer.from(pdf,"latin1");
}
