/**
 * Phase 4 release-blocking STAGING acceptance. Read-only: does not make real orders,
 * capture money, message customers, close disputes or change configurations.
 *
 * Required: DEETOO_STAGING_API_URL, DEETOO_STAGING_MERCHANT_TOKEN,
 * DEETOO_STAGING_CUSTOMER_TOKEN, DEETOO_STAGING_RIDER_TOKEN,
 * DEETOO_STAGING_ADMIN_TOKEN, DEETOO_STAGING_BRANCH_ID.
 *
 * Optional: DEETOO_STAGING_FOREIGN_BRANCH_ID for cross-tenant checks.
 * Never echo tokens, cookies, PII or response JSON.
 */
const required=[
 "DEETOO_STAGING_API_URL","DEETOO_STAGING_MERCHANT_TOKEN","DEETOO_STAGING_CUSTOMER_TOKEN",
 "DEETOO_STAGING_RIDER_TOKEN","DEETOO_STAGING_ADMIN_TOKEN","DEETOO_STAGING_BRANCH_ID"
] as const;
const missing=required.filter(k=>!process.env[k]);
if(missing.length){
 console.error("BLOCKED: staging acceptance needs "+missing.join(", "));
 process.exitCode=2;
}else{
 const base=process.env.DEETOO_STAGING_API_URL!.replace(/\/$/,"");
 const host=new URL(base);
 if(host.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(host.hostname))
   throw new Error("Staging API must use HTTPS outside localhost");
 const branch=encodeURIComponent(process.env.DEETOO_STAGING_BRANCH_ID!);
 const actors={
  merchant:process.env.DEETOO_STAGING_MERCHANT_TOKEN!,
  customer:process.env.DEETOO_STAGING_CUSTOMER_TOKEN!,
  rider:process.env.DEETOO_STAGING_RIDER_TOKEN!,
  admin:process.env.DEETOO_STAGING_ADMIN_TOKEN!,
 } as const;
 type Actor=keyof typeof actors;
 type Result={actor:Actor;route:string;expected:number;actual:number;pass:boolean};
 const checks:Result[]=[];
 async function check(actor:Actor,path:string,expected:number){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  let actual=0;
  try{
   const res=await fetch(base+path,{headers:{Authorization:"Bearer "+actors[actor],Accept:"application/json"},
    signal:controller.signal,redirect:"error"});
   actual=res.status;
  }catch{actual=0;}finally{clearTimeout(timer);}
  checks.push({actor,route:path,expected,actual,pass:actual===expected});
 }
 await check("merchant","/auth/me",200);
 await check("merchant","/merchant/branches",200);
 await check("merchant","/merchant/orders?branch_id="+branch+"&limit=5",200);
 await check("merchant","/merchant/experience/orders/history?branch_id="+branch+"&limit=5",200);
 await check("merchant","/merchant/experience/orders/metrics?branch_id="+branch,200);
 await check("merchant","/merchant/experience/branches/"+branch+"/inventory",200);
 await check("merchant","/merchant/team",200);
 await check("merchant","/merchant/experience/help/articles",200);
 await check("merchant","/merchant/inbox?limit=5",200);
 await check("merchant","/auth/sessions",200);
 await check("merchant","/finance/merchant/experience/overview?branch_id="+branch,200);
 await check("merchant","/finance/merchant/experience/transactions?branch_id="+branch+"&limit=5",200);
 await check("merchant","/support/cases",200);
 await check("merchant","/merchant/experience/providers/readiness",200);
 await check("customer","/customer/addresses",200);
 await check("admin","/admin/orders",200);
 await check("rider","/auth/me",200);
 await check("merchant","/admin/orders",403);
 await check("customer","/merchant/branches",403);
 await check("rider","/finance/merchant/experience/overview?branch_id="+branch,403);
 const foreign=process.env.DEETOO_STAGING_FOREIGN_BRANCH_ID;
 if(foreign){
  const bid=encodeURIComponent(foreign);
  await check("merchant","/merchant/experience/orders/history?branch_id="+bid,403);
  await check("merchant","/finance/merchant/experience/overview?branch_id="+bid,403);
 }else{
  console.warn("NOT VERIFIED: cross-tenant denied reads (set DEETOO_STAGING_FOREIGN_BRANCH_ID)");
 }
 for(const item of checks){
  console.log((item.pass?"PASS":"FAIL")+" "+item.actor+" "+item.route+" HTTP "+item.actual+
   " (expected "+item.expected+")");
 }
 const failures=checks.filter(x=>!x.pass);
 console.log("Stage read/authorization checks: "+(checks.length-failures.length)+"/"+checks.length);
 if(failures.length){process.exitCode=1;}
 else if(!foreign){process.exitCode=2;}
 else{console.log("READ-ONLY ACCEPTANCE PASS. This does NOT certify money movement, maps, messaging or KRA/eTIMS.");}
}
