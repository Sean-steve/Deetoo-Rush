import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { AuthUser } from '@deetoo/types';
import { createRiderAndroidSession } from '../index';
import { riderApiOrigin } from '../config';
import { riderSecureStore } from '../secure-store';
import { getFreshLocation, startRiderLocationService, stopRiderLocationService } from '../background-location';
import { registerRiderPushDevice, subscribeToOfferNotifications } from '../push';
import { uploadDeliveryPhoto } from '../media';
import { uploadRiderImage } from './media';
import { createRiderBackend, parseRiderServerError, parseWithdrawalKes, safeRiderDeliveryAction, toKes, type RiderHistory, type RiderIncident } from './rider-backend';
import { validKenyanPhone } from '../preview/phase1-model';
import { Button, C, Field, HeroRider, MapPreview, Metric, Notice, OnboardingTracker, Panel, PrototypeShell, S, Tag } from '../preview/ui';
import type { RiderTab } from '../preview/phase1-model';

type CameraJob = { kind: 'document'|'incident'|'support'|'delivery'; ref?: string; documentType?: string } | null;
const normalPhone = (v:string) => {
  const s=v.replace(/[\s()-]/g,'');
  if (/^0[17]\d{8}$/.test(s)) return '+254'+s.slice(1);
  if (/^254[17]\d{8}$/.test(s)) return '+'+s;
  return s;
};
const id = (v:unknown) => typeof v==='string' ? v : '';
const num = (v:unknown) => Number(v)||0;
const entries = (value:any): any[] => Array.isArray(value)?value:Array.isArray(value?.items)?value.items:[];
function Row({title,value}: {title:string;value:React.ReactNode}) {
  return <View style={[S.split,{minHeight:42,gap:12,borderBottomWidth:1,borderBottomColor:C.border,paddingVertical:8}]}><Text style={[S.sub,{flex:1}]}>{title}</Text><Text style={[S.text,{fontWeight:'800',flex:1,textAlign:'right'}]}>{value}</Text></View>;
}
function Page({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}) {
  return <View style={{gap:15}}><Text style={S.h1}>{title}</Text>{subtitle?<Text style={S.sub}>{subtitle}</Text>:null}{children}</View>;
}
export function RiderConnectedApp() {
  const origin=useMemo(()=>riderApiOrigin(),[]);
  const session=useMemo(()=>createRiderAndroidSession({apiBaseUrl:origin,secureStore:riderSecureStore}),[origin]);
  const api=useMemo(()=>createRiderBackend(session.client),[session]);
  const [user,setUser]=useState<AuthUser|null>(null);
  const [restoring,setRestoring]=useState(true);
  const [view,setView]=useState(1);
  const [tab,setTab]=useState<RiderTab>('Home');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [identifier,setIdentifier]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [phone,setPhone]=useState('');
  const [form,setForm]=useState<Record<string,string>>({});
  const [status,setStatus]=useState<any>(null);
  const [offer,setOffer]=useState<any>(null);
  const [active,setActive]=useState<any>(null);
  const [detail,setDetail]=useState<any>(null);
  const [earnings,setEarnings]=useState<any>(null);
  const [wallet,setWallet]=useState<any>(null);
  const [performance,setPerformance]=useState<any>(null);
  const [checklist,setChecklist]=useState<any>(null);
  const [history,setHistory]=useState<RiderHistory[]>([]);
  const [selectedHistory,setSelectedHistory]=useState<RiderHistory|null>(null);
  const [capabilities,setCapabilities]=useState<any>(null);
  const [trends,setTrends]=useState<any>(null);
  const [feedback,setFeedback]=useState<any[]>([]);
  const [withdrawals,setWithdrawals]=useState<any[]>([]);
  const [payouts,setPayouts]=useState<any>(null);
  const [notifications,setNotifications]=useState<any[]>([]);
  const [cases,setCases]=useState<any[]>([]);
  const [caseDetail,setCaseDetail]=useState<any>(null);
  const [incidents,setIncidents]=useState<RiderIncident[]>([]);
  const [prefs,setPrefs]=useState<any>(null);
  const [filter,setFilter]=useState('');
  const [selectedDocument,setSelectedDocument]=useState('NATIONAL_ID_FRONT');
  const [cameraJob,setCameraJob]=useState<CameraJob>(null);
  const [cameraPermission,requestCameraPermission]=useCameraPermissions();
  const camera=useRef<any>(null);
  const payoutIntent=useRef<{amount:number;key:string}|null>(null);
  const [pushReady,setPushReady]=useState(false);
  const [completedDelivery,setCompletedDelivery]=useState<string|null>(null);
  const [otpMode,setOtpMode]=useState<'forgot'|'reset'|'phone'>('forgot');
  const [acceptTerms,setAcceptTerms]=useState(false);
  const [showSafetyHelp,setShowSafetyHelp]=useState(false);

  const setField=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
  const field=(k:string,label:string,placeholder='',keyboardType:any='default',multiline=false)=>
    <Field label={label} value={form[k]||''} onChangeText={(v)=>setField(k,v)} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} autoCapitalize={k.includes('email')?'none':'sentences'} />;
  const go=(n:number)=>{setView(n);setError('');setNotice(''); if(n===6)setTab('Home');else if(n>=7&&n<=15)setTab('Deliveries');else if(n>=16&&n<=18)setTab('Earnings');else if(n>=20&&n<=22)setTab('Inbox');else if(n===19||n>=23)setTab('Profile');};
  const applyTab=(t:RiderTab)=>{setTab(t);go(t==='Home'?6:t==='Deliveries'?8:t==='Earnings'?16:t==='Inbox'?20:24);};
  const run=async(action:()=>Promise<unknown>,success?:string,refreshAfter=true)=>{
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try {await action();if(refreshAfter&&user)await refresh().catch(e=>setError('Update accepted, but refresh failed: '+parseRiderServerError(e)));if(success)setNotice(success);return true;}
    catch(e){setError(parseRiderServerError(e));return false;}
    finally{setBusy(false);}
  };
  const refresh=useCallback(async()=>{
    if(!user)return;
    const [rs,off,act,earn,wal,perf]=await Promise.all([
      api.status(),api.offer(),api.activeDelivery(),api.earnings(),api.wallet(),api.performance(),
    ]);
    setStatus(rs);setOffer(off);setActive(act);setEarnings(earn);setWallet(wal);setPerformance(perf);
    const deliveryId=id(act?.delivery?.id);
    if(deliveryId) setDetail(await api.delivery(deliveryId));
    else setDetail(null);
  },[api,user]);
  const extra=useCallback(async(v:number)=>{
    if(!user)return;
    try {
      switch(v){
        case 3: case 5: setChecklist(await api.verification());break;
        case 14:setCapabilities(await api.capabilities());break;
        case 15:{const r=await api.history();setHistory(r.history);break;}
        case 16:setTrends(await api.earningsTrends(30));break;
        case 18:{const [w,p]=await Promise.all([api.payoutRequests(),api.payouts()]);setWithdrawals(w.requests);setPayouts(p);break;}
        case 19:{const r=await api.feedback();setFeedback(r.feedback);break;}
        case 20:{const r=await api.notifications();setNotifications(r.notifications);break;}
        case 21:{const r=await api.supportCases();setCases(entries(r?.cases));break;}
        case 22:if(id(form.caseId))setCaseDetail(await api.supportCase(form.caseId));break;
        case 23:{const r=await api.incidents();setIncidents(r.incidents);break;}
        case 24:setPrefs(await api.preferences());break;
      }
    }catch(e){setError(parseRiderServerError(e));}
  },[api,user,form.caseId]);
  useEffect(()=>{let mounted=true;void session.restore().then(u=>{if(mounted){setUser(u);if(u)setView(6);}}).catch(e=>{if(mounted)setError(parseRiderServerError(e));}).finally(()=>{if(mounted)setRestoring(false);});return()=>{mounted=false;};},[session]);
  useEffect(()=>{if(!user)return;void refresh().catch(e=>setError(parseRiderServerError(e)));const timer=setInterval(()=>void refresh().catch(e=>setError(parseRiderServerError(e))),8000);return()=>clearInterval(timer);},[refresh,user]);
  useEffect(()=>{if(user)void extra(view);},[view,user,extra]);
  useEffect(()=>{if(!user||!pushReady)return;return subscribeToOfferNotifications(()=>void refresh());},[user,pushReady,refresh]);
  const login=()=>run(async()=>{
    const u=await session.login(identifier.trim(),password);
    if(!u.roles?.map(String).some(x=>x.toLowerCase()==='rider')){await session.logout();throw new Error('A Rider account is required.');}
    setUser(u);go(6);
  },undefined,false);
  const logout=()=>run(async()=>{
    await stopRiderLocationService().catch(()=>undefined);await session.logout();setUser(null);setView(1);setStatus(null);setOffer(null);setActive(null);
    setWallet(null);setCases([]);setNotifications([]);setForm({});setPushReady(false);
  },undefined,false);
  const register=()=>run(async()=>{
    if(!acceptTerms)throw new Error('Confirm your Rider application details before registering.');
    if(!validKenyanPhone(form.phone||'')||!validKenyanPhone(form.emergency||''))throw new Error('A valid Kenyan Rider and emergency contact phone are required.');
    if((form.password||'').length<8)throw new Error('Use a stronger password of at least eight characters.');
    const response=await fetch(origin+'/api/v1/auth/register/rider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      name:form.name,email:form.email||undefined,phone_e164:normalPhone(form.phone),
      password:form.password,address:form.address,emergency_contact_name:form.emergencyName,
      emergency_contact_phone:normalPhone(form.emergency),
    })});
    const value=await response.json();
    if(!response.ok)throw new Error(value?.error?.message||'Rider registration failed.');
    setIdentifier(normalPhone(form.phone));setPassword(form.password);setNotice('Rider application created. Sign in to continue verification.');
    setView(1);
  },undefined,false);
  const availability=()=>run(async()=>{
    const workStatus=String(status?.profile?.workStatus||'OFFLINE');
    if(workStatus==='ONLINE_AVAILABLE'||workStatus==='ONLINE_UNAVAILABLE'||workStatus==='ON_DELIVERY'){
      await api.goOffline();
      await stopRiderLocationService();
      return;
    }
    // The Go Online API verifies and records this GPS fix itself. Sending
    // /rider/location first duplicates Redis work, and can store coordinates
    // even when the rider is ineligible to start an availability session.
    const loc=await getFreshLocation();
    const data={latitude:loc.coords.latitude,longitude:loc.coords.longitude,accuracy_meters:loc.coords.accuracy||0};
    await api.goOnline(data);
    await startRiderLocationService();
    await registerRiderPushDevice(session.client).then(()=>setPushReady(true)).catch(()=>setNotice('Online. Push permissions still need attention.'));
  },'Availability updated by DeeToo.');
  const atLocation=async(method:'arrivePickup'|'arriveDropoff')=>{
    const d=id(active?.delivery?.id);
    const loc=await getFreshLocation();const data={latitude:loc.coords.latitude,longitude:loc.coords.longitude,accuracy_meters:loc.coords.accuracy||0,recorded_at:new Date(loc.timestamp).toISOString()};
    if(method==='arrivePickup')return api.arrivePickup(d,data);return api.arriveDropoff(d,data);
  };
  const performDelivery=(method:'arrivePickup'|'pickup'|'startTrip'|'arriveDropoff'|'complete'|'fail')=>{
    const d=id(active?.delivery?.id),state=id(active?.delivery?.status);
    if(!d||!safeRiderDeliveryAction(state,method)){setError('The server delivery state does not permit that action. Refresh and retry.');return;}
    void run(async()=>{
      if(method==='arrivePickup'||method==='arriveDropoff')await atLocation(method);
      else if(method==='pickup')await api.confirmPickup(d,form.pickupCode||'');
      else if(method==='startTrip')await api.startTrip(d);
      else if(method==='complete'){await api.completeOtp(d,form.deliveryOtp||'');setCompletedDelivery(d);go(13);}
      else if(method==='fail')await api.reportFailedDelivery(d,'CUSTOMER_UNREACHABLE',form.issue||'');
    },'Delivery status confirmed by DeeToo.');
  };
  const startCamera=async(job:NonNullable<CameraJob>)=>{const perm=cameraPermission?.granted ? cameraPermission : await requestCameraPermission();if(!perm?.granted){setError('Camera permission is required to capture verified media.');return;}setCameraJob(job);};
  const takePhoto=()=>void run(async()=>{
    if(!camera.current||!cameraJob)throw new Error('Camera is unavailable');
    const pic=await camera.current.takePictureAsync({quality:0.7,skipProcessing:false});
    if(!pic?.uri)throw new Error('Could not capture a photo.');
    const job=cameraJob;
    if(job.kind==='delivery'){
      const deliveryId=id(active?.delivery?.id);
      const mediaId=await uploadDeliveryPhoto(session.client,deliveryId,pic.uri);
      await api.completePhoto(deliveryId,mediaId);
      setCompletedDelivery(deliveryId);go(13);
    }else{
      const purpose=job.kind==='document'?'RIDER_DOCUMENT':job.kind==='incident'?'RIDER_INCIDENT':'SUPPORT_ATTACHMENT';
      const mediaId=await uploadRiderImage(session.client,pic.uri,purpose,job.ref);
      if(job.kind==='document')await api.submitDocument(mediaId,job.documentType||'NATIONAL_ID_FRONT');
      else if(job.kind==='incident')await api.incidentEvidence(job.ref||'',mediaId,'Photographic evidence provided by reporting Rider');
      else if(job.kind==='support')await api.sendSupportMessage(job.ref||'','Attached Rider evidence photo',[mediaId]);
    }
    setCameraJob(null);
  },'Private media captured, verified and submitted.');
  if(restoring)return <View style={[S.page,{justifyContent:'center',alignItems:'center',gap:15}]}><ActivityIndicator size="large" color={C.green}/><Text style={S.sub}>Restoring secure Rider session…</Text></View>;
  if(cameraJob)return <View style={{flex:1,backgroundColor:C.navy}}><CameraView ref={camera} facing="back" style={{flex:1}}/><View style={{padding:16,gap:9}}><Button label="Capture and submit secure photo" onPress={takePhoto} disabled={busy}/><Button outline label="Cancel" onPress={()=>setCameraJob(null)} /></View>{error?<Text style={{color:'#fff'}}>{error}</Text>:null}</View>;

  let body:React.ReactNode=null;
  const a=active?.delivery,deliveryId=id(a?.id),deliveryStatus=id(a?.status);
  const online=['ONLINE','AVAILABLE','BUSY'].includes(status?.profile?.workStatus);
  const name=status?.profile?.firstName||user?.name||'Rider';

  if(!user && view===1)body=<Page title="Welcome back, Rider" subtitle="Log in securely to your DeeToo delivery workspace.">
    <HeroRider title="Deliver. Earn. Grow." sub="Your approved Rider experience, powered by DeeToo." />
    <Panel title="Sign in"><View style={{gap:12}}>
      <Field label="Phone or email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" placeholder="+254 7…" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Your password" />
      <Button outline label={showPassword?'Hide password':'Show password'} onPress={()=>setShowPassword(x=>!x)} />
      <Button label="Log In →" onPress={()=>void login()} disabled={busy} />
      <Button outline label="Forgot password?" onPress={()=>{setOtpMode('forgot');go(1);setField('recoverStep','1');}}/>
      <Button outline label="Register as a Rider" onPress={()=>go(2)} />
    </View></Panel>
    {form.recoverStep? <Panel title="Secure password recovery"><View style={{gap:10}}>
      {form.recoverStep==='1'?
        <><Text style={S.sub}>A recovery token will be delivered through the configured DeeToo channel.</Text>
        {field('recoveryId','Registered email or phone')}
        <Button label="Request reset" onPress={()=>void run(async()=>{
          const r=await fetch(origin+'/api/v1/auth/password/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:form.recoveryId})});
          if(!r.ok)throw new Error('Recovery request could not be completed.');
          setField('recoverStep','2');
        },'Check your registered recovery channel.',false)} /></>:
        <>{field('resetToken','Recovery token')}{field('resetPassword','New password')}
        <Button label="Reset password" onPress={()=>void run(async()=>{
          const r=await fetch(origin+'/api/v1/auth/password/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:form.resetToken,new_password:form.resetPassword})});
          if(!r.ok)throw new Error('Reset token invalid or expired.');setField('recoverStep','');
        },'Password updated. Sign in.',false)} /></>}
    </View></Panel>:null}
  </Page>;
  else if(!user && view===2)body=<Page title="Rider Registration" subtitle="Screen 2 • Create a pending, unapproved Rider application.">
    <HeroRider title="Start your Rider journey" sub="Identity checks and verification will follow registration."/>
    <Panel title="Personal & contact details"><View style={{gap:12}}>
      {field('name','Full name','As on your National ID')}
      {field('phone','Kenyan phone number','+2547…','phone-pad')}
      {field('email','Email (optional)','name@example.com','email-address')}
      <Field label="New password" value={form.password||''} onChangeText={v=>setField('password',v)} secureTextEntry placeholder="Use a strong password" />
      {field('address','Residential address','Street / estate, county')}
      {field('emergencyName','Emergency contact name')}
      {field('emergency','Emergency phone','+2547…','phone-pad')}
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:acceptTerms}} onPress={()=>setAcceptTerms(!acceptTerms)} style={[S.row,{gap:10,minHeight:48}]}><Text>{acceptTerms?'☑':'□'}</Text><Text style={[S.sub,{flex:1}]}>The information provided is correct. I understand approval is required before delivery assignments.</Text></Pressable>
      <Button label="Submit Registration" onPress={()=>void register()} disabled={busy}/>
      <Button outline label="Back to Login" onPress={()=>go(1)}/>
    </View></Panel>
  </Page>;
  else if(!user)body=<Button label="Back to Login" onPress={()=>go(1)}/>;
  else switch(view){
    case 3: body=<Page title="Document Verification" subtitle="Screen 3 • Secure uploads and administrator review">
      <Panel><OnboardingTracker step={2} /></Panel>
      <Notice title={checklist?.ready?'Verification ready':'Verification required'} body={checklist?.missing?.join(', ')||'Documents are reviewed by an authorized administrator.'} tone={checklist?.ready?'green':'orange'} />
      <Panel title="Required documents">{['NATIONAL_ID_FRONT','NATIONAL_ID_BACK','SELFIE','DRIVING_LICENCE','VEHICLE_INSURANCE','VEHICLE_LOGBOOK'].map(t=>{
        const docs=entries(checklist?.documents).filter((d:any)=>d.document_type===t),current=docs[0];
        return <View key={t} style={{paddingVertical:9,gap:8,borderBottomWidth:1,borderColor:C.border}}>
          <Row title={t.replace(/_/g,' ')} value={current?.status||'Not submitted'}/>
          {current?.rejection_reason?<Text style={[S.meta,{color:C.red}]}>{current.rejection_reason}</Text>:null}
          <Button outline label={'Capture '+t.replace(/_/g,' ')} onPress={()=>void startCamera({kind:'document',documentType:t})}/>
        </View>;
      })}</Panel>
      <Button label="Refresh verification status" onPress={()=>void extra(3)} />
      <Button outline label="Next: Vehicle & Equipment" onPress={()=>go(4)}/>
    </Page>;break;
    case 4:body=<Page title="Vehicle & Equipment" subtitle="Screen 4 • Transport and mandatory safety equipment">
      <Panel title="Vehicle registration"><View style={{gap:10}}>
        <Text style={S.label}>Vehicle type</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['MOTORBIKE','BICYCLE','CAR'].map(t=><Button key={t} outline={form.vehicleType!==t} label={t} onPress={()=>setField('vehicleType',t)}/>)}</View>
        {field('vehiclePlate','Registration / plate','e.g. KDA 123A')}
        <Button label="Submit vehicle for verification" onPress={()=>void run(()=>api.submitVehicle({type:(form.vehicleType||'MOTORBIKE') as 'MOTORBIKE'|'BICYCLE'|'CAR',registration_number:form.vehiclePlate||'',status:'INACTIVE'}),'Vehicle submitted for review.')}/>
      </View></Panel>
      <Panel title="Equipment checklist"><View style={{gap:9}}>
        {['delivery_bag','reflective_vest','helmet'].map(t=><Pressable key={t} accessibilityRole="checkbox" accessibilityState={{checked:form[t]==='yes'}} onPress={()=>setField(t,form[t]==='yes'?'no':'yes')} style={[S.row,{minHeight:48,gap:9}]}><Text style={{fontSize:23}}>{form[t]==='yes'?'☑':'□'}</Text><Text style={S.text}>{t.replace(/_/g,' ')}</Text></Pressable>)}
        <Button label="Submit equipment for review" onPress={()=>void run(()=>api.submitEquipment({delivery_bag:form.delivery_bag==='yes',reflective_vest:form.reflective_vest==='yes',helmet:form.helmet==='yes'}),'Equipment queued for independent review.')}/>
      </View></Panel>
      <Button outline label="Review onboarding status →" onPress={()=>go(5)}/>
    </Page>;break;
    case 5:body=<Page title="Onboarding Status" subtitle="Screen 5 • Authoritative account status and verification checklist">
      <HeroRider title="Your Rider application" sub="Approval comes from DeeToo administration, not the device."/>
      <Panel title="Account and eligibility">
        <Row title="Onboarding" value={status?.profile?.onboardingStatus||'Not available'}/>
        <Row title="Work status" value={status?.profile?.workStatus||'OFFLINE'}/>
        <Row title="Verification" value={checklist?.ready?'Ready':checklist?.required?'Pending':'Not required'}/>
        {entries(checklist?.missing).map((x:any)=><Text key={String(x)} style={[S.sub,{color:C.red}]}>{String(x).replace(/_/g,' ')}</Text>)}
      </Panel>
      <Panel title="Verify your phone number">
        <Text style={S.sub}>A live DeeToo verification code is sent to your registered phone. This is not a demo OTP.</Text>
        <Row title="Phone" value={user?.phone_e164||'Not registered'}/>
        <Button outline label="Send phone verification code" onPress={()=>void run(()=>api.requestPhoneVerification(user?.phone_e164||''),'Verification code requested.')}/>
        {field('phoneOtp','Enter SMS verification code','','number-pad')}
        <Button label="Confirm phone code" disabled={!form.phoneOtp||busy} onPress={()=>void run(()=>api.confirmPhoneVerification(user?.phone_e164||'',form.phoneOtp||''),'Phone verification sent to DeeToo. Refresh status.')}/>
      </Panel>
      <Button label="Submit for administrative review" onPress={()=>void run(()=>api.submitOnboarding(),'Application submitted for review.')} disabled={busy}/>
      <Button outline label="Documents" onPress={()=>go(3)}/><Button outline label="Equipment & Vehicle" onPress={()=>go(4)}/>
      <Button outline label="Back to Home" onPress={()=>go(6)}/>
    </Page>;break;
    case 6:body=<Page title={'Good day, '+name+' 👋'} subtitle="Screen 6 • Live Rider dashboard">
      <Panel title="Availability">
        <Row title="Server work status" value={<Tag label={status?.profile?.workStatus||'OFFLINE'} tone={online?'green':'orange'}/>}/>
        <Row title="Service zones" value={entries(status?.assignedZones).length+' assigned'}/>
        <Button label={online?'Go offline':'Go online & receive orders'} onPress={()=>void availability()} disabled={busy||status?.profile?.workStatus==='BUSY'} />
        {!pushReady?<Button outline label="Enable push notifications" onPress={()=>void run(async()=>{await registerRiderPushDevice(session.client);setPushReady(true);},'Push subscription registered.')}/>:null}
      </Panel>
      <View style={{flexDirection:'row',gap:9,flexWrap:'wrap'}}>
        <Metric title="Available earnings" value={toKes(wallet?.available_earnings_minor)}/>
        <Metric title="Pending earnings" value={toKes(wallet?.pending_earnings_minor)} tone="blue"/>
      </View>
      <Panel title="Operational summary">
        <Row title="Onboarding" value={status?.profile?.onboardingStatus||'—'}/>
        <Row title="Active delivery" value={a?.order_number||a?.id||'None'}/>
        <Row title="Waiting offer" value={offer?.offer?.id?'Available':'None'}/>
        <Row title="Customer rating" value={performance?.average_rating??'—'}/>
        <Button label="Open delivery operations" onPress={()=>go(offer?.offer?.id?7:8)}/>
        <Button outline label="Verification & onboarding" onPress={()=>go(5)}/>
      </Panel>
      <Panel title="Service zone"><MapPreview/><Text style={S.meta}>Reference map only; live GPS is transmitted only for authorized availability and delivery events.</Text></Panel>
    </Page>;break;
    case 7:body=<Page title="Incoming Delivery Request" subtitle="Screen 7 • Server-issued offer and expiry">
      {!offer?.offer?.id?<Notice title="No live offers" body="DeeToo dispatch has not issued an offer to this Rider. Remain online within an assigned zone." tone="blue"/>:
        <><Panel title="Delivery offer">
          <Text style={S.h2}>{offer.restaurantName||'Merchant pickup'}</Text>
          <Row title="Pickup" value={offer.pickupAddress||'—'}/>
          <Row title="Drop-off" value={offer.dropoffAddress||'—'}/>
          <Row title="Expected Rider pay" value={offer.estimatedEarningsMinor==null?'Not yet estimated':toKes(offer.estimatedEarningsMinor)}/>
          <Row title="Distance to pickup" value={num(offer.distanceToPickupMeters)+' m'}/>
          <Row title="Server time remaining" value={num(offer.secondsRemaining)+' sec'}/>
          <Row title="Items" value={num(offer.itemCount)}/>
        </Panel>
        <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><Button outline label="Decline" onPress={()=>void run(()=>api.declineOffer(id(offer.offer.id)),'Offer declined.')}/></View><View style={{flex:2}}><Button label="Accept" onPress={()=>void run(async()=>{await api.acceptOffer(id(offer.offer.id));go(8);},'DeeToo assigned the delivery.')}/></View></View></>}
      <Button outline label="Refresh offer" onPress={()=>void refresh()}/>
    </Page>;break;
    case 8:body=<Page title="Active Delivery Details" subtitle="Screen 8 • Server-controlled delivery milestones">
      {!a?<Notice title="No assigned delivery" body="An accepted offer will appear here. Assignment is authoritative; no order can be created from this screen." tone="blue"/>:
      <Panel title={'Order '+(a.order_number||a.id)}>
        <Row title="Delivery status" value={deliveryStatus}/>
        <Row title="Merchant" value={detail?.pickup?.name||'—'}/>
        <Row title="Pickup address" value={detail?.pickup?.address||'—'}/>
        <Row title="Drop-off" value={detail?.dropoff?.address||'—'}/>
        <Row title="Order items" value={entries(detail?.items).length}/>
        {entries(detail?.items).map((item:any,i)=><Row key={i} title={item.name||item.product_name||'Item'} value={item.quantity||1}/>)}
      </Panel>}
      {a?<Button label={deliveryStatus==='ASSIGNED'?'Navigate to Merchant':deliveryStatus==='ARRIVED_PICKUP'?'Confirm Pickup':deliveryStatus==='ARRIVED_DROPOFF'?'Confirm Handover':'Continue Delivery'} onPress={()=>go(deliveryStatus==='ASSIGNED'?9:deliveryStatus==='ARRIVED_PICKUP'?10:deliveryStatus==='ARRIVED_DROPOFF'?12:11)}/>:<Button label="View offers" onPress={()=>go(7)}/>}
      <Button outline label="Report a delivery problem" onPress={()=>go(23)}/>
    </Page>;break;
    case 9:case 11:{
      const pickup=view===9;
      const address=pickup?detail?.pickup?.address:detail?.dropoff?.address;
      const maps=pickup?detail?.navigation?.pickupMapsUrl:detail?.navigation?.dropoffMapsUrl;
      body=<Page title={pickup?'Navigate to Merchant':'Navigate to Customer'} subtitle={pickup?'Screen 9 • Live pickup milestone':'Screen 11 • Live drop-off milestone'}>
        <Panel title={pickup?'Merchant pickup':'Customer drop-off'}>
          <Row title="Destination" value={address||'Awaiting active delivery'}/>
          <Row title="Live state" value={deliveryStatus||'—'}/>
          <Text style={S.sub}>Use your preferred navigation provider. Any map illustration below is not turn-by-turn traffic guidance.</Text>
          <MapPreview/>
          {maps?<Button outline label="Open navigation" onPress={()=>void Linking.openURL(maps).catch(e=>setError(parseRiderServerError(e)))}/>:<Notice title="Route unavailable" body="DeeToo did not provide a navigation link for this active delivery." tone="orange"/>}
        </Panel>
        <Button label={pickup?'Arrived at Merchant':'Arrived at Customer'} disabled={!safeRiderDeliveryAction(deliveryStatus,pickup?'arrivePickup':'arriveDropoff')||busy} onPress={()=>performDelivery(pickup?'arrivePickup':'arriveDropoff')}/>
        <Button outline label="View delivery details" onPress={()=>go(8)}/>
      </Page>;break;
    }
    case 10:body=<Page title="Merchant Pickup Confirmation" subtitle="Screen 10 • Merchant-confirmed items and server pickup code">
      <Panel title="Pickup details">
        <Row title="Order" value={a?.order_number||'—'}/>
        <Row title="Status" value={deliveryStatus||'No active delivery'}/>
        {entries(detail?.items).map((x:any,i)=><Row key={i} title={x.name||x.product_name||'Item'} value={x.quantity||1}/>)}
        {field('pickupCode','Merchant pickup verification code','Ask merchant for the current code')}
        <Text style={S.meta}>DeeToo verifies the merchant pickup code and READY status. No code is generated on this device.</Text>
        <Button label="Confirm Collection" disabled={!safeRiderDeliveryAction(deliveryStatus,'pickup')||!form.pickupCode?.trim()||busy} onPress={()=>performDelivery('pickup')}/>
      </Panel>
      <Button outline label="Missing items / merchant delay? Report issue" onPress={()=>go(23)}/>
      <Button outline label="Navigate to Customer" onPress={()=>go(11)}/>
    </Page>;break;
    case 12:body=<Page title="Customer Handover" subtitle="Screen 12 • Verified delivery proof and failure escalation">
      <Panel title="Handover">
        <Row title="Delivery" value={a?.order_number||'—'}/>
        <Row title="Status" value={deliveryStatus||'—'}/>
        {field('deliveryOtp','Customer delivery OTP','Customer-supplied code','number-pad')}
        <Button label="Confirm delivery with OTP" disabled={!safeRiderDeliveryAction(deliveryStatus,'complete')||!form.deliveryOtp||busy} onPress={()=>performDelivery('complete')}/>
        <Button outline label="Capture secure photo proof" disabled={!safeRiderDeliveryAction(deliveryStatus,'complete')} onPress={()=>void startCamera({kind:'delivery',ref:deliveryId})}/>
      </Panel>
      <Panel title="Handover issue">
        {field('issue','Describe customer unreachable / address concern','','default',true)}
        <Button outline label="Report failed delivery to Operations" disabled={!safeRiderDeliveryAction(deliveryStatus,'fail')||((form.issue||'').trim().length<3)||busy} onPress={()=>performDelivery('fail')}/>
      </Panel>
      <Notice title="DeeToo controls final outcome" body="A reported failure does not clear Rider custody or directly resolve the order. Follow Operations instructions." tone="orange"/>
    </Page>;break;
    case 13:body=<Page title="Delivery Completion Summary" subtitle="Screen 13 • Authoritative completed-order reference">
      <Notice title="Delivery update recorded" body={completedDelivery?'The backend accepted a verified handover.':'Select a completed delivery from your own history to view its verified receipt.'}/>
      <Panel title="Receipt details">
        <Row title="Delivery ID" value={selectedHistory?.delivery_id||completedDelivery||'—'}/>
        <Row title="Status" value={selectedHistory?.status||'DELIVERED'}/>
        <Row title="Ledger posting" value={selectedHistory?.earning?.status||'Loading from DeeToo'}/>
        {selectedHistory?.earning?<><Row title="Base pay" value={toKes(selectedHistory.earning.base_minor)}/><Row title="Distance" value={toKes(selectedHistory.earning.distance_minor)}/><Row title="Bonus" value={toKes(selectedHistory.earning.bonus_minor)}/><Row title="Total Rider pay" value={toKes(selectedHistory.earning.total_minor)}/></>:null}
      </Panel>
      <Button label="View delivery history" onPress={()=>go(15)}/><Button outline label="Next available offers" onPress={()=>go(7)}/>
    </Page>;break;
    case 14:body=<Page title="Active Deliveries & Multiple Orders" subtitle="Screen 14 • Capability-gated dispatch">
      <Panel title="Concurrent delivery capability">
        <Tag label={capabilities?.multi_order?.enabled?'Enabled':'Unavailable'} tone={capabilities?.multi_order?.enabled?'green':'orange'}/>
        <Text style={[S.sub,{marginTop:12}]}>{capabilities?.multi_order?.message||'Waiting for DeeToo dispatch capability status.'}</Text>
        <Row title="Maximum active jobs" value={capabilities?.multi_order?.max_active_deliveries??1}/>
      </Panel>
      <Notice title="Server-authoritative route order" body="Multiple-order acceptance, stop reordering and custody changes are not offered while dispatch stacking is uncertified." tone="blue"/>
      <Button label="View active delivery" onPress={()=>go(8)}/>
    </Page>;break;
    case 15:body=<Page title="Delivery History" subtitle="Screen 15 • Your completed, cancelled and failed delivery records">
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['','DELIVERED','FAILED','CANCELLED'].map(x=><Button key={x||'all'} outline={filter!==x} label={x||'All'} onPress={()=>{setFilter(x);void api.history(x||undefined).then(r=>setHistory(r.history)).catch(e=>setError(parseRiderServerError(e)));}}/>)}</View>
      {history.length===0?<Notice title="No history yet" body="Only deliveries assigned to your account will appear here." tone="blue"/>:history.map(x=><Panel key={x.delivery_id}>
        <Row title="Order" value={x.order_number||x.order_id}/>
        <Row title="Status" value={<Tag label={x.status} tone={x.status==='DELIVERED'?'green':'orange'}/>}/>
        <Row title="Delivery date" value={String(x.delivered_at||x.created_at).slice(0,16)}/>
        <Row title="Recorded earnings" value={x.earning?toKes(x.earning.total_minor):'Pending backend review'}/>
        <Button outline label="View receipt" onPress={()=>{setSelectedHistory(x);go(13);}}/>
      </Panel>)}
      <Button outline label="Refresh records" onPress={()=>void extra(15)}/>
    </Page>;break;
    case 16:body=<Page title="Earnings Dashboard" subtitle="Screen 16 • Authoritative earnings, bonuses and time series">
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
        <Metric title="Earnings in period" value={toKes(trends?.total_minor)}/>
        <Metric title="Deliveries" value={String(trends?.deliveries??0)} tone="blue"/>
      </View>
      <Panel title="Earnings trend">
        <View style={{flexDirection:'row',gap:7}}>{[7,30,90].map(n=><Button key={n} outline label={n+' days'} onPress={()=>void api.earningsTrends(n).then(setTrends).catch(e=>setError(parseRiderServerError(e)))}/>)}</View>
        {entries(trends?.series).length===0?<Notice title="No posted earnings" body="There are no earned delivery records for the selected period." tone="blue"/>:
          <View style={{flexDirection:'row',alignItems:'flex-end',gap:5,minHeight:170,paddingTop:10}}>
            {entries(trends?.series).slice(-12).map((x:any,i:number)=>{const max=Math.max(...entries(trends?.series).map((q:any)=>num(q.total_minor)),1);return <View key={i} style={{flex:1,alignItems:'center',gap:4}}>
              <View style={{width:'85%',backgroundColor:C.green,borderRadius:6,height:Math.max(5,135*num(x.total_minor)/max)}}/><Text style={[S.meta,{fontSize:9}]}>{String(x.date).slice(5)}</Text></View>;})}
          </View>}
      </Panel>
      <Panel title="Wallet & payouts"><Row title="Wallet available" value={toKes(wallet?.available_earnings_minor)}/><Row title="Cash owed" value={toKes(wallet?.cash_owed_minor)}/>
        <Button label="View wallet" onPress={()=>go(17)}/><View style={{height:8}}/><Button outline label="Payout requests" onPress={()=>go(18)}/></Panel>
    </Page>;break;
    case 17:body=<Page title="Rider Wallet & Cash Management" subtitle="Screen 17 • Ledger-owned funds and cash obligations">
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <Metric title="Available to withdraw" value={toKes(wallet?.available_earnings_minor)}/>
        <Metric title="Pending earnings" value={toKes(wallet?.pending_earnings_minor)} tone="blue"/>
        <Metric title="Cash collected" value={toKes(wallet?.cash_collected_minor)} tone="orange"/>
        <Metric title="Cash outstanding" value={toKes(wallet?.cash_owed_minor)} tone="orange"/>
      </View>
      <Panel title="Reconciliation">
        <Row title="Ledger reconciled" value={wallet?.ledger_reconciled?'Yes':'Needs review'}/>
        <Row title="Cash restricted" value={wallet?.cash_restricted?'Yes':'No'}/>
        {field('cashDispute','Describe cash discrepancy','','default',true)}
        <Button outline label="Open cash discrepancy support case" onPress={()=>{setField('supportCategory','PAYMENT');setField('supportSubject','Rider cash reconciliation review');setField('supportDescription',form.cashDispute||'');go(21);}}/>
      </Panel>
      <Notice title="Cash is not payout balance" body="Rider cash collected, money owed to DeeToo and earnings eligible for payout remain distinct backend records." tone="blue"/>
      <Button label="Request M-PESA payout" onPress={()=>go(18)}/>
    </Page>;break;
    case 18:body=<Page title="Payouts & Transactions" subtitle="Screen 18 • Finance-reviewed M-PESA requests">
      <Panel title="Available funds"><Text style={[S.h1,{color:C.darkGreen}]}>{toKes(wallet?.available_earnings_minor)}</Text>
        {field('withdrawal','Requested amount (KSh)','e.g. 500','decimal-pad')}
        <Text style={S.meta}>Minimum KSh 100. Destination must be verified separately by Finance. Requests do not move money.</Text>
        <Button label="Submit payout request for Finance review" disabled={busy} onPress={()=>void run(async()=>{
          const minor=parseWithdrawalKes(form.withdrawal||'');
          if(minor==null)throw new Error('Enter a valid payout amount of KSh 100 or more.');
          // Keep the same key on a retry after a network failure. A retry must
          // not create a fresh withdrawal intent for the same submission.
          if (!payoutIntent.current || payoutIntent.current.amount!==minor) {
            payoutIntent.current={amount:minor,key:'rider-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)};
          }
          await api.requestWithdrawal(minor,payoutIntent.current.key);
          payoutIntent.current=null;
          const r=await api.payoutRequests();setWithdrawals(r.requests);
        },'Withdrawal request queued for Finance review. No funds have been sent.')}/>
      </Panel>
      <Panel title="Withdrawal requests">
        {withdrawals.length===0?<Text style={S.sub}>No withdrawal requests.</Text>:withdrawals.map((w:any)=><View key={w.id}><Row title={String(w.created_at).slice(0,10)} value={toKes(w.amount_minor)}/><Row title="Review status" value={<Tag label={w.status} tone={w.status==='REJECTED'?'red':'orange'}/>}/>{w.rejection_reason?<Text style={S.meta}>{w.rejection_reason}</Text>:null}</View>)}
      </Panel>
      <Notice title="Provider-owned payout status" body="Only Finance can approve a payout, and DeeToo verifies provider callbacks before marking money paid. The Rider cannot trigger these privileged actions." tone="blue"/>
      <Button outline label="Request M-PESA destination change" onPress={()=>{setField('changeCategory','PAYOUT_DESTINATION');go(24);}}/>
    </Page>;break;
    case 19:body=<Page title="Performance & Ratings" subtitle="Screen 19 • Backend ratings, delivery KPIs and customer comments">
      <Panel title="Delivery performance">
        {['average_rating','completion_rate','acceptance_rate','on_time_rate','completed_deliveries'].map(key=><Row key={key} title={key.replace(/_/g,' ')} value={performance?.[key]??'—'}/>)}
      </Panel>
      <Panel title="Customer feedback">
        {feedback.length===0?<Notice title="No feedback in this period" body="Customer-sourced reviews will appear once available." tone="blue"/>:feedback.map((x:any,i)=><View key={i} style={{borderBottomWidth:1,borderColor:C.border,paddingVertical:9}}>
          <Text style={[S.h2,{color:C.orange}]}>{'★'.repeat(Math.min(5,Math.max(0,num(x.rating))))}</Text>
          <Text style={S.sub}>{x.comment||'No written comment'}</Text>
          <Text style={S.meta}>{String(x.created_at).slice(0,10)}</Text></View>)}
      </Panel>
    </Page>;break;
    case 20:body=<Page title="Notifications Center" subtitle="Screen 20 • Recipient-scoped persistent DeeToo alerts">
      <Panel title="Your notifications">
        {notifications.length===0?<Notice title="Inbox is clear" body="No server notifications yet." tone="blue"/>:notifications.map((n:any)=><Pressable key={n.id} accessibilityRole="button" onPress={()=>void run(async()=>{await api.markRead(n.id);const x=await api.notifications();setNotifications(x.notifications);},undefined,false)} style={{paddingVertical:12,borderBottomWidth:1,borderColor:C.border}}>
          <Text style={[S.text,{fontWeight:'800'}]}>{n.read_at?'':'● '}{n.title||n.type||'Update'}</Text>
          <Text style={S.sub}>{n.body||n.message||''}</Text>
          <Text style={S.meta}>{String(n.created_at||'').slice(0,16)}</Text>
        </Pressable>)}
      </Panel>
      <Button outline label="Support cases" onPress={()=>go(21)}/>
      <Button outline label="Notification preferences" onPress={()=>go(24)}/>
    </Page>;break;
    case 21:body=<Page title="Rider Support Center" subtitle="Screen 21 • Admin-governed cases and verified participants">
      <Panel title="Open a support case"><View style={{gap:11}}>
        {field('supportSubject','Subject')}
        {field('supportCategory','Category','e.g. DELIVERY, PAYMENT, ACCOUNT_UPDATE')}
        {field('supportDescription','Describe your issue','','default',true)}
        {field('supportOrderId','Related order ID (optional; must belong to you)')}
        <Button label="Create support case" onPress={()=>void run(async()=>{
          const created=await api.createSupportCase({category:form.supportCategory||'OTHER',subject:form.supportSubject||'Rider support request',description:form.supportDescription||'',...(form.supportOrderId?{order_id:form.supportOrderId}: {})});
          setField('caseId',created.id);go(22);
        },'Support case created with authorized participants.')}/>
      </View></Panel>
      <Panel title="Your cases">
        {cases.length===0?<Notice title="No cases" body="Contact support above to open a new conversation." tone="blue"/>:cases.map((c:any)=><Pressable key={c.id} accessibilityRole="button" onPress={()=>{setField('caseId',c.id);setCaseDetail(null);go(22);}} style={{paddingVertical:12,borderBottomWidth:1,borderColor:C.border}}>
          <Text style={[S.text,{fontWeight:'800'}]}>{c.subject}</Text><Text style={S.meta}>{c.case_number||c.id} · {c.status}</Text>
        </Pressable>)}
      </Panel>
      <Button outline label="Report safety incident" onPress={()=>go(23)}/>
    </Page>;break;
    case 22:body=<Page title="Support Conversation" subtitle="Screen 22 • Authorized full case history and Rider satisfaction">
      {!caseDetail?<Notice title="Loading case" body="Choose a case from Support Center or retry loading." tone="blue"/>:<>
        <Panel title={caseDetail.case?.subject||'Support case'}>
          <Row title="Case status" value={<Tag label={caseDetail.case?.status||'—'} tone="orange"/>}/>
          <Row title="Reference" value={caseDetail.case?.case_number||caseDetail.case?.id}/>
          {entries(caseDetail.notes).map((n:any)=><View key={n.id} style={{padding:12,borderRadius:12,backgroundColor:String(n.author_role).toLowerCase()==='rider'?C.mint:C.paleBlue,marginVertical:7}}>
            <Text style={[S.meta,{fontWeight:'800'}]}>{n.author_name||n.author_role||'Support'} · {String(n.created_at).slice(0,16)}</Text>
            <Text style={S.text}>{n.body}</Text></View>)}
        </Panel>
        <Panel title="Send message">
          {field('chatMessage','Message','','default',true)}
          <Button label="Send to Support" disabled={busy} onPress={()=>void run(async()=>{await api.sendSupportMessage(form.caseId,form.chatMessage||'');setField('chatMessage','');setCaseDetail(await api.supportCase(form.caseId));},'Message added to authorized conversation.',false)}/>
          <Button outline label="Attach secure camera evidence" onPress={()=>void startCamera({kind:'support',ref:form.caseId})}/>
        </Panel>
        {caseDetail.case?.status==='PARTY_CONFIRMATION'?<Panel title="Resolution confirmation">
          <Text style={S.sub}>Your satisfaction does not resolve the case. An authorized Admin controls final closure.</Text>
          <Button outline label="I am satisfied" onPress={()=>void run(async()=>{await api.respondSupport(form.caseId,'ACCEPTED','Rider confirms satisfied');setCaseDetail(await api.supportCase(form.caseId));})}/>
          <Button outline label="I need more help" onPress={()=>void run(async()=>{await api.respondSupport(form.caseId,'DISPUTED','Rider requests further review');setCaseDetail(await api.supportCase(form.caseId));})}/>
        </Panel>:null}
      </>}
      <Button outline label="Back to Support Center" onPress={()=>go(21)}/>
    </Page>;break;
    case 23:body=<Page title="Safety & Incident Reporting" subtitle="Screen 23 • Rider-created reports and Admin-owned investigation">
      <Pressable accessibilityRole="button" onPress={()=>setShowSafetyHelp(!showSafetyHelp)} style={{padding:16,backgroundColor:C.paleRed,borderRadius:16,minHeight:65}}>
        <Text style={{color:C.red,fontWeight:'900',fontSize:18}}>☎ Emergency assistance information</Text>
        <Text style={S.meta}>Open safety instructions. No emergency call is initiated.</Text>
      </Pressable>
      {showSafetyHelp?<Notice title="Immediate danger?" body="Move somewhere safe and call local emergency services directly using your phone. This app does not automatically dispatch emergency help." tone="red"/>:null}
      <Panel title="Report safety incident"><View style={{gap:11}}>
        <Text style={S.label}>Incident category</Text>
        <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>{['ACCIDENT','VEHICLE_BREAKDOWN','UNSAFE_LOCATION','HARASSMENT','OTHER'].map(x=><Button key={x} label={x.replace(/_/g,' ')} outline={form.incidentType!==x} onPress={()=>setField('incidentType',x)}/>)}</View>
        {field('incidentSummary','Short summary')}
        {field('incidentDetails','Incident details','','default',true)}
        {field('incidentLocation','Where did it happen?')}
        <Button label="Submit incident for investigation" onPress={()=>void run(async()=>{
          const created=await api.createIncident({type:form.incidentType||'OTHER',summary:form.incidentSummary||'',details:form.incidentDetails||'',location_text:form.incidentLocation||''});
          setField('incidentId',created.id);const r=await api.incidents();setIncidents(r.incidents);
        },'Incident submitted. Investigation is controlled by authorized DeeToo staff.')}/>
      </View></Panel>
      <Panel title="Your incident reports">
        {incidents.length===0?<Notice title="No reports" body="Your safety history will appear here." tone="blue"/>:incidents.map(i=><Pressable key={i.id} onPress={()=>setField('incidentId',i.id)} style={{paddingVertical:10,borderBottomWidth:1,borderColor:C.border}}>
          <Row title={i.type} value={i.status}/><Text style={S.sub}>{i.summary}</Text></Pressable>)}
        {form.incidentId?<Button outline label="Add camera evidence to selected incident" onPress={()=>void startCamera({kind:'incident',ref:form.incidentId})}/>:null}
      </Panel>
    </Page>;break;
    case 24:body=<Page title="Rider Profile & Settings" subtitle="Screen 24 • Protected account controls and persisted preferences">
      <Panel title="Verified account">
        <Row title="Name" value={[status?.profile?.firstName,status?.profile?.lastName].filter(Boolean).join(' ')||'—'}/>
        <Row title="Onboarding" value={status?.profile?.onboardingStatus||'—'}/>
        <Row title="Vehicle" value={status?.vehicle?.type||'—'}/>
        <Row title="Service zone" value={entries(status?.assignedZones).length+' zones'}/>
      </Panel>
      <Panel title="Submit a change for review">
        <View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{['PERSONAL','VEHICLE','PAYOUT_DESTINATION','ACCOUNT_DEACTIVATION','ACCOUNT_DELETION'].map(x=><Button key={x} outline={form.changeCategory!==x} label={x.replace(/_/g,' ')} onPress={()=>setField('changeCategory',x)}/>)}</View>
        {field('changeDescription','Describe your requested change','','default',true)}
        <Button label="Submit request to authorized Admin" onPress={()=>void run(()=>api.changeRequest((form.changeCategory||'PERSONAL') as any,form.changeDescription||''),'Change submitted for administrator review. The profile was not modified.')}/>
      </Panel>
      {prefs?<Panel title="App preferences">
        {['payouts','support','promotions','updates','sounds','vibration'].map(k=><Pressable key={k} accessibilityRole="switch" accessibilityState={{checked:!!prefs[k]}} onPress={()=>setPrefs((p:any)=>({...p,[k]:!p[k]}))} style={[S.split,{minHeight:48,borderBottomWidth:1,borderColor:C.border}]}>
          <Text style={S.text}>{k}</Text><Text style={{fontSize:22,color:C.darkGreen}}>{prefs[k]?'☑':'□'}</Text></Pressable>)}
        <Text style={S.meta}>Essential delivery, security and safety alerts remain mandatory.</Text>
        <Button label="Save preferences" onPress={()=>void run(async()=>{
          const p=await api.updatePreferences({payouts:!!prefs.payouts,support:!!prefs.support,promotions:!!prefs.promotions,updates:!!prefs.updates,sounds:!!prefs.sounds,vibration:!!prefs.vibration,language:prefs.language==='Kiswahili'?'Kiswahili':'English',map_style:prefs.map_style==='Satellite'?'Satellite':'Standard'});
          setPrefs(p);
        },'Preferences securely saved.')}/>
      </Panel>:null}
      <Panel title="Account tools"><Button outline label="Verification & documents" onPress={()=>go(3)}/><View style={{height:7}}/><Button outline label="Performance & ratings" onPress={()=>go(19)}/><View style={{height:7}}/><Button outline label="Contact support" onPress={()=>go(21)}/></Panel>
    </Page>;break;
    default:body=<Notice title="Screen unavailable" body="Return to the five-tab navigation." tone="orange"/>;
  }
  return <PrototypeShell currentScreen={user?'dashboard':'login'} activeTab={user?tab:undefined} onTab={user?applyTab:undefined}
    viewKey={String(view)} right={user?<Pressable accessibilityRole="button" accessibilityLabel="Log out securely" onPress={()=>void logout()} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:'#fff',fontWeight:'800'}}>Log out</Text></Pressable>:undefined}>
    {error?<Notice title="Request could not be completed" body={error} tone="red"/>:null}
    {notice?<Notice title="DeeToo" body={notice} tone="green"/>:null}
    {body}
    {user?<View style={{flexDirection:'row',gap:7,flexWrap:'wrap',marginTop:6}}>
      {view>=3&&view<=5?<Button outline label="Onboarding" onPress={()=>go(5)}/>:null}
      {view>=7&&view<=15?<Button outline label="Delivery history" onPress={()=>go(15)}/>:null}
      <Button outline label="Refresh from DeeToo" onPress={()=>void run(async()=>{await refresh();await extra(view);},'Latest server state loaded.',false)} disabled={busy}/>
    </View>:null}
  </PrototypeShell>;
}
