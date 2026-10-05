import React from "react";
import {
  ArrowRight, Bike, Building2, CheckCircle2, ChefHat, Clock3, Headphones,
  Heart, MapPin, ShieldCheck, ShoppingBag, Sparkles, Store, UtensilsCrossed,
  WalletCards, Zap
} from "lucide-react";
import { DeetooLogo } from "../../../packages/ui/src/index";

function portalUrl(envKey:"VITE_MERCHANT_PORTAL_URL"|"VITE_ADMIN_PORTAL_URL"|"VITE_RIDER_PORTAL_URL",localPort?:number,fallback="/"){
  const configured=(import.meta as any).env?.[envKey];
  if(configured)return configured;
  if(localPort&&["localhost","127.0.0.1"].includes(window.location.hostname)){
    return `${window.location.protocol}//${window.location.hostname}:${localPort}`;
  }
  return fallback;
}
const merchantUrl=portalUrl("VITE_MERCHANT_PORTAL_URL",5174,"/merchant");
const adminUrl=portalUrl("VITE_ADMIN_PORTAL_URL",5175,"/ops");
const riderUrl=portalUrl("VITE_RIDER_PORTAL_URL",undefined,"/riders");

const nav=[
  ["Food","/restaurants"],
  ["How it works","/how-it-works"],
  ["For restaurants","/partner"],
  ["For riders","/riders"],
  ["Business","/business"],
];

function LinkButton({href,children,className=""}:{href:string;children:React.ReactNode;className?:string}){
  return <a href={href} className={className}>{children}</a>;
}

export function PublicSite({path}:{path:string}){
  if(path==="/about") return <InfoPage title="Delivery that feels local." eyebrow="About DeeToo" body="DeeToo connects customers, restaurants and riders through one delivery network built for fast-moving African cities. Our product is designed around reliable ordering, clear merchant operations, rider safety and accountable platform operations."/>;
  if(path==="/how-it-works") return <HowItWorks/>;
  if(path==="/partner") return <PartnerPage/>;
  if(path==="/riders") return <RiderPage/>;
  if(path==="/business") return <BusinessPage/>;
  if(path==="/help") return <InfoPage title="How can we help?" eyebrow="Help centre" body="Find help for orders, payments, restaurant accounts, rider operations and account access. Signed-in users can open Support inside their DeeToo workspace for account-specific assistance."/>;
  if(path==="/contact") return <InfoPage title="Talk to DeeToo." eyebrow="Contact" body="For order help use your DeeToo account support area. Restaurants can use the Merchant support workspace, while riders should use the support tools in the Rider app. Business and partnership enquiries can be directed through your DeeToo commercial contact."/>;
  if(path==="/privacy") return <InfoPage title="Privacy at DeeToo." eyebrow="Privacy" body="DeeToo uses the information required to operate accounts, fulfil orders, process payments, support riders and merchants, prevent abuse and meet applicable legal obligations. Detailed production policy text should remain governed by the approved legal document."/>;
  if(path==="/terms") return <InfoPage title="Using DeeToo." eyebrow="Terms" body="Orders, merchant services and rider services remain subject to the applicable DeeToo terms, payment conditions, refund rules and marketplace policies. This interface does not replace the approved legal terms."/>;
  if(path==="/restaurants") return <RestaurantEntry/>;
  return <Landing/>;
}

function Shell({children}:{children:React.ReactNode}){
  return <div className="public-site">
    <header className="public-nav">
      <a href="/" aria-label="DeeToo home"><DeetooLogo className="h-10 w-auto"/></a>
      <nav className="public-nav-links" aria-label="Public navigation">
        {nav.map(([label,href])=><a key={href} href={href}>{label}</a>)}
      </nav>
      <div className="public-nav-actions">
        <a href="/customer" className="public-signin">Sign in</a>
        <a href="/customer" className="public-cta">Order food <ArrowRight size={15}/></a>
      </div>
    </header>
    {children}
    <footer className="public-footer">
      <div><DeetooLogo className="h-9 w-auto"/><p>Food, people and places — moving better together.</p></div>
      <div><strong>Discover</strong><a href="/restaurants">Restaurants</a><a href="/how-it-works">How it works</a><a href="/help">Help centre</a></div>
      <div><strong>Earn with DeeToo</strong><a href="/partner">Restaurant partners</a><a href="/riders">Riders</a><a href="/business">Business</a></div>
      <div><strong>Company</strong><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
    </footer>
  </div>;
}

