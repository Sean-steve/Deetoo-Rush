import {seedPhaseTwo, reducePhaseTwo} from "./phase2Data";
import type {PhaseTwoState, PhaseTwoAction} from "./phase2Data";
export type OrderStatus = "PREPARING" | "RIDER_ASSIGNED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED" | "DELAYED" | "CANCELLED";
export type RiderStatus = "AVAILABLE" | "ON_DELIVERY" | "OFFLINE" | "SUSPENDED";
export type AdminRole = "SUPER_ADMIN" | "OPERATIONS" | "SUPPORT";
export type Area = { name: string; county: string; lat: number; lng: number };
export type HistoryEntry = { at: string; event: string; by: string; detail: string };
export type Order = {
  id: string; merchant: string; area: string; pickup: Area; destination: Area;
  customer: string; customerPhone: string; riderId: string | null; status: OrderStatus;
  createdAt: string; etaMinutes: number; delayMinutes: number; subtotal: number; deliveryFee: number; serviceFee: number;
  items: { name: string; qty: number; price: number }[]; paymentMethod: "M-PESA" | "Card" | "Cash";
  paymentStatus: "Paid" | "Pending" | "Refunded"; notes: string[]; history: HistoryEntry[];
};
export type Rider = {
  id: string; name: string; phone: string; email: string; status: RiderStatus; onboarding: "VERIFIED" | "PENDING_REVIEW";
  area: Area; vehicle: string; plate: string; rating: number; deliveries: number;
  joinedAt: string; locationUpdatedAt: string; approved: boolean;
};
export type Incident = { id: string; title: string; status: string; type: string; time: string };
export type Ticket = { id: string; title: string; status: string; from: string; time: string };
export type DemoState = { version: number; orders: Order[]; riders: Rider[]; incidents: Incident[]; tickets: Ticket[]; activity: HistoryEntry[]; phase2: PhaseTwoState };
export const areas: Area[] = [
  { name: "Westlands", county: "Nairobi", lat: -1.2636, lng: 36.8031 },
  { name: "Kilimani", county: "Nairobi", lat: -1.2891, lng: 36.7866 },
  { name: "CBD", county: "Nairobi", lat: -1.2864, lng: 36.8172 },
  { name: "Lavington", county: "Nairobi", lat: -1.2730, lng: 36.7708 },
  { name: "Karen", county: "Nairobi", lat: -1.3250, lng: 36.7062 },
  { name: "Upper Hill", county: "Nairobi", lat: -1.2999, lng: 36.8155 },
  { name: "Embakasi", county: "Nairobi", lat: -1.3183, lng: 36.9068 },
  { name: "Kasarani", county: "Nairobi", lat: -1.2228, lng: 36.8975 },
  { name: "South B", county: "Nairobi", lat: -1.3095, lng: 36.8331 },
  { name: "Roysambu", county: "Nairobi", lat: -1.2171, lng: 36.8846 },
  { name: "Ngong", county: "Kajiado", lat: -1.3565, lng: 36.6707 },
  { name: "Thika Road", county: "Kiambu", lat: -1.2187, lng: 36.8795 },
];
export const merchants = ["Java House", "Pizza Inn", "KFC", "Artcaffe", "Carrefour", "Chicken Inn", "Naivas", "QuickMart", "Burger Point", "Galito's"];
export const customers = ["Sarah M.", "David O.", "Grace N.", "Peter K.", "Esther W.", "Brian K.", "Linda W.", "Alex T.", "James K.", "Mary A.", "Caroline N.", "Kevin B."];
export const firstNames = ["John", "Mary", "Collins", "Brian", "Esther", "Daniel", "Grace", "Peter", "Linda", "Alex", "Ann", "Kevin", "Janet", "Samuel", "Joy", "Alice"];
export const surnames = ["K.", "A.", "M.", "N.", "W.", "O.", "T.", "B.", "M.", "P."];
const dishes = ["Margherita Pizza (Large)", "Garlic Bread", "Coca Cola (500ml)", "Chicken Burger", "Fries", "Grilled Chicken", "Rice Bowl", "Chicken Wings"];
const baseTime = Date.parse("2026-10-09T10:24:00+03:00");
const at = (offsetMinutes: number) => new Date(baseTime + offsetMinutes * 60000).toISOString();
const event = (e: string, offsetMinutes: number, detail: string, by = "System"): HistoryEntry => ({ event: e, at: at(offsetMinutes), detail, by });
export const ORDER_LIFECYCLE: OrderStatus[] = ["PREPARING", "RIDER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];
export function orderTotal(order: Order): number { return order.subtotal + order.deliveryFee + order.serviceFee; }
export function isActive(order: Order): boolean { return !["DELIVERED", "CANCELLED"].includes(order.status); }
export function hasRider(order: Order): boolean { return Boolean(order.riderId); }
export function getRider(state: DemoState, id: string | null) { return id ? state.riders.find(r => r.id === id) : undefined; }
export function formatMoney(value: number): string { return "KES " + value.toLocaleString("en-KE"); }
export function displayTime(value: string): string { return new Date(value).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }); }
export function seedDemo(): DemoState {
  const riders: Rider[] = Array.from({length:276},(_,i) => {
    const n = i + 1;
    const status: RiderStatus = i < 98 ? "AVAILABLE" : i < 108 ? "ON_DELIVERY" : i < 270 ? "OFFLINE" : "SUSPENDED";
    const area = areas[(i * 7) % areas.length];
    return {
      id: "RDR" + String(n).padStart(4, "0"), name: firstNames[i % firstNames.length] + " " + surnames[(i + Math.floor(i / 4)) % surnames.length],
      phone: "+254 7" + String(12000000 + i * 237).slice(0, 8), email: "rider" + n + "@deetoo.example", status,
      onboarding: i >= 250 && i < 268 ? "PENDING_REVIEW" : "VERIFIED",
      area, vehicle: i % 7 === 0 ? "Bicycle" : "Motorbike", plate: "KMF " + (120 + i) + "A",
      rating: Number((4.5 + (i % 5) / 10).toFixed(1)), deliveries: 4 + i % 28,
      joinedAt: at(-i * 24), locationUpdatedAt: at(-2 - i % 22), approved: i < 250 || i >= 268,
    };
  });
  const orders: Order[] = Array.from({length:142}, (_,i) => {
    const n = i + 1;
    const status: OrderStatus = i < 6 ? "DELAYED" : i < 10 ? "PREPARING" : i < 12 ? "RIDER_ASSIGNED" : i < 14 ? "IN_TRANSIT" : i < 18 ? "CANCELLED" : "DELIVERED";
    const pickup = areas[(i * 3) % areas.length];
    const destination = areas[(i * 3 + 2) % areas.length];
    const assigned = ["RIDER_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELAYED"].includes(status) ? riders[98 + i].id : null;
    const items = [{ name: dishes[i % dishes.length], qty: 1, price: 850 + i % 4 * 150 }, { name: dishes[(i + 1) % dishes.length], qty: 1, price: 350 + i % 3 * 100 }];
    const subtotal = items.reduce((sum,item)=>sum+item.qty*item.price,0);
    const history = [event("Order placed", -11 - i * 6, "Customer placed order"),event("Merchant accepted", -9 - i * 6, "Merchant confirmed the order"),event("Preparing", -6 - i * 6, "Kitchen started preparing")];
    if (assigned) history.push(event("Rider assigned", -3 - i * 6, "Assigned to " + riders[98 + i].name));
    if (status === "IN_TRANSIT" || status === "DELIVERED") history.push(event("Picked up", -2 - i * 6, "Rider collected items"));
    if (status === "DELIVERED") history.push(event("Delivered", -i * 6, "Delivery completed"));
    if (status === "CANCELLED") history.push(event("Cancelled", -i * 6, "Order cancelled"));
    return {
      id: "DR" + (78291 - i), merchant: merchants[i % merchants.length], area: pickup.name, pickup, destination,
      customer: customers[i % customers.length], customerPhone: "+254 712 345 " + String(678 + i % 300),
      riderId: assigned, status, createdAt: at(-12 - i * 6), etaMinutes: 28 + i % 18,
      delayMinutes: status === "DELAYED" ? 16 + i * 3 : 0, subtotal, deliveryFee: 200, serviceFee: 100, items,
      paymentMethod: i % 8 === 0 ? "Card" : "M-PESA", paymentStatus: status === "CANCELLED" ? "Refunded" : "Paid",
      notes: i === 0 ? ["Please make sure the food is well done. Thank you!"] : [], history,
    };
  });
  return { version: 2, orders, riders, phase2:seedPhaseTwo(),
    incidents: [
      {id:"INC-7842",type:"Delivery",title:"Rider accident reported",status:"Investigating",time:"09:42"},
      {id:"INC-7841",type:"Payment",title:"Failed M-PESA payments",status:"Acknowledged",time:"08:15"},
      {id:"INC-7840",type:"Merchant",title:"Merchant operating outside hours",status:"Open",time:"07:33"},
      {id:"INC-7839",type:"System",title:"Dispatch delay increase",status:"Investigating",time:"06:21"},
    ],
    tickets: [
      {id:"SUP-1042",from:"Customer",title:"Order not delivered",status:"Open",time:"09:58"},
      {id:"SUP-1034",from:"Merchant",title:"Payment not received",status:"In Progress",time:"09:21"},
      {id:"SUP-1029",from:"Rider",title:"Account reactivation",status:"Open",time:"08:47"},
      {id:"SUP-1022",from:"Customer",title:"Refund request",status:"Waiting",time:"07:12"},
      {id:"SUP-1020",from:"Merchant",title:"Menu update issue",status:"In Progress",time:"06:53"},
    ],
    activity: [event("Demo started",0,"Shared operational workspace initialized")],
  };
}
export type DemoAction = PhaseTwoAction
  | { type:"ASSIGN_RIDER"; orderId:string; riderId:string }
  | { type:"UNASSIGN_RIDER"; orderId:string }
  | { type:"UPDATE_ORDER"; orderId:string; status:OrderStatus; reason?:string }
  | { type:"CANCEL_ORDER"; orderId:string; reason:string }
  | { type:"ADD_NOTE"; orderId:string; note:string }
  | { type:"UPDATE_RIDER"; riderId:string; status:RiderStatus; reason:string }
  | { type:"REVIEW_RIDER"; riderId:string; approved:boolean; reason:string }
  | { type:"ADD_RIDER"; name:string; phone:string; area:string }
  | { type:"RESET" };
