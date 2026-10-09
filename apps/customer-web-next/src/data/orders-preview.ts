/**
 * STATIC DESIGN FIXTURES for Screens 08–10.
 * None of the statuses, riders, times, GPS coordinates, routes, ratings, or
 * financial amounts below are fetched from DeeToo's production systems.
 * Never persist, charge, dispatch, contact, or submit ratings from this module.
 * The typed view models will be populated by authenticated customer APIs in Phase 2.
 */
export type DemoOrderStatus = "on_the_way" | "preparing" | "delivered" | "cancelled";
export type DemoLine = {id:string;name:string;quantity:number;unitPrice:number;image:string;description:string};
export type DemoOrder = {
  id:string; restaurantId:string; restaurant:string;branch:string;
  placedAt:string; placedTime:string; status:DemoOrderStatus;
  lines:DemoLine[];deliveryFee:number;serviceFee:number;discount:number;
  stageTimes:[string,string,string?,string?];
  rider?:{name:string;rating:number;trips:number;plate:string;vehicle:string};
};
const img=(id:string)=>"https://images.unsplash.com/"+id+"?auto=format&fit=crop&w=320&q=82";
export const itemPhotos={
  burger:img("photo-1568901346375-23c9450c58cd"),
  fries:img("photo-1573080496219-bb080dd4f877"),
  cola:img("photo-1622483767028-3f66f32aef97"),
  pizza:img("photo-1574071318508-1cdbab80d002"),
  chicken:img("photo-1532550907401-a500c9a57435"),
};
const classicItems:DemoLine[]=[
  {id:"smash",name:"Smash Burger",quantity:1,unitPrice:850,image:itemPhotos.burger,description:"Beef patty · Brioche bun · Extra cheese · No onions"},
  {id:"fries",name:"French Fries",quantity:1,unitPrice:350,image:itemPhotos.fries,description:"Large size"},
  {id:"cola",name:"Coca Cola",quantity:1,unitPrice:200,image:itemPhotos.cola,description:"500 ml"},
];
export const demoOrders:DemoOrder[]=[
  {
    id:"DT-E2ZG5",restaurantId:"smash",restaurant:"Deetoo Test Merchant",branch:"Juja Branch",
    placedAt:"2026-10-08T15:54:00",placedTime:"Oct 8, 2026 at 3:54 PM",status:"on_the_way",
    lines:classicItems,deliveryFee:100,serviceFee:35,discount:0,
    stageTimes:["3:54 PM","4:02 PM","4:12 PM"],
    rider:{name:"John Kamau",rating:4.8,trips:320,plate:"KMF 123X",vehicle:"Honda 125cc · Green jacket"},
  },
  {
    id:"DT-XRSEP",restaurantId:"pizza",restaurant:"Pizza Palace",branch:"Juja Branch",
    placedAt:"2026-10-07T15:34:00",placedTime:"Oct 7, 2026 at 3:34 PM",status:"preparing",
    lines:[{id:"pizza",name:"Stone-Baked Pizza",quantity:1,unitPrice:850,image:itemPhotos.pizza,description:"Regular · Classic crust"}],
    deliveryFee:100,serviceFee:22,discount:0,stageTimes:["3:34 PM","3:36 PM"],
  },
  {
    id:"DT-6Z6X6",restaurantId:"juja-grill",restaurant:"Juja Grill House",branch:"Juja Branch",
    placedAt:"2026-10-06T16:02:00",placedTime:"Oct 6, 2026 at 4:02 PM",status:"delivered",
    lines:classicItems,deliveryFee:100,serviceFee:35,discount:0,
    stageTimes:["4:02 PM","4:12 PM","4:28 PM","4:45 PM"],
    rider:{name:"John Kamau",rating:4.8,trips:320,plate:"KMF 123X",vehicle:"Honda 125cc · Green jacket"},
  },
  {
    id:"DT-K4HR9",restaurantId:"smash",restaurant:"Burger Spot",branch:"Juja Branch",
    placedAt:"2026-10-05T14:11:00",placedTime:"Oct 5, 2026 at 2:11 PM",status:"cancelled",
    lines:[{id:"smash",name:"Smash Burger",quantity:1,unitPrice:850,image:itemPhotos.burger,description:"Standard recipe"}],
    deliveryFee:0,serviceFee:0,discount:0,stageTimes:["2:11 PM","—"],
  },
];
export const orderItemsTotal=(order:DemoOrder)=>order.lines.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0);
export const orderTotal=(order:DemoOrder)=>orderItemsTotal(order)+order.deliveryFee+order.serviceFee-order.discount;
export const demoSnapshotDate="2026-10-08";
