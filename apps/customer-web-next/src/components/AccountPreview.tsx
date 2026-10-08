import { useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bell, Bike, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock3, CreditCard, Crown, Eye, Gift, Globe2, Heart, House, Laptop, LifeBuoy,
  LockKeyhole, LogOut, MapPin, MessageSquare, MoreVertical, Pencil, Plus, RefreshCw,
  Search, Settings, Shield, ShieldCheck, ShoppingBag, Smartphone, Star, Tag, Trash2,
  UserRound, UsersRound, Wallet, X, Zap, Package, Store, AlertCircle, CalendarDays
} from "lucide-react";
import { Badge, Button, IconButton, Panel, classNames } from "../../../../packages/customer-ui/src/index";
import {
  demoAddresses, demoCustomer, demoDevices, demoLogins, demoNotifications, demoPayments,
  type PreviewAddress, type DemoNotification, type NoticeCategory
} from "../data/account-preview";
type Screen="profile"|"security"|"notifications";
type NavigateTarget="discover"|"search"|"bag"|"orders"|"profile"|"security"|"notifications"|"support";
type Props={screen:Screen;onNavigate:(target:NavigateTarget)=>void;onNotice:(message:string)=>void};
type SectionHeadingProps={icon:typeof House;title:string;description?:string;action?:React.ReactNode};
function DemoTag(){return <span className="dt-account-demo">Design preview · sample account</span>;}
function SectionTitle({icon:Icon,title,description,action}:SectionHeadingProps) {
  return <div className="dt-account-section-head"><span className="dt-account-icon"><Icon size={22}/></span><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action&&<div className="dt-account-head-action">{action}</div>}</div>;
}
function InfoRow({icon:Icon,title,detail,onClick,tail,danger=false}:{icon:typeof House;title:string;detail:string;onClick?:()=>void;tail?:React.ReactNode;danger?:boolean}) {
  const children=<><span className="dt-account-row-icon"><Icon size={23}/></span><span className="dt-account-row-text"><strong>{title}</strong><small>{detail}</small></span>{tail&&<span className="dt-account-row-tail">{tail}</span>}{onClick&&<ChevronRight size={18}/>}</>;
  return onClick?<button className={classNames("dt-account-info-row",danger&&"dt-account-row--danger")} type="button" onClick={onClick}>{children}</button>:<div className={classNames("dt-account-info-row",danger&&"dt-account-row--danger")}>{children}</div>;
}
function Header({title,description,children}:{title:string;description:string;children?:React.ReactNode}){
  return <header className="dt-account-pagehead"><div><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}
