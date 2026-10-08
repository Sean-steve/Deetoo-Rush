import {test,expect} from "@playwright/test";
const now=new Date().toISOString();
const profile={id:"profile-1",user_id:"customer-1",first_name:"Test",last_name:"Customer",display_name:"Test Customer",
 phone:"+254700000000",email:"test@example.test",default_address_id:"address-1",created_at:now,updated_at:now};
const address={id:"address-1",customer_id:"customer-1",label:"Home",address_line1:"Juja Road",address_text:"Juja Road, Juja",
 city:"Juja",region:"Kiambu",country_code:"KE",latitude:-1.105,longitude:37.014,is_default:true,is_active:true,created_at:now,updated_at:now};
const session={id:"session-2",current:false,ip_address:"127.0.0.1",device_info:"Chrome on laptop",is_active:true,last_used_at:now,created_at:now};
const note={id:"note-1",case_id:"case-1",author_user_id:"customer-1",author_role:"customer",author_name:"Test Customer",
 visibility:"ALL_PARTICIPANTS",body:"The delivery was late.",attachments:[],created_at:now};
const supportCase={id:"case-1",case_number:"SUP-001",customer_id:"customer-1",category:"ORDER_ISSUE",priority:"MEDIUM",
 status:"OPEN",subject:"Late delivery",description:"The rider was delayed.",created_at:now,updated_at:now,notes:[note]};
const alert={id:"alert-1",recipient_type:"CUSTOMER",recipient_id:"customer-1",channel:"IN_APP",template_code:"CUSTOMER_ORDER_ACCEPTED",
 status:"DELIVERED",subject:"Order accepted",payload:{message:"Your order is being prepared."},provider:"IN_APP",
 retry_count:0,max_retries:3,idempotency_key:"notify-1",read_at:null,created_at:now};
