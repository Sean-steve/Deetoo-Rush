import {seedPhaseTwo} from "./phase2Data";
import React, {createContext, useContext, useEffect, useReducer, useState} from "react";
import {AdminRole, DemoAction, DemoState, reducer, seedDemo} from "./data";
const KEY = "deetoo.admin-next.phase1.v1";
function load(): DemoState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && [1,2].includes(saved.version) && Array.isArray(saved.orders) && Array.isArray(saved.riders) && saved.orders.length && saved.riders.length) return saved.version===1 || !saved.phase2 ? {...saved,version:2,phase2:seedPhaseTwo()} : saved;
  } catch { /* corrupt local demo data safely resets */ }
  return seedDemo();
}
type Store = {data:DemoState; act:(a:DemoAction)=>void; role:AdminRole; setRole:(r:AdminRole)=>void; reset:()=>void};
const Context=createContext<Store|null>(null);
export function DemoProvider({children}:{children:React.ReactNode}){
  const [data,dispatch]=useReducer(reducer,undefined,load);
  const [role,setRole]=useState<AdminRole>("SUPER_ADMIN");
  useEffect(()=>{localStorage.setItem(KEY,JSON.stringify(data));},[data]);
  return <Context.Provider value={{data,act:dispatch,role,setRole,reset:()=>dispatch({type:"RESET"})}}>{children}</Context.Provider>;
}
export function useDemo(){const context=useContext(Context);if(!context)throw new Error("DemoProvider is missing");return context;}
export function canAct(role:AdminRole,action:"order"|"dispatch"|"rider"|"review"|"reset"|"incident"|"support"|"resolve"|"merchant"|"customer"|"delete"):boolean{
  if(role==="SUPER_ADMIN")return true;
  if(role==="OPERATIONS")return !["reset","customer","delete"].includes(action);
  return action==="support";
}