function Toggle({checked,onChange,label}:{checked:boolean;onChange:(value:boolean)=>void;label:string}) {
  return <button role="switch" aria-label={label} aria-checked={checked} onClick={()=>onChange(!checked)} className={classNames("dt-account-toggle",checked&&"dt-account-toggle--on")} type="button"><span/></button>;
}
function EditProfile({initial,onCancel,onSave}:{initial:{name:string;email:string;phone:string};onCancel:()=>void;onSave:(value:{name:string;email:string;phone:string})=>void}) {
  const [name,setName]=useState(initial.name),[email,setEmail]=useState(initial.email),[phone,setPhone]=useState(initial.phone);
  return <form className="dt-profile-edit" onSubmit={e=>{e.preventDefault();onSave({name:name.trim(),email:email.trim(),phone:phone.trim()});}}>
    <label>Full name<input aria-label="Edit full name" value={name} maxLength={80} required onChange={e=>setName(e.target.value)}/></label>
    <label>Email address<input type="email" aria-label="Edit email address" value={email} required onChange={e=>setEmail(e.target.value)}/></label>
    <label>Phone number<input type="tel" aria-label="Edit phone number" value={phone} required pattern="[+0-9 ()-]{8,22}" onChange={e=>setPhone(e.target.value)}/></label>
    <div className="dt-profile-form-actions"><Button size="sm" type="submit">Save preview</Button><Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button></div>
    <small>These changes affect this preview only and are cleared on reload.</small>
  </form>;
}
function Profile({onNavigate,onNotice}:{onNavigate:(target:NavigateTarget)=>void;onNotice:(message:string)=>void}) {
  const [person,setPerson]=useState({name:demoCustomer.name,email:demoCustomer.email,phone:demoCustomer.phone});
  const [editing,setEditing]=useState(false);
  const [addresses,setAddresses]=useState<PreviewAddress[]>(demoAddresses);
  const [addressMode,setAddressMode]=useState<"add"|"edit"|null>(null);
  const [editAddressId,setEditAddressId]=useState<string|null>(null);
  const [addressTitle,setAddressTitle]=useState(""),[addressDetail,setAddressDetail]=useState("");
  const [primaryAddress,setPrimaryAddress]=useState(false);
  const [marketing,setMarketing]=useState(true);
  const [section,setSection]=useState("personal");
  const areaRef=useRef<Record<string,HTMLDivElement|null>>({});
  const sections=[["personal","Personal information",UserRound],["addresses","Saved addresses",MapPin],["payments","Payment methods",CreditCard],["preferences","Preferences",Settings]] as const;
  const jump=(id:string)=>{setSection(id);areaRef.current[id]?.scrollIntoView({block:"nearest",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant" as ScrollBehavior:"smooth"});};
  const beginAddress=(mode:"add"|"edit",a?:PreviewAddress)=>{
    setAddressMode(mode);setEditAddressId(a?.id||null);setAddressTitle(a?.label||"");
    setAddressDetail(a?.description||"");setPrimaryAddress(Boolean(a?.primary));
    jump("addresses");
  };
  const saveAddress=(e:React.FormEvent)=>{e.preventDefault();if(!addressTitle.trim()||!addressDetail.trim())return;
    const id=editAddressId||"preview-"+Date.now().toString(36);
    const next:PreviewAddress={id,label:addressTitle.trim(),description:addressDetail.trim(),district:"Juja, Kiambu County · demo",primary:primaryAddress||addresses.length===0};
    setAddresses(cur=>{
      const updated=editAddressId?cur.map(a=>a.id===id?next:a):[...cur,next];
      return next.primary?updated.map(a=>({...a,primary:a.id===id})):updated;
    });
    setAddressMode(null);setEditAddressId(null);onNotice("Sample address saved locally in this preview only.");
  };
  const placeholder=(what:string)=>onNotice(what+" is a design preview; it does not change your real DeeToo account.");
  return <section className="dt-profile-page dt-screen-enter">
    <div className="dt-profile-main">
      <Header title="My profile" description="Manage your account, addresses, payments and preferences.">
        <Button variant="outline" size="sm" startIcon={<Pencil size={17}/>} onClick={()=>{setEditing(true);jump("personal");}}>Edit profile</Button>
      </Header>
      <DemoTag/>
      <Panel className="dt-profile-summary"><div className="dt-profile-avatar">{person.name.trim()[0]?.toUpperCase()||"T"}</div><div className="dt-profile-identity"><h2>{person.name}</h2><p>{person.email} <Badge variant="mint"><CheckCircle2 size={14}/> Sample account</Badge></p><span>{person.phone}</span></div><div className="dt-profile-stats"><div><ShoppingBag size={26}/><strong>24</strong><small>Sample orders</small></div><div><Heart size={27}/><strong>12</strong><small>Favourites</small></div><div><Star size={27}/><strong>4.8</strong><small>Sample rating</small></div></div></Panel>
      <nav className="dt-profile-tabs" aria-label="Profile sections">{sections.map(([id,label,Icon])=><button key={id} type="button" aria-current={section===id?"true":undefined} className={section===id?"is-active":""} onClick={()=>jump(id)}><Icon size={21}/>{label}</button>)}</nav>
      <div className="dt-profile-card-grid">
        <div ref={node=>{areaRef.current.personal=node}} className="dt-account-card-target"><Panel className="dt-profile-card">
          <SectionTitle icon={UserRound} title="Personal information" action={<Button variant="soft" size="sm" startIcon={<Pencil size={15}/>} onClick={()=>setEditing(x=>!x)}>{editing?"Close":"Edit"}</Button>}/>
          {editing?<EditProfile initial={person} onCancel={()=>setEditing(false)} onSave={value=>{setPerson(value);setEditing(false);onNotice("Profile changes were saved locally for this preview only.");}}/>:
            <dl className="dt-personal-data"><div><dt>Full name</dt><dd>{person.name}</dd></div><div><dt>Email address</dt><dd>{person.email}</dd></div><div><dt>Phone number</dt><dd>{person.phone}</dd></div><div><dt>Date joined</dt><dd>{demoCustomer.joined}</dd></div><div><dt>Account type</dt><dd>{demoCustomer.type}</dd></div></dl>}
        </Panel></div>
        <div ref={node=>{areaRef.current.addresses=node}} className="dt-account-card-target"><Panel className="dt-profile-card">
          <SectionTitle icon={MapPin} title="Saved addresses" action={<Button size="sm" startIcon={<Plus size={17}/>} onClick={()=>beginAddress("add")}>Add address</Button>}/>
          <div className="dt-address-list">{addresses.map(a=><article key={a.id} className="dt-address-entry"><span className="dt-address-symbol">{a.label.toLowerCase()==="home"?<House size={24}/>:<MapPin size={22}/>}</span><div><strong>{a.label}</strong> {a.primary&&<Badge variant="mint">Default</Badge>}<p>{a.description}<br/>{a.district}</p></div><div className="dt-address-actions"><IconButton label={"Edit "+a.label+" address"} onClick={()=>beginAddress("edit",a)}><Pencil size={15}/></IconButton><IconButton label={"Set "+a.label+" as default"} onClick={()=>{setAddresses(prev=>prev.map(x=>({...x,primary:x.id===a.id})));onNotice("Default sample address updated locally.");}}><Check size={16}/></IconButton><IconButton label={"Remove "+a.label+" address"} onClick={()=>{setAddresses(prev=>prev.filter(x=>x.id!==a.id).map((item,i,arr)=>({...item,primary:item.primary||(!arr.some(s=>s.primary)&&i===0)})));onNotice("Sample address removed locally.");}}><Trash2 size={15}/></IconButton></div></article>)}</div>
          {addressMode&&<form className="dt-address-edit" onSubmit={saveAddress}><h3>{addressMode==="add"?"Add a sample address":"Edit sample address"}</h3><label>Address label<input required maxLength={45} placeholder="e.g. Home" value={addressTitle} onChange={e=>setAddressTitle(e.target.value)}/></label><label>Address details<input required maxLength={160} placeholder="Street, landmark or building" value={addressDetail} onChange={e=>setAddressDetail(e.target.value)}/></label><label className="dt-checkbox-field"><input type="checkbox" checked={primaryAddress} onChange={e=>setPrimaryAddress(e.target.checked)}/> Set as default</label><div><Button type="submit" size="sm">Save sample address</Button><Button variant="outline" size="sm" onClick={()=>setAddressMode(null)}>Cancel</Button></div><small>No geocoding or delivery-serviceability validation is performed.</small></form>}
          <button className="dt-profile-inline-link" onClick={()=>beginAddress("add")}>Add another address <ArrowRight size={16}/></button>
        </Panel></div>
        <div ref={node=>{areaRef.current.payments=node}} className="dt-account-card-target"><Panel className="dt-profile-card">
          <SectionTitle icon={CreditCard} title="Payment methods" action={<Button size="sm" variant="soft" onClick={()=>placeholder("Adding a payment method")} startIcon={<Plus size={17}/>}>Add payment method</Button>}/>
          <div className="dt-payment-list">{demoPayments.map(p=><div className="dt-payment-item" key={p.id}><span className={classNames("dt-payment-mark",p.symbol==="mpesa"&&"dt-payment-mpesa")}>{p.symbol==="mpesa"?"M-PESA":"●●"}</span><div><strong>{p.label}</strong><p>{p.description}</p></div>{p.primary&&<Badge variant="mint">Default</Badge>}<IconButton label={"More "+p.label+" options"} onClick={()=>placeholder("Payment management")}><MoreVertical size={19}/></IconButton></div>)}</div>
        </Panel></div>
        <div ref={node=>{areaRef.current.preferences=node}} className="dt-account-card-target"><Panel className="dt-profile-card">
          <SectionTitle icon={Settings} title="Preferences" action={<Button variant="soft" size="sm" onClick={()=>placeholder("Preference editing")} startIcon={<Pencil size={15}/>}>Edit</Button>}/>
          <InfoRow icon={Bike} title="Delivery instructions" detail="Gate code, landmarks, special notes" onClick={()=>placeholder("Delivery instructions")}/>
          <InfoRow icon={Globe2} title="Dietary preferences" detail="Halal, vegetarian, allergies, etc." onClick={()=>placeholder("Dietary preferences")}/>
          <InfoRow icon={Globe2} title="Language" detail="English" onClick={()=>placeholder("Language selection")}/>
          <InfoRow icon={Bell} title="Marketing communications" detail="Special offers and promotions (sample)" tail={<Toggle checked={marketing} onChange={setMarketing} label="Preview marketing communications"/>}/>
        </Panel></div>
      </div>
    </div>
    <aside className="dt-profile-rail">
      <Panel className="dt-plus-card"><header><span className="dt-plus-crown"><Crown size={25} fill="currentColor"/></span><div><h2>DeeToo Plus</h2><p>Unlock more value with DeeToo Plus!</p></div></header><div className="dt-plus-promo" aria-hidden="true">♛</div>
        {["Free delivery on selected restaurants","Exclusive discounts and offers","Priority customer support"].map(t=><p key={t}><CheckCircle2 size={19}/>{t}</p>)}
        <Button onClick={()=>placeholder("DeeToo Plus enrollment")}>Explore Plus benefits <ArrowRight size={18}/></Button><small>Membership is not yet available in this demo.</small>
      </Panel>
      <Panel className="dt-quick-actions"><SectionTitle icon={Zap} title="Quick actions"/>
        <InfoRow icon={Bell} title="Manage notifications" detail="Choose what you want to be notified about" onClick={()=>onNavigate("notifications")}/>
        <InfoRow icon={Heart} title="Favourite restaurants" detail="Explore and save your favourites" onClick={()=>onNavigate("discover")}/>
        <InfoRow icon={Tag} title="Promo codes" detail="View demo offers and promotions" onClick={()=>onNavigate("search")}/>
        <InfoRow icon={UsersRound} title="Refer a friend" detail="Referral rewards preview" onClick={()=>placeholder("Referral rewards")}/>
        <InfoRow icon={LifeBuoy} title="Help & support" detail="Get help with orders and payments" onClick={()=>onNavigate("support")}/>
      </Panel>
      <Panel className="dt-account-logout"><InfoRow icon={LogOut} title="Log out" detail="Account sign-out is not connected in preview" danger onClick={()=>placeholder("Sign out")}/></Panel>
    </aside>
  </section>;
}
function Security({onNotice}:{onNotice:(m:string)=>void}) {
  const [selectedDevice,setSelectedDevice]=useState<string|null>(null),[showAll,setShowAll]=useState(false);
  const explain=(label:string)=>onNotice(label+" requires authenticated server support; no live security settings were changed.");
  return <section className="dt-security-page dt-screen-enter">
    <header className="dt-security-banner"><div><h1>Security & Devices</h1><p>Keep your account safe and manage where you're signed in.</p><DemoTag/></div><div className="dt-security-banner-aside"><span><ShieldCheck size={43}/></span><div><h2>Your security matters</h2><p>Explore account protection controls in this preview.</p></div></div></header>
    <div className="dt-security-grid">
      <div className="dt-security-column">
        <Panel className="dt-security-card"><SectionTitle icon={LockKeyhole} title="Account security" description="Manage your password and secure your account."/>
          <InfoRow icon={LockKeyhole} title="Password" detail="Last updated Oct 1, 2026 (sample)" onClick={()=>explain("Change password")} tail={<span className="dt-security-inline-pill">Change password</span>}/>
          <InfoRow icon={Shield} title="Two-factor authentication (2FA)" detail="Add an extra layer of security to your account." tail={<Badge variant="neutral">Demo: not enabled</Badge>} onClick={()=>explain("Two-factor authentication")}/>
          <InfoRow icon={LockKeyhole} title="PIN for sensitive actions" detail="Use a PIN to confirm payments and changes." tail={<Badge variant="mint">Demo: enabled</Badge>} onClick={()=>explain("Sensitive-action PIN")}/>
        </Panel>
        <Panel className="dt-security-card"><SectionTitle icon={Clock3} title="Login activity" description="Recent sample account activity." action={<button className="dt-account-text-button" onClick={()=>setShowAll(x=>!x)}>{showAll?"Show less":"View all"} <ArrowRight size={15}/></button>}/>
          <div className="dt-login-list">{demoLogins.slice(0,showAll?undefined:4).map(event=><div className="dt-login-event" key={event.id}><span className={classNames("dt-login-state",!event.success&&"dt-login-failed")}><ArrowRight size={22}/></span><span><strong>{event.label}</strong><small>{event.device}</small></span><span><strong>{event.location}</strong><small>{event.time}</small></span></div>)}</div>
        </Panel>
      </div>
      <div className="dt-security-column">
        <Panel className="dt-security-card"><SectionTitle icon={Laptop} title="Your devices" description="Manage devices where you're signed in." action={<IconButton label="Refresh sample devices" onClick={()=>explain("Device refresh")}><RefreshCw size={19}/></IconButton>}/>
          <div className="dt-device-list">{demoDevices.map(device=><div className="dt-device-entry" key={device.id}><span className="dt-account-device-icon">{device.icon==="desktop"?<Laptop size={27}/>:<Smartphone size={27}/>}</span><div><strong>{device.label}</strong>{device.current&&<Badge variant="mint">Current device (sample)</Badge>}<p>{device.location} · {device.time}</p></div><IconButton label={"Options for "+device.label} onClick={()=>setSelectedDevice(x=>x===device.id?null:device.id)}><MoreVertical size={19}/></IconButton>{selectedDevice===device.id&&<div className="dt-device-popover"><p>{device.current?"The sample current session cannot be revoked.":"This device is illustrative, not an actual login."}</p><Button size="sm" variant="outline" onClick={()=>{explain("Session revocation");setSelectedDevice(null);}}>{device.current?"Session information":"Preview revoke action"}</Button></div>}</div>)}</div>
          <button className="dt-devices-revoke" onClick={()=>explain("Sign out from other devices")}><LogOut size={19}/> Sign out from all other devices <small>(preview)</small></button>
        </Panel>
        <Panel className="dt-security-card"><SectionTitle icon={Eye} title="Privacy & data" description="Control your privacy and data preferences."/>
          <InfoRow icon={UserRound} title="Manage data sharing" detail="Control how your data is used." onClick={()=>explain("Data sharing settings")}/>
          <InfoRow icon={MapPin} title="Location permissions" detail="Manage location access for deliveries." onClick={()=>explain("Location permissions")}/>
          <InfoRow icon={Trash2} title="Delete account" detail="Permanent deletion requires verified identity and server confirmation." danger onClick={()=>explain("Delete account")}/>
        </Panel>
      </div>
    </div>
  </section>;
}
const categoryOptions:Array<{key:"all"|NoticeCategory;label:string;icon:typeof House}>=[
  {key:"all",label:"All",icon:Bell},{key:"orders",label:"Orders",icon:Package},
  {key:"offers",label:"Offers",icon:Tag},{key:"account",label:"Account",icon:UserRound},
  {key:"security",label:"Security",icon:Shield},{key:"system",label:"System",icon:Settings}
];
const iconForCategory:Record<NoticeCategory,typeof House>={orders:Package,offers:Tag,account:UserRound,security:Shield,system:Settings};
function NotificationRow({item,onRead,onOpen}:{item:DemoNotification;onRead:()=>void;onOpen:()=>void}) {
  const Icon=iconForCategory[item.category];
  return <article className={classNames("dt-notification-item",!item.read&&"is-unread")}>
    <span className={classNames("dt-notification-icon","dt-notification-icon--"+item.category)}><Icon size={25}/></span>
    <button type="button" className="dt-notification-main" onClick={()=>{onRead();onOpen();}}><strong>{item.title}</strong><small>{item.description}</small></button>
    <span className="dt-notification-time">{item.when}{!item.read&&<span className="dt-notification-dot"/>}</span>
    <button type="button" className="dt-notification-row-action" onClick={()=>{onRead();onOpen();}} aria-label={"Open "+item.title}><ChevronRight size={18}/></button>
  </article>;
}
function PreferenceRow({icon:Icon,title,description,value,onChange}:{icon:typeof House;title:string;description:string;value:boolean;onChange:(value:boolean)=>void}) {
  return <div className="dt-notify-preference-row"><span className="dt-preference-symbol"><Icon size={21}/></span><span><strong>{title}</strong><small>{description}</small></span><Toggle label={"Preview "+title} checked={value} onChange={onChange}/></div>;
}
function Notifications({onNavigate,onNotice}:{onNavigate:(t:NavigateTarget)=>void;onNotice:(m:string)=>void}) {
  const [items,setItems]=useState<DemoNotification[]>(demoNotifications),[category,setCategory]=useState<"all"|NoticeCategory>("all");
  const [prefs,setPrefs]=useState<Record<string,boolean>>({orders:true,offers:true,account:true,security:true,system:false,push:true,sms:true,email:false});
  const setPref=(id:string)=>(value:boolean)=>{setPrefs(s=>({...s,[id]:value}));onNotice("Notification preference changed in this preview only. No subscription was created.");};
  const openNotice=(item:DemoNotification)=>{if(item.target)onNavigate(item.target);else onNotice("This is a sample notification with no live destination.");};
  const readOne=(id:string)=>setItems(prev=>prev.map(item=>item.id===id?{...item,read:true}:item));
  const readAll=()=>setItems(prev=>prev.map(item=>({...item,read:true})));
  const filtered=useMemo(()=>category==="all"?items:items.filter(item=>item.category===category),[items,category]);
  const catCount=(key:"all"|NoticeCategory)=>key==="all"?items.length:items.filter(item=>item.category===key).length;
  return <section className="dt-notifications-page dt-screen-enter">
    <header className="dt-notify-banner"><div><h1>Notifications Center</h1><p>Stay updated with your orders, offers and important updates.</p><DemoTag/></div><div className="dt-notify-banner-art" aria-hidden="true"><Bell size={71} fill="#00aa62" strokeWidth={1.5}/><span>✦</span><span>✦</span></div><Panel className="dt-notification-push-cta"><span className="dt-push-icon"><Bell size={23}/></span><div><h2>Never miss an update</h2><p>Configure notification delivery when backend support is available.</p></div><Button size="sm" onClick={()=>{setPrefs(s=>({...s,push:true}));onNotice("Push preview enabled locally. No browser permission or live subscription was requested.");}}>Preview notifications <ArrowRight size={15}/></Button></Panel></header>
    <div className="dt-notify-toolbar"><div role="tablist" aria-label="Notification categories">{categoryOptions.map(({key,label,icon:Icon})=><button role="tab" aria-selected={category===key} className={category===key?"active":""} key={key} onClick={()=>setCategory(key)}><Icon size={20}/>{label}<span>{catCount(key)}</span></button>)}</div><Button size="sm" variant="outline" onClick={()=>{readAll();onNotice("All sample notifications marked read locally.");}} startIcon={<Check size={17}/>}>Mark all as read</Button></div>
    <div className="dt-notification-columns">
      <div className="dt-notification-feed" aria-live="polite">{(["Today","Yesterday"] as const).map(day=>{
        const group=filtered.filter(item=>item.day===day);
        return group.length?<div key={day} className="dt-notification-day"><h2>{day}</h2><Panel className="dt-notification-list">{group.map(item=><NotificationRow key={item.id} item={item} onRead={()=>readOne(item.id)} onOpen={()=>openNotice(item)}/>)}</Panel></div>:null;
      })}{!filtered.length&&<Panel className="dt-notifications-empty"><Bell size={29}/><h2>No notifications here</h2><p>Try a different category to see more sample updates.</p></Panel>}</div>
      <aside className="dt-notification-rail">
        <Panel className="dt-notify-settings"><SectionTitle icon={Settings} title="Notification preferences" description="Choose which sample updates you want."/>
          <PreferenceRow icon={Package} title="Order updates" description="Real-time order status and delivery updates" value={prefs.orders} onChange={setPref("orders")}/>
          <PreferenceRow icon={Tag} title="Promotions & offers" description="Discounts, deals and special offers" value={prefs.offers} onChange={setPref("offers")}/>
          <PreferenceRow icon={UserRound} title="Account activity" description="Login alerts and account changes" value={prefs.account} onChange={setPref("account")}/>
          <PreferenceRow icon={Shield} title="Security alerts" description="Important security and device notifications" value={prefs.security} onChange={setPref("security")}/>
          <PreferenceRow icon={Settings} title="System updates" description="App updates and maintenance" value={prefs.system} onChange={setPref("system")}/>
        </Panel>
        <Panel className="dt-notify-settings"><SectionTitle icon={Bell} title="Notification channels" description="Choose how you want to be notified."/>
          <PreferenceRow icon={Smartphone} title="Push notifications" description="Updates on your device" value={prefs.push} onChange={setPref("push")}/>
          <PreferenceRow icon={MessageSquare} title="SMS notifications" description="Important updates via SMS" value={prefs.sms} onChange={setPref("sms")}/>
          <PreferenceRow icon={CreditCard} title="Email notifications" description="Summaries and offers via email" value={prefs.email} onChange={setPref("email")}/>
        </Panel>
        <p className="dt-notifications-disclaimer"><ShieldCheck size={16}/> This UI only simulates preference switches. It does not register push tokens, send messages or persist preferences.</p>
      </aside>
    </div>
  </section>;
}
export function AccountPreview({screen,onNavigate,onNotice}:Props) {
  if(screen==="profile")return <Profile onNavigate={onNavigate} onNotice={onNotice}/>;
  if(screen==="security")return <Security onNotice={onNotice}/>;
  return <Notifications onNavigate={onNavigate} onNotice={onNotice}/>;
}