function Landing(){
  return <Shell>
    <main>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-kicker"><Sparkles size={14}/> Made for hungry cities</span>
          <h1>Good food.<br/><em>Right when you want it.</em></h1>
          <p>Discover nearby favourites, hidden gems and everyday meals. Order in a few taps, follow every step and get it delivered by DeeToo.</p>
          <div className="landing-actions">
            <a href="/customer" className="landing-primary">Find food near you <ArrowRight size={17}/></a>
            <a href="/partner" className="landing-secondary">Grow your restaurant</a>
          </div>
          <div className="landing-trust"><span><CheckCircle2 size={15}/> Live order tracking</span><span><ShieldCheck size={15}/> Secure payments</span><span><Clock3 size={15}/> Clear ETAs</span></div>
        </div>
        <div className="food-orbit" aria-label="DeeToo food delivery preview">
          <div className="food-orbit-ring"/>
          <div className="food-card food-card-main"><span>🍲</span><div><small>Popular near you</small><strong>Comfort bowls</strong><p>25–35 min · KES delivery</p></div></div>
          <div className="food-card food-card-a"><span>🍔</span><strong>Burgers</strong></div>
          <div className="food-card food-card-b"><span>🥗</span><strong>Fresh</strong></div>
          <div className="food-card food-card-c"><span>🍗</span><strong>Grill</strong></div>
          <div className="delivery-pill"><Bike size={18}/><div><strong>Rider on the way</strong><small>Track live from pickup</small></div></div>
        </div>
      </section>

      <section className="landing-strip">
        <span>🍕 Pizza</span><span>🍛 Local favourites</span><span>🍗 Chicken</span><span>🥙 Healthy</span><span>🍰 Desserts</span><span>☕ Coffee</span>
      </section>

      <section className="landing-section">
        <div className="landing-section-heading"><span>One platform, four experiences</span><h2>Designed around what each person needs next.</h2></div>
        <div className="role-grid">
          <RoleCard icon={ShoppingBag} title="Customer" text="Discover, order, pay, track and get support without losing your place." href="/customer" action="Start ordering"/>
          <RoleCard icon={ChefHat} title="Merchant" text="Run orders, menu availability, branches, finance, settlements and your restaurant team." href={merchantUrl} action="Merchant portal"/>
          <RoleCard icon={Bike} title="Rider" text="Go online, accept delivery offers, navigate stops, prove delivery and understand earnings." href={riderUrl} action="Ride with DeeToo"/>
          <RoleCard icon={Building2} title="Operations" text="Control live dispatch, merchants, riders, payments, risk, support and platform health." href={adminUrl} action="Operations portal"/>
        </div>
      </section>

      <section className="landing-section split-feature">
        <div className="feature-panel dark"><span className="landing-kicker green"><Zap size={14}/> For customers</span><h2>Your order, never a mystery.</h2><p>From restaurant confirmation to rider arrival, DeeToo keeps the important moments visible.</p><div className="mini-timeline"><i/><div><strong>Order confirmed</strong><small>The kitchen has your order</small></div><i/><div><strong>Preparing</strong><small>Your meal is being made</small></div><i/><div><strong>On the way</strong><small>Follow your rider live</small></div></div></div>
        <div className="feature-panel lime"><span className="landing-kicker">For restaurants</span><h2>Busy kitchen. Calm screen.</h2><p>See what is new, what is cooking and what must leave next — with menu and settlement tools in the same workspace.</p><a href="/partner">Explore DeeToo for restaurants <ArrowRight size={16}/></a></div>
      </section>

      <section className="landing-section values-section">
        <div><span>Built for delivery reality</span><h2>Fast where it should be. Detailed where it matters.</h2></div>
        <div className="value-grid">
          <div><MapPin/><strong>Location-aware discovery</strong><p>Customers start with where the food needs to go.</p></div>
          <div><WalletCards/><strong>Payment clarity</strong><p>Price, payment state and adjustments stay understandable.</p></div>
          <div><Headphones/><strong>Support in context</strong><p>Help sits inside each role experience, close to the work.</p></div>
          <div><Heart/><strong>Human-centred operations</strong><p>Every dashboard prioritises the next useful action.</p></div>
        </div>
      </section>

      <section className="landing-final"><div><span>Ready when you are.</span><h2>What are you hungry for?</h2></div><a href="/customer">Explore food <ArrowRight size={18}/></a></section>
    </main>
  </Shell>;
}

