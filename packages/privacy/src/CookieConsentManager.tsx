import {useEffect, useRef, useState} from 'react';
import {
  COOKIE_PREFS_OPEN, COOKIE_PREFS_CHANGED, DEFAULT_COOKIE_PREFERENCES,
  effectivePreferences, globalPrivacySignal, openCookiePreferences,
  readCookieReceipt, saveCookiePreferences, syncAuthenticatedConsent,
  type CookiePreferences, type CookiePurpose, type ConsentReceipt,
} from './consent';
import './cookie-consent.css';

type Props = { policyUrl?: string; placement?: 'bottom-left' | 'top-right' };
const rows: {id:CookiePurpose; title:string; text:string}[] = [
  {id:'functional', title:'Functional preferences',
    text:'Remember optional display and convenience choices. Essential order, security and account operations still work without this.'},
  {id:'analytics', title:'Analytics',
    text:'Help DeeToo understand broad website usage and improve screens. Off unless you choose to allow it.'},
  {id:'marketing', title:'Marketing',
    text:'Allow optional personalized promotions and advertising-related tracking. This does not change transactional order messages.'},
];

export function CookieConsentManager({policyUrl,placement='bottom-left'}:Props) {
  const [saved,setSaved] = useState<ConsentReceipt|null>(readCookieReceipt);
  const [details,setDetails] = useState(false);
  const [value,setValue] = useState<CookiePreferences>(()=>saved?.preferences || {...DEFAULT_COOKIE_PREFERENCES});
  const [notice,setNotice] = useState('');
  const dialogRef = useRef<HTMLDivElement|null>(null);
  const returnFocus = useRef<HTMLElement|null>(null);
  const gpc = globalPrivacySignal();

  useEffect(()=>{
    const open=()=> {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setValue(saved?.preferences || {...DEFAULT_COOKIE_PREFERENCES});
      setDetails(true);
    };
    const update=(event:Event)=>{
      const receipt=(event as CustomEvent<ConsentReceipt>).detail;
      if(receipt) setSaved(receipt);
    };
    window.addEventListener(COOKIE_PREFS_OPEN,open);
    window.addEventListener(COOKIE_PREFS_CHANGED,update);
    return ()=>{
      window.removeEventListener(COOKIE_PREFS_OPEN,open);
      window.removeEventListener(COOKIE_PREFS_CHANGED,update);
    };
  },[saved]);

  useEffect(()=>{
    if(!details) return;
    const prev=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled),button')?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key!=='Tab'||!dialogRef.current) return;
      const focusable=Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]'));
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.removeEventListener('keydown',keydown);(returnFocus.current || prev)?.focus();};
  },[details]);

  function close(){setDetails(false);}
  function save(preferences:CookiePreferences,source:'banner'|'customize'|'settings'){
    const receipt=saveCookiePreferences(preferences,source);
    setSaved(receipt);
    setNotice('Your cookie preferences were saved on this device.');
    setDetails(false);
    void syncAuthenticatedConsent(receipt);
  }
  const defaultChoice: CookiePreferences = {...DEFAULT_COOKIE_PREFERENCES};
  const allChoice: CookiePreferences = {functional:true,analytics:true,marketing:true};
  return <div className="dp-privacy-root">
    {!saved && !details && <section className={"dp-cookie-banner"+(placement==="top-right"?" dp-cookie-banner-side":"")} role="region" aria-label="Cookie consent">
      <div className="dp-cookie-banner-title"><span aria-hidden="true">◈</span><h2>Your privacy, your choice</h2></div>
      <p>DeeToo uses essential cookies to keep accounts and orders secure. Optional preferences, analytics and marketing tracking are off until you choose.</p>
      {gpc && <p className="dp-cookie-gpc">Your browser’s Global Privacy Control blocks analytics and marketing tracking.</p>}
      <div className="dp-cookie-actions">
        <button type="button" className="dp-cookie-secondary" onClick={()=>save(defaultChoice,'banner')}>Reject optional</button>
        <button type="button" className="dp-cookie-secondary" onClick={()=>{setValue(defaultChoice);returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDetails(true);}}>Customize</button>
        <button type="button" className="dp-cookie-primary" onClick={()=>save(allChoice,'banner')}>Accept all</button>
      </div>
    </section>}
    {saved && !details && <button type="button" className="dp-cookie-reopen"
      onClick={openCookiePreferences} aria-label="Open cookie preferences">
      <span aria-hidden="true">◈</span> Privacy choices
    </button>}
    {details && <div className="dp-cookie-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
      <div className="dp-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="dp-cookie-heading" ref={dialogRef}>
        <div className="dp-cookie-dialog-head">
          <div><p className="dp-cookie-eyebrow">DeeToo Rush · Privacy controls</p><h2 id="dp-cookie-heading">Choose your cookies</h2></div>
          <button type="button" className="dp-cookie-close" aria-label="Close preferences" onClick={close}>×</button>
        </div>
        <p className="dp-cookie-explainer">These preferences apply to this browser. Change them any time using “Privacy choices”. Essential security cookies do not track you for advertising.</p>
        <section className="dp-cookie-essential" aria-label="Essential cookie category">
          <span><strong>Essential</strong><small>Sign-in, CSRF protection, security, checkout and your consent receipt.</small></span>
          <span className="dp-cookie-required">Always on</span>
        </section>
        {rows.map(row=><label className="dp-cookie-option" key={row.id}>
          <span><strong>{row.title}</strong><small>{row.text}</small></span>
          <input type="checkbox" checked={effectivePreferences(value,gpc)[row.id]}
            disabled={gpc && row.id!=='functional'}
            aria-label={'Allow '+row.title.toLowerCase()}
            onChange={event=>setValue(current=>({...current,[row.id]:event.target.checked}))} />
        </label>)}
        {gpc && <p role="note" className="dp-cookie-gpc">Global Privacy Control is enabled, so analytics and marketing remain off.</p>}
        {policyUrl && <p className="dp-cookie-policy-link"><a href={policyUrl}>Read the DeeToo cookie notice</a></p>}
        <div className="dp-cookie-dialog-actions">
          <button type="button" className="dp-cookie-secondary" onClick={()=>save(defaultChoice,saved?'settings':'customize')}>Reject optional</button>
          <button type="button" className="dp-cookie-secondary" onClick={()=>save(allChoice,saved?'settings':'customize')}>Accept all</button>
          <button type="button" className="dp-cookie-primary" onClick={()=>save(value,saved?'settings':'customize')}>Save my choices</button>
        </div>
      </div>
    </div>}
    {notice && saved && !details && <div className="dp-cookie-saved" role="status">{notice}
      <button type="button" onClick={()=>setNotice('')} aria-label="Dismiss cookie preference confirmation">×</button>
    </div>}
  </div>;
}
