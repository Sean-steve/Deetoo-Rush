import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type OrderStage = "new" | "preparing" | "ready" | "completed" | "declined";
export type Order = { id:string; customer:string; phone:string; items:string; amount:number; time:string; stage:OrderStage; elapsed:number; instructions?:string; rider?:string; handover:string; eta?:string; prepMinutes?:number };
export type FoodItem = {id:string;name:string;description:string;category:string;price:number;available:boolean;image:string;sku:string;stock:number;modifiers:string[]};
export type Staff = {id:string;name:string;email:string;phone:string;role:"Owner"|"Manager"|"Staff";branch:string;status:"Active"|"Pending"|"Inactive"};
export type Document = {id:string;name:string;filename:string;date:string;status:"Verified"|"Pending"|"Expired"};
export type Tx = {id:string;date:string;customer:string;amount:number;payment:"M-PESA"|"Card"|"Cash";status:"Completed"|"Pending"|"Refunded";type:"Order"|"Adjustment"};
export type Settlement = {id:string;date:string;amount:number;status:"Completed"|"Scheduled";reference:string};
export type Notice = {id:string;text:string;time:string;read:boolean};
export type MerchantDemo = {branch:string;branches:string[];storeStatus:"Open"|"Paused"|"Closed";orders:Order[];items:FoodItem[];staff:Staff[];documents:Document[];transactions:Tx[];settlements:Settlement[];notices:Notice[];commission:number;categories:string[];business:{legalName:string;displayName:string;description:string;type:string;phone:string;email:string;address:string;country:string};menus:string[];selectedMenu:string};
const images = {
 burger:"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=640&q=82",
 wrap:"https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=640&q=82",
 fries:"https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=640&q=82",
 breakfast:"https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=640&q=82",
 cola:"https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=640&q=82",
 shake:"https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=640&q=82",
 combo:"https://images.unsplash.com/photo-1550547660-d9450f859349?w=640&q=82",
 salad:"https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=640&q=82",
 coffee:"https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=640&q=82",
 sandwich:"https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=640&q=82"
};
export const foodPhotos = images;
function item(id:string,name:string,category:string,price:number,description:string,image:string,available=true):FoodItem{
return {id,name,category,price,description,image,available,sku:"DT-"+id.toUpperCase(),stock:18,modifiers:[]};}
export const initialDemo:MerchantDemo={
branch:"Juja Branch",branches:["Juja Branch","Westlands Branch","Thika Road Branch"],storeStatus:"Open",
orders:[
{id:"DT-XRSEP",customer:"John Kamau",phone:"+254 712 345 678",items:"1 × Smash Burger",amount:971.25,time:"3:52 PM",stage:"new",elapsed:26,instructions:"No special instructions",handover:"XRSEP"},
{id:"DT-9HY6J",customer:"Mary Wanjiku",phone:"+254 712 345 678",items:"1 × Smash Burger",amount:972,time:"4:00 PM",stage:"ready",elapsed:12,rider:"David Ochieng",handover:"HY6J",eta:"4:21 PM"},
{id:"DT-K4HR9",customer:"Peter Mwangi",phone:"+254 723 456 789",items:"2 × Chicken Burger",amount:1440,time:"3:45 PM",stage:"ready",elapsed:20,rider:"Grace Akinyi",handover:"K4HR9",eta:"4:05 PM"},
{id:"DT-MN82P",customer:"Sarah Njeri",phone:"+254 732 567 890",items:"1 × Veggie Wrap",amount:650,time:"3:30 PM",stage:"ready",elapsed:31,rider:"Dennis Otieno",handover:"MN82P",eta:"4:14 PM"}
],
items:[
item("01","Smash Burger","Burgers",850,"Juicy beef patty with special sauce",images.burger),
item("02","Chicken Wrap","Wraps",650,"Grilled chicken with fresh veggies",images.wrap),
item("03","French Fries","Sides",300,"Crispy golden fries",images.fries),
item("04","Full Breakfast","Breakfast",750,"Eggs, sausages, toast and beans",images.breakfast),
item("05","Veggie Wrap","Wraps",600,"Fresh vegetables and sauce",images.wrap),
item("06","Coca-Cola 500ml","Drinks",250,"Chilled soft drink",images.cola),
item("07","Chicken Burger","Burgers",720,"Crispy chicken with lettuce",images.burger,false),
item("08","Vanilla Milkshake","Drinks",400,"Creamy vanilla milkshake",images.shake,false),
item("09","Classic Burger","Burgers",650,"Classic juicy patty",images.burger),
item("10","Double Beef Burger","Burgers",1050,"Two juicy beef patties",images.burger),
item("11","Spicy Burger","Burgers",790,"Hot and spicy burger",images.burger),
item("12","Cheese Burger","Burgers",820,"Melted cheese and beef patty",images.burger),
item("13","Pancakes","Breakfast",450,"Fluffy pancakes",images.breakfast),
item("14","Egg Muffin","Breakfast",390,"Breakfast muffin with egg",images.sandwich),
item("15","French Toast","Breakfast",450,"Golden French toast",images.breakfast,false),
item("16","Porridge Bowl","Breakfast",220,"Warm oats and fruit",images.breakfast),
item("17","Beef Wrap","Wraps",780,"Slow cooked beef and greens",images.wrap),
item("18","Falafel Wrap","Wraps",580,"Crispy falafel with hummus",images.wrap,false),
item("19","Potato Wedges","Sides",340,"Seasoned potato wedges",images.fries),
item("20","Onion Rings","Sides",300,"Golden crunchy onion rings",images.fries,false),
item("21","Coleslaw","Sides",220,"Creamy fresh salad",images.salad),
item("22","Iced Tea","Drinks",280,"Chilled house iced tea",images.cola),
item("23","Smash Burger Combo","Combos",1120,"Burger, fries and drink",images.combo),
item("24","Family Combo","Combos",2890,"Meals for four people",images.combo,false)
],
staff:[
{id:"1",name:"Test Merchant",email:"merchant@deetoo.test",phone:"+254 700 123 456",role:"Owner",branch:"All branches",status:"Active"},
{id:"2",name:"John Kamau",email:"john@deetoo.test",phone:"+254 712 345 678",role:"Manager",branch:"Juja Branch",status:"Active"},
{id:"3",name:"Ann Smith",email:"ann@deetoo.test",phone:"+254 723 456 789",role:"Staff",branch:"Juja Branch",status:"Active"},
{id:"4",name:"David K.",email:"david@deetoo.test",phone:"",role:"Staff",branch:"Juja Branch",status:"Pending"}
],
documents:[
{id:"registration",name:"Business registration",filename:"deetoo_registration.pdf",date:"Jan 12, 2026",status:"Verified"},
{id:"kra",name:"KRA PIN Certificate",filename:"kra_pin.pdf",date:"Jan 12, 2026",status:"Verified"},
{id:"food",name:"Food handling certificate",filename:"food_safety.pdf",date:"Jan 14, 2026",status:"Pending"}
],
transactions:[
{id:"DT-9HY6J",date:"Oct 6, 2026 4:12 PM",customer:"Mary Wanjiku",amount:972,payment:"M-PESA",status:"Completed",type:"Order"},
{id:"DT-K4HR9",date:"Oct 6, 2026 3:45 PM",customer:"Peter Mwangi",amount:1440,payment:"Card",status:"Completed",type:"Order"},
{id:"DT-MN82P",date:"Oct 6, 2026 1:20 PM",customer:"Sarah Njeri",amount:650,payment:"Cash",status:"Completed",type:"Order"},
{id:"DT-PL93K",date:"Oct 5, 2026 7:18 PM",customer:"James Otieno",amount:1250,payment:"M-PESA",status:"Completed",type:"Order"},
{id:"DT-Q8L4M",date:"Oct 5, 2026 6:03 PM",customer:"Grace Akinyi",amount:720,payment:"Card",status:"Completed",type:"Order"}
],
settlements:[
{id:"ST-1003",date:"Sep 22, 2026",amount:12480,status:"Completed",reference:"MPESA-PAYOUT-1003"},
{id:"ST-1002",date:"Sep 15, 2026",amount:14320,status:"Completed",reference:"MPESA-PAYOUT-1002"},
{id:"ST-1001",date:"Sep 8, 2026",amount:11650,status:"Completed",reference:"MPESA-PAYOUT-1001"}
],
notices:[{id:"n1",text:"New order received",time:"2 min ago",read:false},{id:"n2",text:"Payout processed",time:"1 hour ago",read:false},{id:"n3",text:"Menu item updated",time:"Yesterday",read:false}],
commission:10,categories:["Breakfast","Burgers","Wraps","Sides","Drinks","Combos"],menus:["Weekend Menu (Active)","Weekday Menu","Breakfast Menu"],selectedMenu:"Weekend Menu (Active)",
business:{legalName:"Deetoo Test Merchant",displayName:"Deetoo Test Merchant",description:"Local testing business serving great food through DeeToo.",type:"Restaurant",phone:"+254 700 123 456",email:"merchant@deetoo.test",address:"Kalimoni, Juja",country:"Kenya"}
};
type DemoCtx={data:MerchantDemo; update:(fn:(prev:MerchantDemo)=>MerchantDemo)=>void; reset:()=>void; toast:string; announce:(text:string)=>void; };
const DemoContext=createContext<DemoCtx|null>(null);
const STORE_KEY="deetoo-merchant-prototype-phase1-v1";
export function DemoProvider({children}:{children:ReactNode}){
 const [data,setData]=useState<MerchantDemo>(()=>{try{const saved=localStorage.getItem(STORE_KEY); return saved?{...initialDemo,...JSON.parse(saved)}:initialDemo;}catch{return initialDemo;}});
 const [toast,setToast]=useState("");
 useEffect(()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify(data));}catch{}},[data]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(timer);},[toast]);
 const value=useMemo(()=>({data,update:setData,reset:()=>{setData(initialDemo);setToast("Demo data reset");},toast,announce:setToast}),[data,toast]);
 return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemo(){const ctx=useContext(DemoContext);if(!ctx)throw new Error("DemoProvider missing");return ctx;}
export const cash=(amount:number)=>"Ksh "+amount.toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
export const uid=()=>Math.random().toString(36).slice(2,9);
