import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {platformRoleCan} from "../../apps/api/src/modules/merchant/merchant-role-policy.service";
import {mediaRepository} from "../../apps/api/src/modules/media/media.repository";
import {catalogueImageUrl,validateCatalogueImageForItem,publicCatalogueImageRedirect} from "../../apps/api/src/modules/media/catalogue-image";

test("Staff can update assigned branch food availability but never edit menu details",()=>{
 assert.equal(platformRoleCan("merchant_staff","MENU_AVAILABILITY_WRITE"),true);
 assert.equal(platformRoleCan("merchant_staff","MENU_WRITE"),false);
 assert.equal(platformRoleCan("merchant_staff","BRANCH_WRITE"),false);
 assert.equal(platformRoleCan("merchant_manager","MENU_AVAILABILITY_WRITE"),true);
 assert.equal(platformRoleCan("merchant_owner","MENU_AVAILABILITY_WRITE"),true);
});

test("Verified food photo must belong to the editor and the right merchant or food item",async()=>{
 const owner=randomUUID(),other=randomUUID(),merchant=randomUUID(),item=randomUUID();
 const id=randomUUID(),now=new Date().toISOString();
 await mediaRepository.create({id,owner_user_id:owner,purpose:"MERCHANT_IMAGE",reference_type:"MENU_DRAFT",
  reference_id:merchant,bucket:"test",object_key:"private/test",content_type:"image/webp",
  byte_size:null,status:"REQUESTED",created_at:now,updated_at:now});
 const url=catalogueImageUrl(id);
 await assert.rejects(validateCatalogueImageForItem(url,owner,merchant),(e:any)=>e.code==="MENU_IMAGE_FORBIDDEN");
 await mediaRepository.markVerified(id,{byteSize:17});
 await validateCatalogueImageForItem(url,owner,merchant);
 await assert.rejects(validateCatalogueImageForItem(url,other,merchant),(e:any)=>e.code==="MENU_IMAGE_FORBIDDEN");
 await assert.rejects(validateCatalogueImageForItem(url,owner,other),(e:any)=>e.code==="MENU_IMAGE_FORBIDDEN");
 await assert.rejects(publicCatalogueImageRedirect(id),(e:any)=>e.code==="MENU_IMAGE_NOT_FOUND");
 await validateCatalogueImageForItem(undefined,owner,merchant);
 await validateCatalogueImageForItem("https://example.com/existing-legacy-image.jpg",owner,merchant);
 await assert.rejects(validateCatalogueImageForItem("/api/v1/media/catalogue/not-a-uuid",owner,merchant),(e:any)=>e.code==="INVALID_MENU_IMAGE");
});
