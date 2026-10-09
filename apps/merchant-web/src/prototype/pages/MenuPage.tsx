import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Edit3, Filter, Grid2X2, Layers3, List, MoreHorizontal, Plus, RefreshCw, Search, SlidersHorizontal, Store, Trash2, Utensils, X } from "lucide-react";
import { cash, foodPhotos, uid, useDemo, type FoodItem } from "../model";
import { CountTile, Field, HeaderTitle, Modal, Pill } from "../MerchantPrototype";
const blank=(category="Burgers"):FoodItem=>({id:"",name:"",description:"",category,price:0,available:true,image:foodPhotos.burger,sku:"",stock:0,modifiers:[]});
const categoryIcon:Record<string,string>={Breakfast:"☕",Burgers:"🍔",Wraps:"🥪",Sides:"🍟",Drinks:"🥤",Combos:"📦"};
export function MenuPage({search,navigate}:{search:string;navigate:(page:string)=>void}){
 const {data,update,announce}=useDemo();
 const [tab,setTab]=useState("all");
 const [category,setCategory]=useState("All categories");
 const [sort,setSort]=useState("Name (A-Z)");
 const [view,setView]=useState<"grid"|"list">("grid");
 const [localSearch,setLocalSearch]=useState("");
 const [filterOpen,setFilterOpen]=useState(false);
 const [minPrice,setMinPrice]=useState("");
 const [maxPrice,setMaxPrice]=useState("");
 const [editor,setEditor]=useState<FoodItem|null>(null);
 const [actions,setActions]=useState<string|null>(null);
 const [deleteItem,setDeleteItem]=useState<FoodItem|null>(null);
 const [categoryOpen,setCategoryOpen]=useState(false);
 const [categoryName,setCategoryName]=useState("");
 const [manageCategories,setManageCategories]=useState(false);
 const [modifierOpen,setModifierOpen]=useState(false);
 const [modifierName,setModifierName]=useState("");
 const [servingOpen,setServingOpen]=useState(false);
 const [serving,setServing]=useState<string[]>(data.servingBranches);
 const [menuOpen,setMenuOpen]=useState(false);
 const [newMenu,setNewMenu]=useState("");
 const [scope,setScope]=useState("Menu catalogue");
 const available=data.items.filter(i=>i.available).length;
 const filtered=useMemo(()=>data.items.filter(i=>{
 if(category!=="All categories"&&i.category!==category)return false;
 if(tab==="available"&&!i.available)return false;
 if(tab==="unavailable"&&i.available)return false;
 if(!["all","available","unavailable"].includes(tab))return false;
 const q=(search+" "+localSearch).trim().toLowerCase();
 if(q&&![i.name,i.description,i.category,i.sku].some(v=>v.toLowerCase().includes(q)))return false;
 if(minPrice&&i.price<Number(minPrice))return false;
 if(maxPrice&&i.price>Number(maxPrice))return false;
 return true;
 }).sort((a,b)=>sort==="Name (A-Z)"?a.name.localeCompare(b.name):sort==="Name (Z-A)"?b.name.localeCompare(a.name):sort==="Price (low-high)"?a.price-b.price:sort==="Price (high-low)"?b.price-a.price:0),[data.items,tab,category,sort,search,localSearch,minPrice,maxPrice]);
 const toggle=(id:string)=>{update(p=>({...p,items:p.items.map(i=>i.id===id?{...i,available:!i.available}:i)}));announce("Item availability updated locally");};
 const save=(e:React.FormEvent)=>{e.preventDefault();if(!editor||!editor.name.trim()||editor.price<0)return;const item={...editor,id:editor.id||uid(),sku:editor.sku||"DT-"+uid().toUpperCase()};update(p=>({...p,items:editor.id?p.items.map(i=>i.id===item.id?item:i):[item,...p.items]}));announce(editor.id?"Food item updated":"New food item added");setEditor(null);};
 const duplicate=(i:FoodItem)=>{update(p=>({...p,items:[{...i,id:uid(),sku:i.sku+"-COPY",name:i.name+" (Copy)",available:false},...p.items]}));setActions(null);announce("Item duplicated as unavailable");};
 const deleteFood=()=>{if(!deleteItem)return;update(p=>({...p,items:p.items.filter(i=>i.id!==deleteItem.id)}));announce("Food item deleted locally");setDeleteItem(null);setActions(null);};
 const saveCategory=(e:React.FormEvent)=>{e.preventDefault();const next=categoryName.trim();if(!next)return;update(p=>({...p,categories:p.categories.includes(next)?p.categories:[...p.categories,next]}));announce("Category added");setCategoryOpen(false);setCategoryName("");};
 const addModifier=(e:React.FormEvent)=>{e.preventDefault();const name=modifierName.trim();if(!name)return; if(!data.items.length)return;update(p=>({...p,items:p.items.map((i,index)=>index===0?{...i,modifiers:[...i.modifiers,name]}:i)}));announce("Modifier added to Smash Burger (demo)");setModifierName("");setModifierOpen(false);};
 return <div className="mp-page mp-menu-page">
 <HeaderTitle eyebrow="Menu management" title="Menu & availability" description="Manage your food menu, categories, pricing and availability across DeeToo."/>
 <div className="mp-stat-grid">
 <CountTile icon={Utensils} label="Total items" value={data.items.length} caption={available+" available · "+(data.items.length-available)+" unavailable"} accent="mint" action={()=>setTab("all")}/>
 <CountTile icon={Layers3} label="Categories" value={data.categories.length} caption="Organize your menu" accent="orange" action={()=>setManageCategories(true)}/>
 <CountTile icon={Check} label="Visible to customers" value={available} caption="Items currently available" accent="mint" action={()=>setTab("available")}/>
 <CountTile icon={X} label="Unavailable items" value={data.items.length-available} caption="Items hidden from customers" accent="red" action={()=>setTab("unavailable")}/>
 </div>
 <div className="mp-list-toolbar mp-menu-toolbar"><div className="mp-tabs" role="group" aria-label="Menu item filters">
 {[["all","All items",data.items.length],["available","● Available",available],["unavailable","● Unavailable",data.items.length-available],["categories","Categories",data.categories.length],["modifiers","Modifiers & Add-ons",data.items.flatMap(i=>i.modifiers).length]].map(([key,label,count])=><button key={key} className={tab===key?"active":""} onClick={()=>{setTab(String(key));if(key==="categories")setManageCategories(true);if(key==="modifiers")setModifierOpen(true);}}>{label} ({count})</button>)}</div>
 <div className="mp-toolbar-end"><label className="mp-local-search"><Search size={18}/><input aria-label="Search food items" placeholder="Search food items..." value={localSearch} onChange={e=>setLocalSearch(e.target.value)}/></label>
 <div className="mp-popover-anchor"><button className="mp-outline" onClick={()=>setFilterOpen(!filterOpen)}><Filter size={17}/> Filter</button>{filterOpen&&<div className="mp-filter-popover"><h3>Price range</h3><Field label="Minimum (Ksh)"><input type="number" min="0" value={minPrice} onChange={e=>setMinPrice(e.target.value)}/></Field><Field label="Maximum (Ksh)"><input type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)}/></Field><button className="mp-outline" onClick={()=>{setMinPrice("");setMaxPrice("");setFilterOpen(false);}}>Clear filters</button><button className="mp-primary" onClick={()=>setFilterOpen(false)}>Apply</button></div>}</div>
 <button className="mp-primary" onClick={()=>setEditor(blank(category==="All categories"?"Burgers":category))}><Plus size={18}/> Add food item</button></div></div>
 <div className="mp-menu-extra"><label className="mp-select-control"><strong>MENU:</strong><select aria-label="Choose menu" value={data.selectedMenu} onChange={e=>update(p=>({...p,selectedMenu:e.target.value}))}>{data.menus.map(m=><option key={m}>{m}</option>)}</select><ChevronDown size={13}/></label><button className="mp-quiet-button" onClick={()=>setMenuOpen(true)}>+ Add Menu</button>
 <label className="mp-select-control"><strong>CATALOGUE SCOPE:</strong><select aria-label="Catalogue scope" value={scope} onChange={e=>setScope(e.target.value)}><option>Menu catalogue</option><option>Branch overrides</option></select></label>
 <button className="mp-quiet-button" onClick={()=>setModifierOpen(true)}><SlidersHorizontal size={16}/> Modifiers & Add-ons</button>
 <button className="mp-quiet-button" onClick={()=>{setServing([...data.servingBranches]);setServingOpen(true);}}><Store size={16}/> Branch Serving</button>
 <button className="mp-quiet-button" onClick={()=>setCategoryOpen(true)}><Plus size={16}/> Add Category</button><button className="mp-quiet-button" onClick={()=>announce("Catalogue refreshed from local prototype state")} aria-label="Refresh menu"><RefreshCw size={17}/></button>
 </div>
 <div className="mp-menu-layout">
 <aside className="mp-panel mp-categories"><div className="mp-panel-heading"><h2>Food categories</h2><button className="mp-outline" onClick={()=>{setCategoryName("");setCategoryOpen(true);}}><Plus size={16}/> Add</button></div>
 {["All categories",...data.categories].map(c=><button key={c} className={"mp-category-row "+(category===c?"selected":"")} onClick={()=>setCategory(c)}><span className="mp-category-pictogram">{c==="All categories"?<Grid2X2 size={20}/>:categoryIcon[c]||"🍽"}</span><strong>{c}</strong><b>{c==="All categories"?data.items.length:data.items.filter(i=>i.category===c).length}</b></button>)}
 <div className="mp-serving-sidebar"><strong>Serving Branches:</strong><p>✓ {data.branch}</p><button onClick={()=>setServingOpen(true)}>Manage branch serving</button></div>
 </aside>
 <section className="mp-menu-results"><div className="mp-results-header"><h2>Menu items ({filtered.length})</h2><div><label>Sort by <select aria-label="Sort food items" value={sort} onChange={e=>setSort(e.target.value)}><option>Name (A-Z)</option><option>Name (Z-A)</option><option>Price (low-high)</option><option>Price (high-low)</option></select></label><button className={"mp-view-button "+(view==="grid"?"chosen":"")} aria-label="Grid view" onClick={()=>setView("grid")}><Grid2X2 size={20}/></button><button className={"mp-view-button "+(view==="list"?"chosen":"")} aria-label="List view" onClick={()=>setView("list")}><List size={20}/></button></div></div>
 {filtered.length?<div className={"mp-food-grid "+(view==="list"?"mp-food-list":"")}>{filtered.map(food=><article className="mp-food-card" key={food.id}>
 <div className="mp-food-photo"><img src={food.image||foodPhotos.burger} alt={food.name} loading="lazy" onError={e=>{e.currentTarget.src=foodPhotos.burger;}}/><Pill tone={food.available?"green":"red"}>{food.available?"Available":"Unavailable"}</Pill><button className="mp-item-more" onClick={()=>setActions(actions===food.id?null:food.id)} aria-label={"More actions for "+food.name}><MoreHorizontal size={21}/></button>
 {actions===food.id&&<div className="mp-item-menu"><button onClick={()=>{setEditor({...food});setActions(null);}}><Edit3 size={15}/> Edit</button><button onClick={()=>duplicate(food)}><Copy size={15}/> Duplicate</button><button onClick={()=>{setDeleteItem(food);setActions(null);}}><Trash2 size={15}/> Delete</button></div>}</div>
 <div className="mp-food-details"><h3>{food.name}</h3><p>{food.description}</p><span className="mp-food-category">{food.category}</span><div><strong>{cash(food.price)}</strong><label className="mp-toggle" aria-label={"Availability for "+food.name}><input type="checkbox" checked={food.available} onChange={()=>toggle(food.id)}/><span/></label></div></div>
 </article>)}</div>:<div className="mp-no-items"><Utensils size={36}/><h3>No items match</h3><p>Try clearing your filters or adding a new item.</p><button className="mp-outline" onClick={()=>{setCategory("All categories");setTab("all");setLocalSearch("");setMinPrice("");setMaxPrice("");}}>Clear filters</button></div>}
 </section></div>
 <Modal open={Boolean(editor)} title={editor?.id?"Edit food item":"Add food item"} onClose={()=>setEditor(null)} width="640px">
 {editor&&<form onSubmit={save} className="mp-form-grid"><Field label="Food item name *"><input required value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></Field>
 <Field label="Category"><select value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}>{data.categories.map(c=><option key={c}>{c}</option>)}</select></Field>
 <Field label="Price (Ksh) *"><input required type="number" min="0" step=".01" value={editor.price} onChange={e=>setEditor({...editor,price:Number(e.target.value)})}/></Field>
 <Field label="SKU"><input value={editor.sku} onChange={e=>setEditor({...editor,sku:e.target.value})} placeholder="Auto-generated if blank"/></Field>
 <Field label="Description"><textarea rows={3} value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})}/></Field>
 <Field label="Photo URL"><input type="url" value={editor.image} onChange={e=>setEditor({...editor,image:e.target.value})}/></Field>
 <Field label="Inventory quantity"><input type="number" min="0" value={editor.stock} onChange={e=>setEditor({...editor,stock:Number(e.target.value)})}/></Field>
 <Field label="Modifiers & Add-ons (comma-separated)"><input value={editor.modifiers.join(", ")} onChange={e=>setEditor({...editor,modifiers:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)})}/></Field>
 <label className="mp-inline-check"><input type="checkbox" checked={editor.available} onChange={e=>setEditor({...editor,available:e.target.checked})}/> Available to customers</label>
 <div className="mp-dialog-actions"><button type="button" className="mp-outline" onClick={()=>setEditor(null)}>Cancel</button><button className="mp-primary" type="submit">Save food item</button></div></form>}
 </Modal>
 <Modal open={Boolean(deleteItem)} title="Delete food item?" onClose={()=>setDeleteItem(null)}><p>Delete <strong>{deleteItem?.name}</strong> from this local menu? This is a prototype action.</p><div className="mp-dialog-actions"><button className="mp-outline" onClick={()=>setDeleteItem(null)}>Cancel</button><button className="mp-danger" onClick={deleteFood}>Delete item</button></div></Modal>
 <Modal open={categoryOpen} title="Add category" onClose={()=>setCategoryOpen(false)}><form onSubmit={saveCategory}><Field label="Category name *"><input required value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="e.g. Desserts"/></Field><div className="mp-dialog-actions"><button type="button" className="mp-outline" onClick={()=>setCategoryOpen(false)}>Cancel</button><button className="mp-primary" type="submit">Add category</button></div></form></Modal>
 <Modal open={manageCategories} title="Manage categories" onClose={()=>{setManageCategories(false);setTab("all");}}><div className="mp-list-dialog">{data.categories.map(c=><div key={c}><strong>{c}</strong><span>{data.items.filter(i=>i.category===c).length} items</span><button className="mp-outline" disabled={data.items.some(i=>i.category===c)} onClick={()=>update(p=>({...p,categories:p.categories.filter(x=>x!==c)}))}>Delete</button></div>)}</div><button className="mp-primary" onClick={()=>{setManageCategories(false);setTab("all");setCategoryOpen(true);}}>+ Add category</button></Modal>
 <Modal open={modifierOpen} title="Modifiers & Add-ons" onClose={()=>{setModifierOpen(false);setTab("all");}}><p className="mp-muted">Create add-on choices for food items. Use Edit food item to attach modifiers to specific products.</p>
 {data.items.filter(i=>i.modifiers.length).map(i=><div className="mp-list-dialog" key={i.id}><div><strong>{i.name}</strong><span>{i.modifiers.join(", ")}</span></div></div>)}
 <form onSubmit={addModifier}><Field label="Add an option to Smash Burger"><input required value={modifierName} onChange={e=>setModifierName(e.target.value)} placeholder="e.g. Extra cheese"/></Field><button type="submit" className="mp-primary">Add modifier</button></form></Modal>
 <Modal open={servingOpen} title="Branch serving" onClose={()=>setServingOpen(false)}><p className="mp-muted">Choose which branches should offer this menu in the prototype.</p>{data.branches.map(b=><label className="mp-inline-check" key={b}><input type="checkbox" checked={serving.includes(b)} onChange={e=>setServing(previous=>e.target.checked?[...previous,b]:previous.filter(x=>x!==b))}/> {b}</label>)}<div className="mp-dialog-actions"><button className="mp-primary" onClick={()=>{update(p=>({...p,servingBranches:serving}));setServingOpen(false);announce("Branch serving preferences saved locally");}}>Save branches</button></div></Modal>
 <Modal open={menuOpen} title="Create menu" onClose={()=>setMenuOpen(false)}><form onSubmit={e=>{e.preventDefault();if(!newMenu.trim())return;update(p=>({...p,menus:[...p.menus,newMenu],selectedMenu:newMenu}));setNewMenu("");setMenuOpen(false);announce("Menu created");}}><Field label="Menu name"><input required value={newMenu} onChange={e=>setNewMenu(e.target.value)} placeholder="e.g. Holiday Menu"/></Field><div className="mp-dialog-actions"><button className="mp-outline" type="button" onClick={()=>setMenuOpen(false)}>Cancel</button><button className="mp-primary" type="submit">Create menu</button></div></form></Modal>
 </div>;
}
