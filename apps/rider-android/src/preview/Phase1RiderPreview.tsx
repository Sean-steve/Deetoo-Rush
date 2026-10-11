import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  emptyDocuments, emptyRegistration, emptyVehicle, kes, mockActivity,
  requiresDrivingLicence, validateDocuments, validateRegistration, validateVehicle,
  validIdentity, type MockApplicationStatus, type RiderDocument, type RiderDocuments,
  type RiderRegistration, type RiderScreen, type RiderTab, type RiderVehicle,
  type RiderVehicleType,
} from './phase1-model';
import {
  BottomNav, Brand, Button, C, Field, Header, HeroRider, MapPreview,
  Metric, Notice, OnboardingTracker, Panel, PrototypeShell, S, Tag,
} from './ui';

/**
 * Visual acceptance prototype for approved Rider screens 1–6.
 * Deliberately disconnected from the live Rider API, GPS, M-PESA and identity systems.
 * Access only through EXPO_PUBLIC_RIDER_UI_MODE=mock.
 */
type AuthMode = 'login' | 'otp' | 'recover' | 'reset';
const steps = [
  { name: 'Account created', desc: 'Personal and emergency contact details received' },
  { name: 'Documents', desc: 'Identity evidence staged in this preview' },
  { name: 'Vehicle & equipment', desc: 'Transport and gear information recorded' },
  { name: 'Application review', desc: 'Administrative checks before activation' },
];
const sampleOrders = [
  { id: '#DR-78425', merchant: 'Burger Hub', route: 'Kilimani → Westlands', amount: 450, time: '2:24 PM' },
  { id: '#DR-78424', merchant: 'Java House', route: 'Upper Hill → CBD', amount: 320, time: '1:18 PM' },
  { id: '#DR-78423', merchant: 'Pizza Inn', route: 'Lavington → Kilimani', amount: 380, time: '11:42 AM' },
];