function logActivity(state: DemoState, action: string, text: string): HistoryEntry[] {
  return [event(action, 0, text, "Demo Admin"),...state.activity].slice(0,60);
}
export function reducer(state:DemoState, action:DemoAction):DemoState {
  if (action.type.startsWith("PHASE2_")) {
    const next=reducePhaseTwo(state.phase2, action as PhaseTwoAction);
    if(action.type==="PHASE2_MERCHANT_EDIT"){
      const previous=state.phase2.merchants.find(m=>m.id===action.id);
      return {...state,phase2:next,orders:state.orders.map(o=>o.merchant===previous?.name?{...o,merchant:action.name.trim()}:o)};
    }
    if(action.type==="PHASE2_CUSTOMER_EDIT"){
      const previous=state.phase2.customers.find(c=>c.id===action.id);
      return {...state,phase2:next,orders:state.orders.map(o=>o.customer===previous?.name?{...o,customer:action.name.trim(),customerPhone:action.phone}:o)};
    }
    return {...state,phase2:next};
  }
  if (action.type === "RESET") return seedDemo();
  if (action.type === "ADD_RIDER") {
    if (action.name.trim().length < 3 || action.phone.trim().length < 8) return state;
    const nextId = "RDR" + String(Math.max(0, ...state.riders.map(r => Number(r.id.replace("RDR",""))||0))+1).padStart(4,"0");
    const area = areas.find(a=>a.name===action.area)||areas[0];
    const rider: Rider = {id: nextId, name: action.name.trim(), phone: action.phone.trim(), email:"pending-"+nextId.toLowerCase()+"@deetoo.example",status:"OFFLINE",onboarding:"PENDING_REVIEW",area,vehicle:"Motorbike",plate:"Not supplied",rating:0,deliveries:0,joinedAt:at(0),locationUpdatedAt:at(0),approved:false};
    return {...state,riders:[rider,...state.riders],activity:logActivity(state,"New rider application",rider.name)};
  }
  if (action.type === "ASSIGN_RIDER") {
    const rider = state.riders.find(r=>r.id === action.riderId);
    const order = state.orders.find(o=>o.id === action.orderId);
    if (!rider || rider.status !== "AVAILABLE" || rider.onboarding !== "VERIFIED" || !rider.approved || !order || !isActive(order) || order.riderId) return state;
    return { ...state,
      orders:state.orders.map(o=>o.id===order.id?{...o,riderId:rider.id,status:"RIDER_ASSIGNED",delayMinutes:0,history:[...o.history,event("Rider assigned",0,"Assigned to " + rider.name,"Demo Admin")]}:o),
      riders:state.riders.map(r=>r.id===rider.id?{...r,status:"ON_DELIVERY"}:r),
      activity:logActivity(state,"Rider assigned",rider.name+" assigned to "+order.id),
    };
  }
  if (action.type === "UNASSIGN_RIDER") {
    const order=state.orders.find(o=>o.id===action.orderId);
    if (!order || !order.riderId || !isActive(order)) return state;
    return {...state,orders:state.orders.map(o=>o.id===order.id?{...o,riderId:null,status:"PREPARING",history:[...o.history,event("Rider unassigned",0,"Order moved to assignment queue","Demo Admin")]}:o),
      riders:state.riders.map(r=>r.id===order.riderId?{...r,status:"AVAILABLE"}:r),
      activity:logActivity(state,"Rider unassigned","Rider released from "+order.id)};
  }
  if (action.type === "UPDATE_ORDER") {
    const order=state.orders.find(o=>o.id===action.orderId);
    if (!order || !isActive(order) || action.status==="CANCELLED" || (["PICKED_UP","IN_TRANSIT","DELIVERED"].includes(action.status) && !order.riderId))return state;
    return {...state,orders:state.orders.map(o=>o.id===order.id?{...o,status:action.status,delayMinutes:action.status==="DELAYED"?Math.max(1,o.delayMinutes):0,history:[...o.history,event(action.status.replaceAll("_"," "),0,action.reason || "Status updated","Demo Admin")]}:o),
      riders: action.status==="DELIVERED" ? state.riders.map(r=>r.id===order.riderId?{...r,status:"AVAILABLE",deliveries:r.deliveries+1}:r):state.riders,
      activity:logActivity(state,"Order status",order.id+" → "+action.status)};
  }
  if (action.type==="CANCEL_ORDER") {
    const order=state.orders.find(o=>o.id===action.orderId);
    if(!order || !isActive(order) || action.reason.trim().length < 3)return state;
    return {...state,orders:state.orders.map(o=>o.id===order.id?{...o,status:"CANCELLED",delayMinutes:0,history:[...o.history,event("Cancelled",0,action.reason.trim(),"Demo Admin")]}:o),
      riders:state.riders.map(r=>r.id===order.riderId?{...r,status:"AVAILABLE"}:r),
      activity:logActivity(state,"Order cancelled",order.id+": "+action.reason.trim())};
  }
  if(action.type==="ADD_NOTE") {
    if(action.note.trim().length<2)return state;
    return {...state,orders:state.orders.map(o=>o.id===action.orderId?{...o,notes:[...o.notes,action.note.trim()],history:[...o.history,event("Internal note",0,action.note.trim(),"Demo Admin")]}:o),
      activity:logActivity(state,"Order note",action.orderId)};
  }
  if(action.type==="UPDATE_RIDER") {
    const rider=state.riders.find(r=>r.id===action.riderId);
    if(!rider || action.reason.trim().length<3 || (rider.status==="ON_DELIVERY" && action.status==="SUSPENDED"))return state;
    return {...state,riders:state.riders.map(r=>r.id===rider.id?{...r,status:action.status}:r),
      activity:logActivity(state,"Rider status",rider.name+" → "+action.status+": "+action.reason.trim())};
  }
  if(action.type==="REVIEW_RIDER") {
    const rider=state.riders.find(r=>r.id===action.riderId);
    if(!rider || rider.onboarding !== "PENDING_REVIEW" || action.reason.trim().length<3)return state;
    return {...state,riders:state.riders.map(r=>r.id===rider.id?{...r,onboarding:"VERIFIED",approved:action.approved,status:action.approved?"OFFLINE":"SUSPENDED"}:r),
      activity:logActivity(state,"Rider verification",rider.name+": "+action.reason.trim())};
  }
  return state;
}