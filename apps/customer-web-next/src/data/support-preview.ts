/**
 * Customer support design-preview fixtures only.
 * No ticket, payment, chat, upload, refund, rider position or resolution is real.
 * Phase 2 binds the view models to authenticated /api/v1/customer/support routes.
 */
export type CaseStatus="open"|"waiting"|"resolved";
export type CaseTopic="orders"|"payments"|"account"|"merchants"|"riders"|"other";
export type CaseMessage={id:string;author:"customer"|"agent"|"system";name:string;text:string;at:string;attachment?:string};
export type SupportCase={
 id:string;subject:string;summary:string;topic:CaseTopic;status:CaseStatus;
 orderId?:string;restaurant?:string;createdAt:string;relative:string;
 messages:CaseMessage[];attachments:string[];resolution?:string;resolutionProposal?:string;resolutionResponse?:"accepted"|"disputed";
};
const msg=(id:string,author:CaseMessage["author"],text:string,at:string,name=author==="customer"?"You":"DeeToo Support"):CaseMessage=>({id,author,text,at,name});
export const sampleCases:SupportCase[]=[
 {id:"case-missing",subject:"Missing item in my order",summary:"The fries were missing from my delivery.",topic:"orders",status:"open",orderId:"DT12893",restaurant:"Juja Grill House",createdAt:"Oct 8, 2026 · 2:14 PM",relative:"Today",attachments:["order-photo.jpg"],messages:[
  {...msg("mm1","customer","Hi, my order arrived but the fries were missing. Please help.","2:14 PM"),attachment:"order-photo.jpg"},
  msg("mm2","agent","I'm sorry an item was missing. We've noted your report and will review it with the restaurant.","2:20 PM"),
  msg("mm3","customer","Thank you. I also have a photo of the items received.","2:25 PM")
 ]},
 {id:"case-refund",subject:"Refund for cancelled order",summary:"I need an update on a sample refund.",topic:"payments",status:"waiting",orderId:"DT12801",restaurant:"Pizza Palace",createdAt:"Oct 6, 2026 · 6:22 PM",relative:"2 days ago",attachments:[],resolutionProposal:"A sample refund review has been completed. Do you agree with the proposed outcome?",messages:[
  msg("mr1","customer","Can you help with the refund for my cancelled order?","6:22 PM"),
  msg("mr2","agent","We've received your question. An agent will review the payment details.","6:26 PM"),
 ]},
 {id:"case-account",subject:"Update my phone number",summary:"Please help update my account details.",topic:"account",status:"resolved",createdAt:"Oct 2, 2026 · 11:08 AM",relative:"6 days ago",attachments:[],resolution:"Sample resolution accepted",messages:[
  msg("ma1","customer","I'd like help updating my phone number.","11:08 AM"),
  msg("ma2","agent","We explained the verification steps required to update account contact details.","11:20 AM"),
  msg("ma3","system","Sample resolution accepted by the customer. This conversation remains available for reference.","11:42 AM")
 ]},
 {id:"case-late",subject:"Rider was late",summary:"The delivery arrived later than expected.",topic:"riders",status:"open",orderId:"DT12644",restaurant:"Juja Grill House",createdAt:"Sep 28, 2026 · 4:11 PM",relative:"Sep 28",attachments:[],messages:[
  msg("ml1","customer","My rider was delayed. I'd like the delay reviewed.","4:11 PM"),
  msg("ml2","agent","We can help review the delivery timeline. This is a preview conversation.","4:16 PM")
 ]},
 {id:"case-arrival",subject:"Order #DT12893",summary:"My order hasn't arrived yet.",topic:"orders",status:"open",orderId:"DT12893",restaurant:"Juja Grill House",createdAt:"Oct 8, 2026 · 7:12 PM",relative:"2 min ago",attachments:[],messages:[
  msg("ar1","customer","Hi, my order hasn't arrived yet. It's been over 30 minutes and the app still shows it's on the way.","7:12 PM"),
  msg("ar2","agent","Hi! I'm Grace from DeeToo Support. Let me check the current status of your order. Please give me a moment.","7:13 PM","Support Agent · Grace"),
  msg("ar3","agent","The sample tracking view shows a courier nearby. In production I would confirm the route before quoting an ETA.","7:15 PM","Support Agent · Grace"),
  msg("ar4","customer","Great, thanks! Please keep me updated.","7:15 PM"),
  msg("ar5","agent","I'll keep monitoring until we have a verified update. You can continue replying here.","7:16 PM","Support Agent · Grace")
 ]},
 {id:"case-promo",subject:"Promo code",summary:"My promo code wasn't working.",topic:"other",status:"resolved",createdAt:"Oct 1, 2026 · 9:20 AM",relative:"1 week ago",attachments:[],resolution:"Sample resolution accepted",messages:[
  msg("pr1","customer","The code isn't applying to my sample order.","9:20 AM"),
  msg("pr2","agent","The offer eligibility was explained. No live promotion was applied.","9:28 AM"),
  msg("pr3","system","Sample case closed after customer acceptance.","9:31 AM")
 ]}
];
export const caseTopicLabels:Record<CaseTopic,string>={orders:"Orders",payments:"Payments",account:"Account",merchants:"Merchants",riders:"Riders",other:"Other"};
export const supportDemoBurger="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=280&q=80";
export const mockupOrder={
 number:"DT12893",restaurant:"Juja Grill House",item:"Smash Burger",amount:"Ksh 1,350",
 placed:"Oct 8, 2026 · 6:32 PM",status:"On the way (sample)",window:"Unavailable without live routing"
};