export function Phase1RiderPreview() {
  const [screen, setScreen] = useState<RiderScreen>('login');
  const [tab, setTab] = useState<RiderTab>('Home');
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [registration, setRegistration] = useState<RiderRegistration>(emptyRegistration);
  const [documents, setDocuments] = useState<RiderDocuments>(emptyDocuments);
  const [vehicle, setVehicle] = useState<RiderVehicle>(emptyVehicle);
  const [application, setApplication] = useState<MockApplicationStatus>('draft');
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showMap, setShowMap] = useState(true);
  const [demoOfflineReason, setDemoOfflineReason] = useState<'none' | 'outside_zone' | 'review_pending'>('none');

  const updateReg = (key: keyof RiderRegistration, value: string) => setRegistration(prev => ({ ...prev, [key]: value }));
  const updateVehicle = (patch: Partial<RiderVehicle>) => setVehicle(prev => ({ ...prev, ...patch }));
  const goto = (next: RiderScreen) => { setFeedback(''); setScreen(next); };
  const setError = (value: string) => setFeedback(value);
  const formError = feedback ? <Notice title="Check this step" body={feedback} tone="red" /> : null;
  const displayName = registration.fullName.trim() ? registration.fullName.trim().split(/\s+/)[0] : 'James';
  const appApproved = application === 'approved';

  function beginLogin() {
    if (!validIdentity(identifier)) { setError('Enter a valid Kenyan phone number or email address.'); return; }
    if (password.length < 6) { setError('Enter a password with at least 6 characters.'); return; }
    setBusy(true);
    setFeedback('');
    setTimeout(() => { setBusy(false); setOtp(''); setAuthMode('otp'); }, 450);
  }
  function verifyDemoOtp() {
    if (otp !== '123456') { setError('This preview uses verification code 123456.'); return; }
    setAuthenticated(true);
    setApplication('approved'); // Existing demonstration rider only; never a real approval.
    setOnline(false);
    setTab('Home');
    setAuthMode('login');
    goto('dashboard');
  }
  function finishRecovery() {
    if (otp !== '123456' || newPassword.length < 6) {
      setError('Use the preview code 123456 and a new password of at least 6 characters.'); return;
    }
    setPassword(newPassword);
    setOtp(''); setNewPassword(''); setAuthMode('login');
    setFeedback('Password changed in this device preview only. Sign in to continue.');
  }
  function startRegistration() {
    setRegistration({ ...emptyRegistration });
    setDocuments({ ...emptyDocuments });
    setVehicle({ ...emptyVehicle });
    setApplication('draft'); setAuthenticated(false); setOnline(false);
    goto('registration');
  }
  function nextDocuments() {
    const error = validateRegistration(registration);
    if (error) { setError(error); return; }
    goto('documents');
  }
  function nextVehicle() {
    const error = validateDocuments(documents, vehicle.type);
    if (error) { setError(error); return; }
    goto('vehicle');
  }
  function submitDraft() {
    const validation = validateVehicle(vehicle) || validateDocuments(documents, vehicle.type);
    if (validation) { setError(validation); return; }
    setApplication('submitted');
    goto('status');
  }
  function openDashboard() {
    setAuthenticated(true); setTab('Home'); goto('dashboard');
  }
  function logout() {
    setAuthenticated(false); setOnline(false); setTab('Home');
    setIdentifier(''); setPassword(''); setOtp(''); setAuthMode('login'); goto('login');
  }
  function requestOnlineToggle() {
    if (online) { setOnline(false); setFeedback('You are offline. No new mock orders will be offered.'); return; }
    if (!appApproved) { setError('Your demo rider application must be approved before going online.'); return; }
    if (demoOfflineReason === 'outside_zone') { setError('Unavailable: you are outside the selected demo service zone.'); return; }
    if (demoOfflineReason === 'review_pending') { setError('Unavailable: your account is under review.'); return; }
    setOnline(true); setFeedback('You are online in the preview. This does not transmit GPS or enable live dispatch.');
  }

  const authScreen = (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />
      <View style={{ padding: 19, backgroundColor: C.navy }}><Brand light /></View>
      <View style={{ flex: 1 }}>
        <PrototypeShell currentScreen="login">
          <HeroRider title="Welcome back, Rider" sub="Deliver more. Earn more. Join DeeToo Rush on the road." />
          <Panel>
            {authMode === 'login' ? <>
              <Text style={S.h1}>Sign in</Text>
              <Text style={[S.sub, { marginTop: 4, marginBottom: 19 }]}>Access deliveries, earnings and your rider dashboard.</Text>
              <Field label="Phone number or email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoComplete="username" placeholder="e.g. 0712 345 678" />
              <View style={{ height: 14 }} />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Enter password" autoComplete="password" />
              <View style={[S.split, { marginTop: 10, marginBottom: 20 }]}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember(!remember)} style={[S.row, { minHeight: 44, gap: 9 }]}>
                  <Text style={{ color: C.darkGreen, fontSize: 18 }}>{remember ? '☑' : '□'}</Text><Text style={S.text}>Remember me</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(!showPassword)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: C.darkGreen, fontWeight: '700' }}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              {formError}
              <View style={{ marginTop: feedback ? 12 : 0 }}><Button label={busy ? 'Signing in…' : 'Log In →'} onPress={beginLogin} disabled={busy} /></View>
              <View style={{ alignItems: 'center', paddingTop: 15 }}>
                <Pressable accessibilityRole="button" onPress={() => { setAuthMode('recover'); setFeedback(''); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: C.darkGreen, fontWeight: '800' }}>Forgot password?</Text>
                </Pressable>
              </View>
              <View style={[S.split, { marginTop: 5, padding: 13, backgroundColor: C.mint, borderRadius: 13 }]}>
                <Text style={S.sub}>New to DeeToo Rush?</Text><Pressable accessibilityRole="button" onPress={startRegistration} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: C.darkGreen, fontWeight: '800' }}>Register →</Text></Pressable>
              </View>
            </> : authMode === 'otp' ? <>
              <Text style={S.h1}>Verify sign-in</Text>
              <Text style={[S.sub, { marginBottom: 16 }]}>Enter your 6-digit verification code. No SMS is sent in preview mode.</Text>
              <Notice title="Preview verification code: 123456" body="This is only an interactive prototype—not real OTP authentication." tone="orange" />
              <View style={{ height: 16 }} />
              <Field label="6-digit code" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} placeholder="••••••" />
              <View style={{ height: 14 }} />{formError}
              <Button label="Verify and continue" onPress={verifyDemoOtp} />
              <View style={{ height: 10 }} /><Button outline label="Back to sign in" onPress={() => { setAuthMode('login'); setFeedback(''); }} />
            </> : authMode === 'recover' ? <>
              <Text style={S.h1}>Reset password</Text>
              <Text style={[S.sub, { marginBottom: 16 }]}>Confirm the account you want to recover.</Text>
              <Field label="Phone or email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" placeholder="+254 7…" />
              <View style={{ height: 14 }} />{formError}
              <Button label="Continue" onPress={() => { if (!validIdentity(identifier)) { setError('Enter a valid phone or email.'); return; } setAuthMode('reset'); setFeedback(''); }} />
              <View style={{ height: 10 }} /><Button outline label="Back to sign in" onPress={() => { setAuthMode('login'); setFeedback(''); }} />
            </> : <>
              <Text style={S.h1}>Choose a new password</Text>
              <Notice title="Preview code: 123456" body="Password recovery here never updates your real DeeToo account." tone="orange" />
              <View style={{ height: 14 }} />
              <Field label="Preview recovery code" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} placeholder="6-digit code" />
              <View style={{ height: 14 }} />
              <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 6 characters" />
              <View style={{ height: 14 }} />{formError}<Button label="Reset password" onPress={finishRecovery} />
            </>}
          </Panel>
          <Text style={[S.meta, { textAlign: 'center' }]}>VISUAL PREVIEW • No account or backend changes are made.</Text>
        </PrototypeShell>
      </View>
    </View>
  );

  if (screen === 'login') return authScreen;

  if (screen === 'registration') {
    return <PrototypeShell currentScreen={screen} title="Create your Rider account" subtitle="Get started with DeeToo Rush across Kenya." onBack={() => goto('login')}>
      <HeroRider title="Start your journey" sub="Create a rider profile in a few simple steps." />
      <Panel><OnboardingTracker step={0} /></Panel>
      <Panel title="Personal information">
        <View style={{ gap: 13 }}>
          <Field label="Full name" value={registration.fullName} onChangeText={v => updateReg('fullName', v)} placeholder="As shown on your ID" autoCapitalize="words" />
          <Field label="National ID / identification number" value={registration.nationalId} onChangeText={v => updateReg('nationalId', v)} placeholder="Enter identification number" />
          <Field label="Date of birth" value={registration.dateOfBirth} onChangeText={v => updateReg('dateOfBirth', v)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        </View>
      </Panel>
      <Panel title="Contact information"><View style={{ gap: 13 }}>
        <Field label="Phone number" value={registration.phone} onChangeText={v => updateReg('phone', v)} keyboardType="phone-pad" placeholder="0712 345 678" />
        <Field label="Email (optional)" value={registration.email} onChangeText={v => updateReg('email', v)} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
      </View></Panel>
      <Panel title="Where you live"><View style={{ gap: 13 }}>
        <Field label="County" value={registration.county} onChangeText={v => updateReg('county', v)} placeholder="Nairobi" />
        <Field label="Residential address" value={registration.address} onChangeText={v => updateReg('address', v)} placeholder="Estate, street / landmark" />
      </View></Panel>
      <Panel title="Emergency contact"><View style={{ gap: 13 }}>
        <Field label="Contact name" value={registration.emergencyName} onChangeText={v => updateReg('emergencyName', v)} placeholder="Full name" />
        <Field label="Contact phone" value={registration.emergencyPhone} onChangeText={v => updateReg('emergencyPhone', v)} keyboardType="phone-pad" placeholder="0712 345 678" />
      </View></Panel>
      {formError}
      <Button label="Continue to Documents →" onPress={nextDocuments} />
      <Text style={[S.meta, { textAlign: 'center' }]}>Your input stays in this app preview and is not submitted.</Text>
    </PrototypeShell>;
  }

  if (screen === 'documents') {
    const docRows: RiderDocument[] = ['idFront', 'idBack', 'selfie', 'licence'];
    return <PrototypeShell currentScreen={screen} title="Document Verification" subtitle="Add the documents needed to review your eligibility." onBack={() => goto('registration')}>
      <HeroRider title="Get verified" sub="Your identity and transport documents keep the platform safe." />
      <Panel><OnboardingTracker step={1} /></Panel>
      <Panel title="Required documents">
        <Text style={[S.sub, { marginBottom: 10 }]}>Add simulated uploads below. No real ID or images are stored or sent.</Text>
        {docRows.map((kind, index) => {
          const name = kind === 'idFront' ? 'National ID — front' : kind === 'idBack' ? 'National ID — back' : kind === 'selfie' ? 'Profile photo / selfie' : 'Driving licence';
          const required = kind !== 'licence' || requiresDrivingLicence(vehicle.type);
          return <View key={kind} style={{ paddingVertical: 13, borderTopWidth: index ? 1 : 0, borderTopColor: C.border, gap: 7 }}>
            <View style={[S.split, { gap: 8 }]}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>{name}</Text><Text style={S.meta}>{required ? 'Required' : 'Optional for bicycle riders'} • JPG / PNG / PDF • 5 MB max</Text></View>
              <Tag label={documents[kind] ? 'Staged' : 'Missing'} tone={documents[kind] ? 'green' : 'orange'} />
            </View>
            <Button outline label={documents[kind] ? 'Remove demo file' : 'Add demo file'} onPress={() => {
              setDocuments(prev => ({ ...prev, [kind]: !prev[kind] })); setFeedback('');
            }} icon={documents[kind] ? '×' : '+'} />
          </View>;
        })}
      </Panel>
      <Notice title="Privacy by design" body="Production documents will require a secure upload service. This mock captures neither photos nor real ID files." tone="blue" />
      {formError}
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button outline label="← Back" onPress={() => goto('registration')} /></View><View style={{ flex: 2 }}><Button label="Continue →" onPress={nextVehicle} /></View></View>
    </PrototypeShell>;
  }

  if (screen === 'vehicle') {
    const options: RiderVehicleType[] = ['Motorcycle', 'Bicycle', 'Car / Van'];
    return <PrototypeShell currentScreen={screen} title="Vehicle & Equipment" subtitle="Tell us how you plan to deliver." onBack={() => goto('documents')}>
      <HeroRider title="Ready for the road?" sub="Add your vehicle and the equipment you will use." />
      <Panel><OnboardingTracker step={2} /></Panel>
      <Panel title="1. Vehicle type">
        <View style={{ gap: 9 }}>
          {options.map((type) => <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: vehicle.type === type }} onPress={() => { updateVehicle({ type }); setFeedback(''); }} style={[S.split, { padding: 13, borderWidth: 1.5, borderRadius: 14, borderColor: vehicle.type === type ? C.green : C.border, backgroundColor: vehicle.type === type ? '#EBFBF2' : '#fff' }]}>
            <Text style={{ color: C.ink, fontWeight: '800', fontSize: 15 }}>{type === 'Motorcycle' ? '🛵 ' : type === 'Bicycle' ? '🚲 ' : '🚗 '}{type}</Text>
            <Text style={{ fontWeight: '900', color: C.darkGreen }}>{vehicle.type === type ? '◉' : '◯'}</Text>
          </Pressable>)}
        </View>
      </Panel>
      <Panel title="2. Vehicle details"><View style={{ gap: 12 }}>
        {vehicle.type !== 'Bicycle' ? <Field label="Registration number" value={vehicle.registrationNumber} onChangeText={v => updateVehicle({ registrationNumber: v })} placeholder="e.g. KDG 123A" autoCapitalize="characters" /> : null}
        <Field label="Make / brand" value={vehicle.make} onChangeText={v => updateVehicle({ make: v })} placeholder="e.g. Bajaj" />
        <Field label="Model" value={vehicle.model} onChangeText={v => updateVehicle({ model: v })} placeholder="e.g. Boxer 150" />
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Colour" value={vehicle.colour} onChangeText={v => updateVehicle({ colour: v })} placeholder="e.g. Black" /></View><View style={{ flex: 1 }}><Field label="Year" value={vehicle.year} onChangeText={v => updateVehicle({ year: v })} placeholder="e.g. 2022" keyboardType="numeric" /></View></View>
      </View></Panel>
      {vehicle.type !== 'Bicycle' ? <Panel title="3. Vehicle documents">
        <Text style={[S.sub, { marginBottom: 12 }]}>Simulation only—use real uploads after backend integration.</Text>
        {([{ key: 'logbook', label: 'Logbook / registration certificate' }, { key: 'insurance', label: 'Insurance certificate' }] as const).map(d => <View key={d.key} style={[S.split, { marginBottom: 10, gap: 10 }]}>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.ink }}>{d.label}</Text><Text style={S.meta}>{vehicle[d.key] ? 'Demo file staged' : 'Required'}</Text></View>
          <Pressable accessibilityRole="button" onPress={() => updateVehicle({ [d.key]: !vehicle[d.key] })} style={{ minHeight: 44, minWidth: 85, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: C.mint }}>
            <Text style={{ fontWeight: '800', color: C.darkGreen }}>{vehicle[d.key] ? 'Remove' : 'Add file'}</Text>
          </Pressable>
        </View>)}
      </Panel> : null}
      <Panel title="4. Delivery equipment">
        {([{ key: 'deliveryBag', label: 'Insulated delivery bag' }, { key: 'helmet', label: 'Helmet' }, { key: 'reflectiveVest', label: 'Reflective jacket / vest' }, { key: 'phoneMount', label: 'Phone mount (optional)' }] as const).map(({ key, label }) =>
          <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: vehicle[key] }} onPress={() => updateVehicle({ [key]: !vehicle[key] })} style={[S.split, { minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.border }]}>
            <Text style={S.text}>{label}</Text><Text style={{ fontSize: 22, color: C.darkGreen }}>{vehicle[key] ? '☑' : '□'}</Text>
          </Pressable>)}
      </Panel>
      {formError}
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button outline label="← Back" onPress={() => goto('documents')} /></View><View style={{ flex: 2 }}><Button label="Review & Submit →" onPress={submitDraft} /></View></View>
    </PrototypeShell>;
  }

  if (screen === 'status') {
    const statusLabel: Record<MockApplicationStatus, string> = {
      draft: 'Draft', submitted: 'Application submitted', under_review: 'Under review',
      changes_requested: 'Changes requested', approved: 'Approved (demo)',
    };
    const help = application === 'changes_requested' ? 'A document needs updating before review continues.' :
      application === 'approved' ? 'You are eligible to try the demo dashboard.' :
      'The application has entered the demonstration review queue.';
    return <PrototypeShell currentScreen={screen} title="Onboarding Status" subtitle="Track every step of your rider application." onBack={() => goto('vehicle')}>
      <HeroRider title="Almost there!" sub="Track your verification progress and the next action." />
      <Panel><OnboardingTracker step={3} /></Panel>
      <Notice title={statusLabel[application]} body={help} tone={application === 'changes_requested' ? 'red' : application === 'approved' ? 'green' : 'orange'} />
      <Panel title="Step status">
        {steps.map((step, i) => <View key={step.name} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderBottomWidth: i < 3 ? 1 : 0, borderColor: C.border }}>
          <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: i === 3 ? C.paleOrange : C.mint }}>
            <Text style={{ color: C.darkGreen, fontWeight: '900' }}>{i === 3 ? '◷' : '✓'}</Text>
          </View>
          <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontWeight: '800' }}>{step.name}</Text><Text style={S.meta}>{step.desc}</Text></View>
          <Tag label={i < 3 ? 'Complete' : statusLabel[application]} tone={i === 3 && application !== 'approved' ? 'orange' : 'green'} />
        </View>)}
      </Panel>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <View style={{ flex: 1 }}><Notice title="We will keep you updated" body="Status notifications appear here in the preview." /></View>
        <View style={{ flex: 1 }}><Notice title="Need help?" body="Contact Support is built in Phase 4." tone="blue" /></View>
      </View>
      <Panel title="Visual acceptance controls">
        <Text style={[S.sub, { marginBottom: 12 }]}>Simulate admin decisions to inspect states. These controls cannot approve a real rider.</Text>
        <View style={{ gap: 9 }}>
          <Button outline label="Simulate under review" onPress={() => setApplication('under_review')} />
          <Button outline label="Simulate rejected document" onPress={() => setApplication('changes_requested')} />
          <Button outline label="Simulate approved" onPress={() => setApplication('approved')} />
        </View>
      </Panel>
      {application === 'changes_requested' ? <Button label="Update documents →" onPress={() => goto('documents')} /> : null}
      <Button label="Go to Dashboard →" onPress={openDashboard} />
      <Text style={[S.meta, { textAlign: 'center' }]}>Dashboard availability remains restricted until mock approval.</Text>
    </PrototypeShell>;
  }

  function renderDashboard() {
    return <>
      <View style={S.split}>
        <View style={{ flex: 1 }}><Text style={S.h1}>Good morning, {displayName} 👋</Text><Text style={S.sub}>Your rider command centre</Text></View>
        <Tag label={online ? '● Online' : '● Offline'} tone={online ? 'green' : 'neutral'} />
      </View>
      <View style={[S.card, { gap: 12, backgroundColor: online ? '#E9F9F0' : '#F3F5F4' }]}>
        <View style={S.split}>
          <View style={{ flex: 1 }}>
            <Text style={[S.h2, { color: online ? C.darkGreen : C.ink }]}>{online ? 'Ready to receive orders' : 'You are offline'}</Text>
            <Text style={S.sub}>{online ? 'Demo delivery availability is enabled.' : 'Go online to preview rider availability.'}</Text>
          </View>
          <Pressable accessibilityRole="switch" accessibilityLabel="Rider online status" accessibilityState={{ checked: online }} onPress={requestOnlineToggle} style={{ width: 63, height: 37, borderRadius: 30, backgroundColor: online ? C.darkGreen : '#9BAB9E', justifyContent: 'center', paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: '#fff', height: 29, width: 29, borderRadius: 20, alignSelf: online ? 'flex-end' : 'flex-start' }} />
          </Pressable>
        </View>
        {!appApproved ? <Notice title="Account review required" body="Approval is required before becoming available for orders." tone="orange" /> : null}
        {feedback ? <Notice title={online ? 'Availability updated' : 'Availability message'} body={feedback} tone={online ? 'green' : 'orange'} /> : null}
      </View>
      <View style={{ backgroundColor: C.darkGreen, borderRadius: 20, padding: 20, gap: 8 }}>
        <Text style={{ color: '#E7FFEF', fontSize: 13, fontWeight: '700' }}>Today's earnings · sample data</Text>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 36 }}>{kes(mockActivity.dailyEarnings)}</Text>
        <View style={[S.split, { borderTopWidth: 1, borderTopColor: '#69BD95', paddingTop: 12, gap: 8 }]}>
          {[['5', 'Deliveries'], [kes(mockActivity.averagePerDelivery), 'Average'], [kes(mockActivity.tips), 'Tips']].map(([value, label]) =>
            <View key={label} style={{ flex: 1, gap: 3 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{value}</Text><Text style={{ color: '#E8FBF0', fontSize: 12 }}>{label}</Text></View>)}
        </View>
      </View>
      <Panel title="Weekly progress" action={<Tag label="12 / 20 deliveries" />}>
        <Text style={[S.meta, { marginBottom: 8 }]}>This week • demo statistics</Text>
        <View style={{ backgroundColor: '#E6F3EB', height: 12, borderRadius: 9, overflow: 'hidden' }}><View style={{ width: '60%', backgroundColor: C.green, height: 12, borderRadius: 9 }} /></View>
        <View style={[S.split, { marginTop: 13 }]}>
          <Text style={S.text}>Earned <Text style={{ fontWeight: '900', color: C.darkGreen }}>{kes(mockActivity.weeklyEarnings)}</Text></Text>
          <Text style={S.text}>★ {mockActivity.riderRating} • {mockActivity.completionRate}% completion</Text>
        </View>
      </Panel>
      <Panel title="Current service zone" action={<Tag label="Nairobi" />}>
        {showMap ? <MapPreview /> : <Notice title="Map preview hidden" body="Enable the map to preview service-zone context." tone="blue" />}
        <View style={{ marginTop: 10 }}><Button outline label={showMap ? 'Hide map preview' : 'Show map preview'} onPress={() => setShowMap(!showMap)} /></View>
      </Panel>
      <Panel title="Quick actions">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {([{ title: 'Deliveries', icon: '◈' }, { title: 'Earnings', icon: '▥' }, { title: 'Inbox', icon: '▤' }, { title: 'Profile', icon: '♙' }] as const).map(({ title, icon }) =>
            <Pressable key={title} accessibilityRole="button" onPress={() => setTab(title)} style={{ width: '48%', backgroundColor: C.mint, padding: 13, borderRadius: 13, minHeight: 74, justifyContent: 'center', gap: 5 }}>
              <Text style={{ fontSize: 21, color: C.darkGreen }}>{icon}</Text><Text style={{ fontWeight: '800', color: C.ink }}>{title}</Text>
            </Pressable>)}
        </View>
      </Panel>
      <Panel title="Available orders" action={<Tag label={online ? 'Waiting' : 'Offline'} tone={online ? 'orange' : 'neutral'} />}>
        <Notice title={online ? "You're ready!" : 'Go online to receive requests'} body={online ? 'New mock delivery requests appear in the Phase 2 delivery workflow.' : 'Order assignment is disabled while offline.'} />
      </Panel>
      <Panel title="Recent deliveries">
        {sampleOrders.map((order, i) => <View key={order.id} style={{ flexDirection: 'row', paddingVertical: 11, gap: 10, borderBottomWidth: i < sampleOrders.length - 1 ? 1 : 0, borderColor: C.border, alignItems: 'center' }}>
          <View style={{ width: 41, height: 41, borderRadius: 12, backgroundColor: C.mint, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 22 }}>✓</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontWeight: '800' }}>{order.merchant}</Text><Text style={S.meta}>{order.id} · {order.route} · {order.time}</Text></View>
          <Text style={{ color: C.darkGreen, fontWeight: '900' }}>{kes(order.amount)}</Text>
        </View>)}
      </Panel>
      <Panel title="Preview state controls">
        <Text style={[S.sub, { marginBottom: 12 }]}>Inspect offline, restricted, success and error states with no backend calls.</Text>
        <View style={{ gap: 8 }}>
          <Button outline label="Normal availability" onPress={() => { setDemoOfflineReason('none'); setFeedback(''); }} />
          <Button outline label="Simulate outside service zone" onPress={() => { setDemoOfflineReason('outside_zone'); setOnline(false); setFeedback('Location outside the demo service zone.'); }} />
          <Button outline label="Simulate account restriction" onPress={() => { setDemoOfflineReason('review_pending'); setOnline(false); setFeedback('Account temporarily restricted pending review.'); }} />
          <Button outline label="Review onboarding state" onPress={() => goto('status')} />
        </View>
      </Panel>
    </>;
  }

  if (screen === 'dashboard') {
    return <PrototypeShell currentScreen={screen} activeTab={tab} onTab={setTab} right={<Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={logout} style={{ minHeight: 44, minWidth: 58, justifyContent: 'center', alignItems: 'flex-end' }}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Log out</Text></Pressable>}>
      {tab === 'Home' ? renderDashboard() :
        <View style={{ gap: 16 }}>
          <Text style={S.h1}>{tab}</Text>
          <Notice title={tab + ' • upcoming implementation'} body={
            tab === 'Deliveries' ? 'Screens 7–15 arrive in Phases 2 and 3.' :
            tab === 'Earnings' ? 'Earnings, wallet and payouts arrive in Phase 3.' :
            tab === 'Inbox' ? 'Notifications and support arrive in Phase 4.' :
            'Rider profile, documents, preferences and security arrive in Phase 4.'
          } tone="blue" />
          <Panel title="Navigation preview"><Text style={S.sub}>The five-tab navigation is working. This destination is deliberately not a fake production screen.</Text></Panel>
          <Button label="Back to dashboard" onPress={() => setTab('Home')} />
        </View>}
    </PrototypeShell>;
  }
  return <ActivityIndicator color={C.green} />;
}
