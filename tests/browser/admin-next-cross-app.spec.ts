import {test,expect} from "@playwright/test";

const CUSTOMER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MERCHANT="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const staff={data:{id:USER,email:"super.admin@example.test",name:"Test Super Admin",roles:["super_admin"],status:"ACTIVE"}};

test("Admin creates a real support conversation for a verified customer ID, without impersonating the party",async({page})=>{
 let submitted:Record<string,unknown>|null=null;
 await page.route("**/api/v1/**",async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  let data:unknown={data:[]},code=200;
  if(p==="/api/v1/auth/me")data=staff;
  else if(p==="/api/v1/admin/customers")data={data:[{user_id:CUSTOMER,name:"Verified Test Customer",email:"test.customer@example.test",phone_e164:"+254711123123",status:"ACTIVE"}]};
  else if(p==="/api/v1/admin/support/cases"&&route.request().method()==="POST"){
   submitted=route.request().postDataJSON();code=201;data={data:{id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",status:"OPEN"}};
  }else if(p==="/api/v1/operations/support/cases")data={data:{cases:[],total:0}};
  await route.fulfill({status:code,contentType:"application/json",body:JSON.stringify(data)});
 });
 await page.goto("/#/support");
 await expect(page.getByText("Live DeeToo backend")).toBeVisible();
 await page.getByRole("button",{name:/New Case/}).click();
 await expect(page.getByLabel("Verified participant")).toBeVisible();
 await page.getByLabel("Verified participant").selectOption(CUSTOMER);
 await page.getByPlaceholder("What is the issue?").fill("Order handover question");
 await page.getByLabel("Case description").fill("Customer requested an investigation of their handover.");
 await page.getByRole("button",{name:"Open case",exact:true}).click();
 await expect.poll(()=>submitted).not.toBeNull();
 expect(submitted).toMatchObject({customer_id:CUSTOMER,category:"OTHER",subject:"Order handover question"});
 expect(submitted).not.toHaveProperty("participantName");
 await expect(page.getByRole("button",{name:"Simulate Participant Reply"})).toHaveCount(0);
});

test("Super Admin creates a pending merchant owner from verified onboarding fields",async({page})=>{
 let submitted:Record<string,unknown>|null=null;
 await page.route("**/api/v1/**",async route=>{
  const p=new URL(route.request().url()).pathname;
  let data:unknown={data:[]},status=200;
  if(p==="/api/v1/auth/me")data=staff;
  if(p==="/api/v1/admin/governance/provision"&&route.request().method()==="POST"){
   submitted=route.request().postDataJSON();status=201;data={data:{user:{id:CUSTOMER,status:"PENDING"},resource:{id:MERCHANT}}};
  }
  await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
 });
 await page.goto("/#/merchants");
 await expect(page.getByText("Live DeeToo backend")).toBeVisible();
 await page.getByRole("button",{name:/Add Merchant/}).click();
 await page.getByLabel("Registered legal business name").fill("Registered Test Kitchen Limited");
 await page.getByLabel("Business name",{exact:true}).fill("Test Kitchen");
 await page.getByLabel("Owner", {exact:true}).fill("Merchant Owner");
 await page.getByLabel("Email",{exact:true}).fill("merchant.owner@example.test");
 await page.getByLabel("Phone",{exact:true}).fill("+254700111222");
 await page.getByRole("button",{name:"Create merchant"}).click();
 await expect.poll(()=>submitted).not.toBeNull();
 expect(submitted).toMatchObject({subject_type:"MERCHANT",name:"Merchant Owner",merchant_display_name:"Test Kitchen",merchant_legal_name:"Registered Test Kitchen Limited"});
 expect(submitted).not.toHaveProperty("activate_immediately");
});
