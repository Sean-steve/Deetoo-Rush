/**
 * Screens 11–13 — illustrative Customer Account data.
 * NEVER represents authenticated identity, security-device inventory, saved
 * payment instruments, notification delivery, actual 2FA, or real account state.
 * Mutations in these previews are component-local and are discarded on reload.
 */
export type PreviewAddress = {id:string;label:string;description:string;district:string;primary:boolean};
export type PreviewPayment = {id:string;label:string;description:string;primary:boolean;symbol:"mpesa"|"card"};
export type DemoDevice = {id:string;label:string;location:string;time:string;current:boolean;icon:"desktop"|"mobile"};
export type DemoLogin = {id:string;label:string;device:string;location:string;time:string;success:boolean};
export type NoticeCategory = "orders"|"offers"|"account"|"security"|"system";
export type DemoNotification = {id:string;category:NoticeCategory;title:string;description:string;when:string;day:"Today"|"Yesterday";read:boolean;target?:"orders"|"search"|"security"|"profile"};
export const demoCustomer={
  name:"Test User",email:"testuser@deetoo.test",phone:"+254 792 659 500",
  joined:"Oct 1, 2026",type:"Customer",first:"Test",last:"User",
};
export const demoAddresses:PreviewAddress[]=[
  {id:"home",label:"Home",description:"Near Juja State Lodge, Juja",district:"Juja, Kiambu County",primary:true},
  {id:"work",label:"Work",description:"Juja Business Center, Juja",district:"Juja, Kiambu County",primary:false},
];
export const demoPayments:PreviewPayment[]=[
  {id:"mpesa",label:"M-PESA",description:"+254 792 659 500 (sample)",primary:true,symbol:"mpesa"},
  {id:"card",label:"Mastercard",description:"•••• •••• •••• 4242 (sample)",primary:false,symbol:"card"},
];
export const demoDevices:DemoDevice[]=[
  {id:"windows",label:"Windows · Chrome",location:"Juja, Kiambu County",time:"Oct 8, 2026 at 4:15 PM",current:true,icon:"desktop"},
  {id:"android",label:"Android · DeeToo App",location:"Nairobi, Kenya",time:"Oct 7, 2026 at 8:22 PM",current:false,icon:"mobile"},
  {id:"iphone",label:"iPhone · Safari",location:"Nairobi, Kenya",time:"Oct 5, 2026 at 11:02 AM",current:false,icon:"mobile"},
];
export const demoLogins:DemoLogin[]=[
  {id:"login1",label:"Successful login",device:"Windows · Chrome",location:"Juja, Kiambu County",time:"Oct 8, 2026 at 4:15 PM",success:true},
  {id:"login2",label:"Successful login",device:"Android · DeeToo App",location:"Nairobi, Kenya",time:"Oct 7, 2026 at 8:22 PM",success:true},
  {id:"login3",label:"Password changed",device:"Windows · Chrome",location:"Juja, Kiambu County",time:"Oct 1, 2026 at 2:10 PM",success:true},
  {id:"login4",label:"Failed login attempt",device:"Unknown device",location:"Nairobi, Kenya",time:"Sep 28, 2026 at 11:43 PM",success:false},
  {id:"login5",label:"Successful login",device:"Android · DeeToo App",location:"Nairobi, Kenya",time:"Sep 25, 2026 at 8:14 AM",success:true},
  {id:"login6",label:"Successful login",device:"Windows · Chrome",location:"Juja, Kiambu County",time:"Sep 20, 2026 at 1:05 PM",success:true},
];
export const demoNotifications:DemoNotification[]=[
  {id:"n1",category:"orders",title:"Your order is on the way!",description:"Your rider John is 5 minutes away with your order from Juja Grill House. (Sample event)",when:"2 min ago",day:"Today",read:false,target:"orders"},
  {id:"n2",category:"offers",title:"Special offer just for you!",description:"Get 20% off selected pizza orders this weekend. (Preview offer; not redeemable)",when:"1 hour ago",day:"Today",read:false,target:"search"},
  {id:"n3",category:"orders",title:"Order delivered",description:"Your sample order from Smash Burger has been delivered. Enjoy your meal!",when:"3 hours ago",day:"Today",read:true,target:"orders"},
  {id:"n4",category:"account",title:"Earned 50 reward points",description:"Sample reward activity — no reward points have been issued.",when:"5 hours ago",day:"Today",read:false,target:"profile"},
  {id:"n5",category:"orders",title:"Payment successful",description:"Ksh 1,350 sample M-PESA payment for order #DT12893. No real charge was made.",when:"6 hours ago",day:"Today",read:true,target:"orders"},
  {id:"n6",category:"offers",title:"Weekend deals are here!",description:"Enjoy sample savings at selected restaurants this weekend.",when:"Yesterday, 10:24 AM",day:"Yesterday",read:false,target:"search"},
  {id:"n7",category:"orders",title:"Your order has been confirmed",description:"Juja Grill House is preparing your sample order.",when:"Yesterday, 10:18 AM",day:"Yesterday",read:true,target:"orders"},
  {id:"n8",category:"account",title:"New restaurants near you",description:"3 new restaurants are shown in the Juja design preview.",when:"Yesterday, 9:02 AM",day:"Yesterday",read:true,target:"search"},
  {id:"n9",category:"system",title:"App update available",description:"Sample app update notice — no installation required.",when:"Yesterday, 8:15 AM",day:"Yesterday",read:true},
  {id:"n10",category:"security",title:"Account security tip",description:"Consider enabling two-factor authentication when available.",when:"Yesterday, 7:10 AM",day:"Yesterday",read:true,target:"security"},
  {id:"n11",category:"offers",title:"Explore today's picks",description:"Browse sample meals in Discover.",when:"Yesterday, 6:05 AM",day:"Yesterday",read:true,target:"search"},
  {id:"n12",category:"system",title:"Delivery experience update",description:"Our preview is evolving. Live notification delivery is not yet connected.",when:"Yesterday, 5:45 AM",day:"Yesterday",read:true},
];
