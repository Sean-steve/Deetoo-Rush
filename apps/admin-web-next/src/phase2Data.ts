/* Phase 2 is intentionally a local frontend simulation; no DeeToo API imports. */
export type IncidentStatus="OPEN"|"ACKNOWLEDGED"|"INVESTIGATING"|"ACTION_REQUIRED"|"MONITORING"|"RESOLVED"|"CLOSED";
export type Severity="LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
export type IncidentCase={id:string; title:string; type:string; description:string; severity:Severity; status:IncidentStatus; assignedTo:string; reporter:string; location:string; relatedOrderId:string|null; relatedRiderId:string|null; createdAt:string; updatedAt:string; timeline:{at:string;actor:string;event:string;note:string}[]; notes:string[]; evidence:{name:string;type:string}[]};
export type SupportStatus="OPEN"|"IN_PROGRESS"|"WAITING_ON_USER"|"RESOLVED"|"CLOSED";
export type SupportMessage={id:string; by:string; actor:"CUSTOMER"|"MERCHANT"|"RIDER"|"ADMIN"|"SYSTEM"; text:string; at:string; internal:boolean};
export type SupportCase={id:string;subject:string;priority:Severity;status:SupportStatus;participantName:string;participantType:"Customer"|"Merchant"|"Rider";assignedTo:string;orderId:string|null;createdAt:string;updatedAt:string;messages:SupportMessage[];satisfaction:"PENDING"|"SATISFIED"|"NOT_SATISFIED"|"NOT_REQUESTED";resolution:string};
export type Branch={id:string;name:string;county:string;area:string;status:"ACTIVE"|"PAUSED";address:string;orders:number};
export type MerchantRecord={id:string;name:string;category:string;status:"ACTIVE"|"PENDING"|"SUSPENDED"|"ONBOARDING";verification:"VERIFIED"|"IN_REVIEW"|"MISSING";owner:string;email:string;phone:string;joinedAt:string;registration:string;description:string;branches:Branch[];reviewNotes:string[];rating:number};
export type Address={id:string;label:string;area:string;county:string;isDefault:boolean};
export type CustomerRecord={id:string;name:string;phone:string;email:string;county:string;status:"ACTIVE"|"RESTRICTED"|"SUSPENDED"|"DELETED";verified:boolean;joinedAt:string;addresses:Address[];notes:string[];audit:{at:string;action:string;reason:string}[]};
export type PhaseTwoState={incidents:IncidentCase[];support:SupportCase[];merchants:MerchantRecord[];customers:CustomerRecord[];actions:{at:string;action:string;detail:string}[]};
export type PhaseTwoAction=
 | {type:"PHASE2_INCIDENT_CREATE";title:string;kind:string;severity:Severity;description:string;orderId:string}
 | {type:"PHASE2_INCIDENT_STATUS";id:string;status:IncidentStatus;note:string}
 | {type:"PHASE2_INCIDENT_ASSIGN";id:string;assignedTo:string}
 | {type:"PHASE2_INCIDENT_NOTE";id:string;note:string}
 | {type:"PHASE2_SUPPORT_CREATE";name:string;participantType:SupportCase["participantType"];subject:string;orderId:string|null;priority:Severity}
 | {type:"PHASE2_SUPPORT_REPLY";id:string;message:string;internal:boolean;by:string;actor:SupportMessage["actor"]}
 | {type:"PHASE2_SUPPORT_STATUS";id:string;status:SupportStatus;resolution:string}
 | {type:"PHASE2_SUPPORT_ASSIGN";id:string;assignee:string}
 | {type:"PHASE2_SUPPORT_SATISFACTION";id:string;outcome:"SATISFIED"|"NOT_SATISFIED"}
 | {type:"PHASE2_MERCHANT_CREATE";name:string;category:string;owner:string;email:string;phone:string}
 | {type:"PHASE2_MERCHANT_STATUS";id:string;status:MerchantRecord["status"];note:string}
 | {type:"PHASE2_MERCHANT_EDIT";id:string;name:string;owner:string;email:string;phone:string;category:string}
 | {type:"PHASE2_MERCHANT_BRANCH";id:string;name:string;county:string;area:string;address:string}
 | {type:"PHASE2_MERCHANT_BRANCH_STATUS";id:string;branchId:string;status:Branch["status"]}
 | {type:"PHASE2_CUSTOMER_CREATE";name:string;email:string;phone:string;county:string}
 | {type:"PHASE2_CUSTOMER_EDIT";id:string;name:string;email:string;phone:string;county:string;reason:string}
 | {type:"PHASE2_CUSTOMER_STATUS";id:string;status:CustomerRecord["status"];reason:string}
 | {type:"PHASE2_CUSTOMER_NOTE";id:string;note:string}
 | {type:"PHASE2_CUSTOMER_ADDRESS";id:string;label:string;area:string;county:string};