function RoleCard({icon:Icon,title,text,href,action}:{icon:any;title:string;text:string;href:string;action:string}){
 return <article className="role-card"><div className="role-icon"><Icon/></div><h3>{title}</h3><p>{text}</p><a href={href}>{action}<ArrowRight size={15}/></a></article>;
}

function RestaurantEntry(){
  return <Shell><main className="info-page"><div><span className="landing-kicker"><UtensilsCrossed size={14}/> Restaurant discovery</span><h1>Find your next favourite.</h1><p>Restaurant discovery is powered by your delivery location so DeeToo only shows relevant serviceable options.</p><a href="/customer" className="landing-primary">Choose location & browse <ArrowRight size={17}/></a></div><div className="info-visual">🍜<span>Nearby kitchens</span></div></main></Shell>;
}

function HowItWorks(){
 return <Shell><main className="content-page"><div className="landing-section-heading"><span>How DeeToo works</span><h1>From craving to doorstep.</h1></div><div className="steps-grid">{[
 ["01","Choose where","Set your delivery location so we can show serviceable restaurants."],
 ["02","Build your order","Browse menus, choose options and see the order price before checkout."],
 ["03","Follow the kitchen","See confirmation and preparation progress as the restaurant works."],
 ["04","Track delivery","Know when a rider is assigned, picked up and heading to you."]
 ].map(([n,t,d])=><div key={n}><b>{n}</b><h3>{t}</h3><p>{d}</p></div>)}</div></main></Shell>;
}

function PartnerPage(){
 return <Shell><main className="info-page"><div><span className="landing-kicker"><Store size={14}/> Restaurants on DeeToo</span><h1>Your kitchen.<br/>A bigger neighbourhood.</h1><p>Manage incoming orders, menu availability, branches, finance and settlements from a restaurant workspace built for busy service.</p><LinkButton href={merchantUrl} className="landing-primary">Open merchant portal <ArrowRight size={17}/></LinkButton></div><div className="info-visual merchant-visual"><ChefHat/><span>Kitchen display · Menu · Finance</span></div></main></Shell>;
}

function RiderPage(){
 return <Shell><main className="info-page"><div><span className="landing-kicker"><Bike size={14}/> Ride with DeeToo</span><h1>Deliver with a clearer next move.</h1><p>The Rider experience focuses on availability, offers, navigation, handover proof, incidents and earnings — without burying the active delivery.</p><LinkButton href={riderUrl} className="landing-primary">Rider access <ArrowRight size={17}/></LinkButton></div><div className="info-visual rider-visual"><Bike/><span>Offers · Navigation · Earnings</span></div></main></Shell>;
}

function BusinessPage(){
 return <Shell><main className="info-page"><div><span className="landing-kicker"><Building2 size={14}/> DeeToo for teams</span><h1>Meals for teams, without the coordination headache.</h1><p>DeeToo’s platform foundation supports accountable orders, payments and support across the same delivery network. Business-specific commercial programmes should use approved DeeToo terms before launch.</p><a href="/contact" className="landing-primary">Talk to DeeToo <ArrowRight size={17}/></a></div><div className="info-visual">🏢<span>Teams · Orders · Accountability</span></div></main></Shell>;
}

function InfoPage({eyebrow,title,body}:{eyebrow:string;title:string;body:string}){
 return <Shell><main className="content-page narrow"><span className="landing-kicker">{eyebrow}</span><h1>{title}</h1><p className="lead">{body}</p><a href="/" className="text-link">Back to DeeToo <ArrowRight size={15}/></a></main></Shell>;
}