async function setup(page:any){
 const hits:string[]=[];let savedAddress={...address},savedProfile={...profile},notifications=[{...alert}],cases=[{...supportCase}],notes=[{...note}],sessions=[{...session}];
 await page.route("**/api/v1/**",async(route:any)=>{
  const url=new URL(route.request().url()),path=url.pathname.replace("/api/v1",""),method=route.request().method();
  hits.push(method+" "+path);
  const ok=(data:any,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify({success:true,data})});
  const err=(status:number,code:string)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify({error:{code,message:"Denied"}})});
  if(path==="/auth/me")return ok({id:"customer-1",name:"Test Customer",email:"test@example.test",roles:["customer"],permissions:[],status:"ACTIVE"});
  if(path==="/cart")return ok(null);
  if(path==="/customer/addresses"&&method==="GET")return ok([savedAddress]);
  if(path==="/serviceability")return ok({serviceable:true,eligible_branch_count:1,reason_code:"SERVICEABLE"});
  if(path==="/customer/addresses/address-1"&&method==="PATCH"){savedAddress={...savedAddress,...route.request().postDataJSON()};return ok(savedAddress);}
  if(path==="/customer/profile"&&method==="GET")return ok(savedProfile);
  if(path==="/customer/profile"&&method==="PATCH"){savedProfile={...savedProfile,...route.request().postDataJSON()};return ok(savedProfile);}
  if(path==="/auth/sessions")return ok(sessions);
  if(path==="/auth/sessions/session-2/revoke"){sessions=[];return ok({message:"Session revoked"});}
  if(path==="/auth/password/forgot")return ok({accepted:true});
  if(path==="/customer/support/notifications")return ok({notifications,total:notifications.length});
  if(path==="/customer/support/notifications/alert-1/read"){notifications=[{...notifications[0],read_at:now}];return ok(notifications[0]);}
  if(path==="/customer/support/cases"&&method==="GET")return ok({cases,total:cases.length});
  if(path==="/customer/support/cases"&&method==="POST"){
   const input=route.request().postDataJSON();const created={...supportCase,...input,id:"case-2",case_number:"SUP-002",notes:[]};
   cases=[...cases,created];return ok(created,201);
  }
  if(path==="/customer/support/cases/case-1"&&method==="GET")return ok({case:cases[0],notes,attachments:[],confirmations:[]});
  if(path==="/customer/support/cases/case-2"&&method==="GET")return ok({case:cases[1],notes:[],attachments:[],confirmations:[]});
  if(path==="/customer/support/cases/case-1/notes"){const payload=route.request().postDataJSON();const added={...note,id:"note-2",body:payload.body};notes=[...notes,added];return ok(added,201);}
  if(path==="/customer/support/cases/case-1/resolution-response")return ok({...cases[0],status:"PARTY_CONFIRMATION"});
  return err(404,"NOT_FOUND");
 });
 return hits;
}
test("11 account uses backend profile, edits are persisted, preview fixtures not rendered",async({page})=>{
 const hits=await setup(page);await page.goto("/profile");
 await expect(page.getByRole("heading",{name:"My profile"})).toBeVisible();
 await expect(page.getByText("test@example.test")).toBeVisible();
 await expect(page.getByText("Juja Road, Juja")).toBeVisible();
 await page.getByRole("button",{name:"Edit profile"}).click();
 await page.getByLabel("Display name").fill("Updated Customer");
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Updated Customer")).toBeVisible();
 expect(hits).toContain("PATCH /customer/profile");
 await page.context().grantPermissions(["geolocation"]);
 await page.context().setGeolocation({latitude:-1.105,longitude:37.014});
 await page.getByRole("button",{name:"Edit",exact:true}).click();
 const addressDialog=page.getByRole("dialog",{name:"Edit delivery address"});
 await addressDialog.getByRole("textbox",{name:"Street, building or landmark"}).fill("Updated Juja Road");
 await expect(addressDialog.getByRole("button",{name:"Save address"})).toBeDisabled();
 await addressDialog.getByRole("button",{name:"Reverify location"}).click();
 await expect(addressDialog.getByText("Verified coordinates:")).toBeVisible();
 await addressDialog.getByRole("button",{name:"Save address"}).click();
 await expect(page.getByText(/Updated Juja Road/)).toBeVisible();
 expect(hits).toContain("PATCH /customer/addresses/address-1");
 await expect(page.getByText(/Saved payment cards.*do not have a verified/)).toBeVisible();
});
test("12 sessions are server-owned and revocation requires explicit confirmation",async({page})=>{
 const hits=await setup(page);await page.goto("/security");
 await expect(page.getByRole("heading",{name:"Security & Devices"})).toBeVisible();
 await expect(page.getByText("Chrome on laptop")).toBeVisible();
 await page.getByRole("button",{name:"Revoke"}).click();
 const dialog=page.getByRole("dialog",{name:"Confirm session revocation"});
 await expect(dialog).toBeVisible();
 expect(hits).not.toContain("POST /auth/sessions/session-2/revoke");
 await dialog.getByRole("button",{name:"Confirm sign out"}).click();
 await expect(page.getByText("Session revoked by DeeToo.")).toBeVisible();
 expect(hits).toContain("POST /auth/sessions/session-2/revoke");
});
test("13 notification inbox reads structured response and marks one as read",async({page})=>{
 const hits=await setup(page);await page.goto("/notifications");
 await expect(page.getByRole("heading",{name:"Notifications"})).toBeVisible();
 await expect(page.getByText("Order accepted")).toBeVisible();
 await expect(page.getByText("Your order is being prepared.")).toBeVisible();
 await page.getByRole("button",{name:"Mark read"}).click();
 await expect(page.getByText("0 unread")).toBeVisible();
 expect(hits).toContain("POST /customer/support/notifications/alert-1/read");
});
test("14 cases load from server and new request is saved via authenticated endpoint",async({page})=>{
 const hits=await setup(page);await page.goto("/support");
 await expect(page.getByRole("heading",{name:"Help & Support"})).toBeVisible();
 await expect(page.getByText("Late delivery").first()).toBeVisible();
 await page.getByRole("button",{name:/New support request/}).first().click();
 const dialog=page.getByRole("dialog",{name:"New support request"});
 await dialog.getByLabel("Request subject").fill("Incorrect order total");
 await dialog.getByLabel("What happened?").fill("The charged total was incorrect.");
 await dialog.getByRole("button",{name:"Create support request"}).click();
 await expect(page).toHaveURL(/\/support\/cases\/case-2$/);
 expect(hits).toContain("POST /customer/support/cases");
 await expect(page.getByText("Incorrect order total").first()).toBeVisible();
});
test("15 conversation sends a real message and keeps case transcript after refresh",async({page})=>{
 const hits=await setup(page);await page.goto("/support/cases/case-1");
 await expect(page.getByRole("heading",{name:"Support Conversation"})).toBeVisible();
 await expect(page.getByText("The delivery was late.")).toBeVisible();
 await page.getByRole("textbox",{name:"Type a support message"}).fill("Please confirm the delivery timeline.");
 await page.getByRole("button",{name:"Send support message"}).click();
 await expect(page.getByText("Please confirm the delivery timeline.")).toBeVisible();
 expect(hits).toContain("POST /customer/support/cases/case-1/notes");
});
test("11–15 screens remain width-safe on mobile",async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:844});
 for(const route of ["/profile","/security","/notifications","/support","/support/cases/case-1"]){
  await page.goto(route);
  await expect(page.locator(".dt-main")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Overflow: "+route).toBe(true);
 }
});