const baseTime=Date.parse("2026-10-09T10:24:00+03:00");
const date=(delta:number)=>new Date(baseTime+delta*60_000).toISOString();
const shortName=["John K.","Grace N.","Collins M.","Mary A.","James K.","Alex T.","Daniel O.","Fatima A."];
const merchantNames=["Java House","Pizza Inn","KFC","Artcaffe","Carrefour","Chicken Inn","Naivas","QuickMart","Burger Point","Galito's"];
const customerNames=["Sarah M.","David O.","Grace N.","Peter K.","Esther W.","Brian K.","Linda W.","Alex T.","James K.","Mary A.","Caroline N.","Kevin B."];
const kindNames=["Delivery","Payment","Merchant","Customer","Safety","System","Fraud","Rider","Technical"];
const incidentTitles=["Rider accident reported","Failed M-PESA payments","Merchant operating outside hours","Order not delivered","Rider safety concern","Dispatch delay increase","Suspicious order pattern","Long delivery delay","Rider not responding","Background job failures"];
const supportSubjects=["Order not delivered","Menu update issue","Payment not received","Refund request","Account reactivation","Vehicle document update","App not working","Commission dispute"];
const categories=["Restaurant","Supermarket","Café","Restaurant","Supermarket","Restaurant","Supermarket","Supermarket"];
const counties=["Nairobi","Kiambu","Mombasa","Nakuru","Kisumu","Machakos"];
const loc=["Westlands","CBD","Kilimani","Lavington","Upper Hill","South B","Roysambu","Thika Road"];
const note=(at:string,actor:string,event:string,description:string)=>({at,actor,event,note:description});
export function seedPhaseTwo():PhaseTwoState {
 const incidents:IncidentCase[]=Array.from({length:52},(_,i)=>{
  const sev:Severity=i===4?"CRITICAL":i%5===0?"HIGH":i%3===0?"LOW":"MEDIUM";
  const status:IncidentStatus=i<8?["INVESTIGATING","OPEN","ACTION_REQUIRED","INVESTIGATING","OPEN","MONITORING","INVESTIGATING","OPEN"][i] as IncidentStatus:i<28?"OPEN":i<40?"RESOLVED":"CLOSED";
  const title=incidentTitles[i%incidentTitles.length],createdAt=date(-12-i*41);
  const riderId=i%4===0?"RDR0101":null,orderId=i%5===0?"DR78291":null;
  return {id:"INC-"+(7842-i),title,type:kindNames[i%kindNames.length],description:title+". Incident details are illustrative and supplied for UI workflow testing.",severity:sev,status,assignedTo:i%6===0?"Unassigned":shortName[i%shortName.length],reporter:i%3===0?"Customer":"System",location:loc[i%loc.length]+", Nairobi",relatedOrderId:orderId,relatedRiderId:riderId,createdAt,updatedAt:date(-i*35),timeline:[note(createdAt,"System","Incident reported","Incident created from a simulated operational alert"),note(date(-i*30),"Operations","Triage","Assigned severity and category")],notes:[],evidence:i%4===0?[{name:"Demo incident photo.jpg",type:"Image (sample)"}]:[]};
 });
 const support:SupportCase[]=Array.from({length:50},(_,i)=>{
  const type:SupportCase["participantType"]=i%3===0?"Customer":i%3===1?"Merchant":"Rider";
  const name=type==="Merchant"?merchantNames[i%merchantNames.length]:type==="Customer"?customerNames[i%customerNames.length]:shortName[i%shortName.length];
  const status:SupportStatus=i<18?"OPEN":i<40?"IN_PROGRESS":i<46?"WAITING_ON_USER":"RESOLVED";
  return {id:"SUP-"+(1042-i),subject:supportSubjects[i%supportSubjects.length],priority:i%4===0?"HIGH":i%4===1?"MEDIUM":"LOW",status,
   participantName:name,participantType:type,assignedTo:i%6===0?"Unassigned":"John A.",orderId:type==="Customer"?"DR"+(78291-i%40):null,createdAt:date(-i*32),updatedAt:date(-i*28),
   messages:[{id:"m-"+i+"-1",by:name,actor:type.toUpperCase() as SupportMessage["actor"],text:i===0?"Hi, my order hasn't arrived. Can you check what happened?":"Hello, I need help with "+supportSubjects[i%supportSubjects.length].toLowerCase()+".",at:date(-i*32),internal:false},...(i%3===0?[{id:"m-"+i+"-2",by:"John A.",actor:"ADMIN" as const,text:"Thank you for contacting DeeToo. We're looking into this now.",at:date(-i*29),internal:false}]:[])],
   satisfaction:"NOT_REQUESTED",resolution:""};
 });
 const merchants:MerchantRecord[]=Array.from({length:65},(_,i)=>{
  const name=i<merchantNames.length?merchantNames[i]:"Merchant "+String(i+1).padStart(3,"0");
  const status:MerchantRecord["status"]=i<49?"ACTIVE":i<55?"PENDING":i<60?"ONBOARDING":"SUSPENDED";
  const c=counties[i%counties.length],area=loc[i%loc.length];
  const branches:Branch[]=Array.from({length:i<10?(i%5)+2:1},(_,j)=>({id:"BR-"+(i+1)+"-"+(j+1),name:name+(j===0?" — "+area:" — Branch "+(j+1)),county:c,area:j===0?area:loc[(i+j)%loc.length],status:"ACTIVE",address:(j+1)+" "+area+" Road",orders:12+i+j}));
  return {id:"MER-"+String(i+1).padStart(4,"0"),name,category:categories[i%categories.length],status,verification:i<49?"VERIFIED":i<58?"IN_REVIEW":"MISSING",owner:shortName[i%shortName.length],email:"merchant"+(i+1)+"@deetoo.example",phone:"+2547"+String(12000000+i*230).slice(0,8),joinedAt:date(-i*960-400),registration:"PVT-DEMO-"+String(1000+i),description:name+" is a sample marketplace partner used for DeeToo admin preview.",branches,reviewNotes:[],rating:Number((4.2+(i%6)*0.1).toFixed(1))};
 });
 const customers:CustomerRecord[]=Array.from({length:160},(_,i)=>{
  const name=i<customerNames.length?customerNames[i]:"Customer "+String(i+1).padStart(3,"0");
  const status:CustomerRecord["status"]=i<140?"ACTIVE":i<153?"RESTRICTED":"SUSPENDED";
  const county=counties[i%counties.length];
  return {id:"CUS-"+String(i+1).padStart(5,"0"),name,email:"customer"+(i+1)+"@deetoo.example",phone:"+2547"+String(12000000+i*115).slice(0,8),county,status,verified:i%8!==0,joinedAt:date(-i*780-1500),
   addresses:[{id:"ADDR-"+i+"-1",label:"Home",area:loc[i%loc.length],county,isDefault:true},{id:"ADDR-"+i+"-2",label:"Work",area:loc[(i+2)%loc.length],county,isDefault:false}],notes:[],audit:[]};
 });
 return {incidents,support,merchants,customers,actions:[]};
}
const stamp=()=>new Date().toISOString();
export function reducePhaseTwo(state:PhaseTwoState,action:PhaseTwoAction):PhaseTwoState {
 const audit=(label:string,detail:string)=>[{at:stamp(),action:label,detail},...state.actions].slice(0,120);
 if(action.type==="PHASE2_INCIDENT_CREATE"){
  if(action.title.trim().length<5||action.description.trim().length<5)return state;
  const next=Math.max(7800,...state.incidents.map(x=>Number(x.id.slice(4))||0))+1;
  const createdAt=stamp(),id="INC-"+next;
  const incident:IncidentCase={id,title:action.title.trim(),description:action.description.trim(),type:action.kind,severity:action.severity,status:"OPEN",assignedTo:"Unassigned",reporter:"Demo Admin",location:"Nairobi",relatedOrderId:action.orderId||null,relatedRiderId:null,createdAt,updatedAt:createdAt,timeline:[note(createdAt,"Demo Admin","Incident reported",action.description.trim())],notes:[],evidence:[]};
  return {...state,incidents:[incident,...state.incidents],actions:audit("Incident created",id)};
 }
 if(action.type==="PHASE2_INCIDENT_STATUS"){
  if(action.note.trim().length<3)return state;
  return {...state,incidents:state.incidents.map(x=>x.id===action.id?{...x,status:action.status,updatedAt:stamp(),timeline:[...x.timeline,note(stamp(),"Demo Admin","Status: "+action.status,action.note.trim())]}:x),actions:audit("Incident status",action.id+" → "+action.status)};
 }
 if(action.type==="PHASE2_INCIDENT_ASSIGN"){return {...state,incidents:state.incidents.map(x=>x.id===action.id?{...x,assignedTo:action.assignedTo,updatedAt:stamp(),timeline:[...x.timeline,note(stamp(),"Demo Admin","Assigned investigator",action.assignedTo)]}:x),actions:audit("Incident assigned",action.id+" → "+action.assignedTo)};}
 if(action.type==="PHASE2_INCIDENT_NOTE"){if(action.note.trim().length<2)return state;return {...state,incidents:state.incidents.map(x=>x.id===action.id?{...x,notes:[...x.notes,action.note.trim()],timeline:[...x.timeline,note(stamp(),"Demo Admin","Internal note",action.note.trim())]}:x),actions:audit("Incident note",action.id)};}
 if(action.type==="PHASE2_SUPPORT_CREATE"){
  if(action.subject.trim().length<4||action.name.trim().length<2)return state;
  const id="SUP-"+(Math.max(1000,...state.support.map(x=>Number(x.id.slice(4))||0))+1);
  const c:SupportCase={id,subject:action.subject.trim(),participantName:action.name.trim(),participantType:action.participantType,priority:action.priority,status:"OPEN",orderId:action.orderId,assignedTo:"Unassigned",createdAt:stamp(),updatedAt:stamp(),messages:[],satisfaction:"NOT_REQUESTED",resolution:""};
  return {...state,support:[c,...state.support],actions:audit("Support opened",id)};
 }
 if(action.type==="PHASE2_SUPPORT_REPLY"){
  if(action.message.trim().length<2)return state;
  return {...state,support:state.support.map(x=>x.id===action.id?{...x,status:action.actor==="ADMIN"&&!action.internal?"IN_PROGRESS":x.status,updatedAt:stamp(),messages:[...x.messages,{id:"m-"+stamp(),by:action.by,actor:action.actor,text:action.message.trim(),at:stamp(),internal:action.internal}]}:x),actions:audit(action.internal?"Internal note":"Support message",action.id)};
 }
 if(action.type==="PHASE2_SUPPORT_STATUS"){
  const current=state.support.find(x=>x.id===action.id);
  if(action.status==="CLOSED"&&(!current||current.status!=="RESOLVED"||current.satisfaction!=="SATISFIED"))return state;
  if(["RESOLVED","CLOSED"].includes(action.status)&&action.resolution.trim().length<5)return state;
  return {...state,support:state.support.map(x=>x.id===action.id?{...x,status:action.status,resolution:action.resolution||x.resolution,satisfaction:action.status==="RESOLVED"?"PENDING":x.satisfaction,updatedAt:stamp(),messages:[...x.messages,{id:"m-"+stamp(),by:"System",actor:"SYSTEM",text:"Case status: "+action.status.replaceAll("_"," ").toLowerCase()+(action.resolution?(". Resolution: "+action.resolution):""),at:stamp(),internal:false}]}:x),actions:audit("Support status",action.id+" → "+action.status)};
 }
 if(action.type==="PHASE2_SUPPORT_ASSIGN"){return {...state,support:state.support.map(x=>x.id===action.id?{...x,assignedTo:action.assignee}:x),actions:audit("Support assigned",action.id+" → "+action.assignee)};}
 if(action.type==="PHASE2_SUPPORT_SATISFACTION"){
  return {...state,support:state.support.map(x=>x.id===action.id?{...x,satisfaction:action.outcome,status:action.outcome==="NOT_SATISFIED"?"IN_PROGRESS":x.status,updatedAt:stamp(),messages:[...x.messages,{id:"m-"+stamp(),by:x.participantName,actor:x.participantType.toUpperCase() as SupportMessage["actor"],text:action.outcome==="SATISFIED"?"I'm satisfied with the resolution.":"The issue is not resolved for me.",at:stamp(),internal:false}]}:x),actions:audit("Support satisfaction",action.id+" → "+action.outcome)};
 }
 if(action.type==="PHASE2_MERCHANT_CREATE"){
  if(action.name.trim().length<3||!action.email.includes("@"))return state;
  const id="MER-"+String(Math.max(0,...state.merchants.map(x=>Number(x.id.slice(4))||0))+1).padStart(4,"0");
  const m:MerchantRecord={id,name:action.name.trim(),category:action.category,status:"ONBOARDING",verification:"MISSING",owner:action.owner.trim(),email:action.email.trim(),phone:action.phone.trim(),joinedAt:stamp(),registration:"Pending",description:"New merchant application — information pending review.",branches:[],reviewNotes:[],rating:0};
  return {...state,merchants:[m,...state.merchants],actions:audit("Merchant onboarding",id)};
 }
 if(action.type==="PHASE2_MERCHANT_STATUS"){
  if(action.note.trim().length<3)return state;
  return {...state,merchants:state.merchants.map(x=>x.id===action.id?{...x,status:action.status,verification:action.status==="ACTIVE"?"VERIFIED":x.verification,reviewNotes:[...x.reviewNotes,action.status+": "+action.note.trim()]}:x),actions:audit("Merchant status",action.id+" → "+action.status)};
 }
 if(action.type==="PHASE2_MERCHANT_EDIT"){
  if(action.name.trim().length<3||!action.email.includes("@"))return state;
  return {...state,merchants:state.merchants.map(x=>x.id===action.id?{...x,name:action.name.trim(),category:action.category,owner:action.owner.trim(),email:action.email.trim(),phone:action.phone.trim()}:x),actions:audit("Merchant edited",action.id)};
 }
 if(action.type==="PHASE2_MERCHANT_BRANCH"){
  if(action.name.trim().length<3||action.area.trim().length<2)return state;
  return {...state,merchants:state.merchants.map(x=>x.id===action.id?{...x,branches:[...x.branches,{id:"BR-"+stamp(),name:action.name.trim(),county:action.county,area:action.area.trim(),address:action.address.trim(),status:"ACTIVE",orders:0}]}:x),actions:audit("Merchant branch",action.id+" → "+action.name)};
 }
 if(action.type==="PHASE2_MERCHANT_BRANCH_STATUS"){
  return {...state,merchants:state.merchants.map(x=>x.id===action.id?{...x,branches:x.branches.map(b=>b.id===action.branchId?{...b,status:action.status}:b)}:x),actions:audit("Merchant branch status",action.branchId+" → "+action.status)};
 }
 if(action.type==="PHASE2_CUSTOMER_CREATE"){
  if(action.name.trim().length<3||!action.email.includes("@"))return state;
  const id="CUS-"+String(Math.max(0,...state.customers.map(x=>Number(x.id.slice(4))||0))+1).padStart(5,"0");
  const c:CustomerRecord={id,name:action.name.trim(),email:action.email.trim(),phone:action.phone.trim(),county:action.county,status:"ACTIVE",verified:false,joinedAt:stamp(),addresses:[],notes:[],audit:[{at:stamp(),action:"Created",reason:"Frontend demo account"}]};
  return {...state,customers:[c,...state.customers],actions:audit("Customer created",id)};
 }
 if(action.type==="PHASE2_CUSTOMER_EDIT"){
  if(action.name.trim().length<3||!action.email.includes("@")||action.reason.trim().length<3)return state;
  return {...state,customers:state.customers.map(x=>x.id===action.id?{...x,name:action.name.trim(),email:action.email.trim(),phone:action.phone.trim(),county:action.county,audit:[...x.audit,{at:stamp(),action:"Profile edited",reason:action.reason}]}:x),actions:audit("Customer edited",action.id)};
 }
 if(action.type==="PHASE2_CUSTOMER_STATUS"){
  if(action.reason.trim().length<3)return state;
  return {...state,customers:state.customers.map(x=>x.id===action.id?{...x,status:action.status,audit:[...x.audit,{at:stamp(),action:"Status: "+action.status,reason:action.reason}]}:x),actions:audit("Customer account",action.id+" → "+action.status)};
 }
 if(action.type==="PHASE2_CUSTOMER_NOTE"){
  if(action.note.trim().length<2)return state;
  return {...state,customers:state.customers.map(x=>x.id===action.id?{...x,notes:[...x.notes,action.note.trim()],audit:[...x.audit,{at:stamp(),action:"Internal note",reason:action.note.trim()}]}:x),actions:audit("Customer note",action.id)};
 }
 if(action.type==="PHASE2_CUSTOMER_ADDRESS"){
  if(action.area.trim().length<2)return state;
  return {...state,customers:state.customers.map(x=>x.id===action.id?{...x,addresses:[...x.addresses,{id:"ADDR-"+stamp(),label:action.label,area:action.area.trim(),county:action.county,isDefault:x.addresses.length===0}]}:x),actions:audit("Customer address",action.id)};
 }
 return state;
}
