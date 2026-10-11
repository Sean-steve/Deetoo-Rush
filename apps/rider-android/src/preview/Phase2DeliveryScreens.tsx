import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, C, MapPreview, Metric, Notice, Panel, S, Tag } from './ui';
import {
  DEMO_HANDOVER_OTP, DEMO_PICKUP_CODE, demoOrder, deliveryReducer,
  activeDeliveryStatus, canCompleteDelivery, canConfirmPickup,
  validateDeliveryIssue,
  type DeliveryAction, type DeliveryIssueType, type DeliveryScreen,
  type DeliveryState, type ProofMethod,
} from './phase2-model';
import { kes } from './phase1-model';

export { deliveryReducer } from './phase2-model';

export const deliveryScreenDescriptions: { screen: DeliveryScreen; title: string; subtitle: string }[] = [
  { screen: 'incoming', title: '07 · Incoming Request', subtitle: 'A timed offer with clear expected pay.' },
  { screen: 'details', title: '08 · Active Delivery', subtitle: 'Review the order and the assigned route.' },
  { screen: 'merchantRoute', title: '09 · Navigate to Merchant', subtitle: 'Route, ETA and merchant communication.' },
  { screen: 'pickup', title: '10 · Confirm Pickup', subtitle: 'Confirm arrival, order items and pickup code.' },
  { screen: 'customerRoute', title: '11 · Navigate to Customer', subtitle: 'Delivery route and recipient instructions.' },
  { screen: 'handover', title: '12 · Customer Handover', subtitle: 'Verify proof or report a failed handover.' },
];

type Props = {
  state: DeliveryState;
  dispatch: React.Dispatch<DeliveryAction>;
  online: boolean;
  approved: boolean;
  onHome: () => void;
};
type RouteStop = 'merchant' | 'customer' | 'both';

function spacer(height = 11) { return <View style={{ height }} />; }
function actionToastMessage(kind: string) {
  return kind + ' is a visual-only action. No phone call, message, GPS or route request was sent.';
}
function DetailRow({ icon, title, desc, right }: { icon: string; title: string; desc: string; right?: React.ReactNode }) {
  return <View style={[S.row, { minHeight: 63, paddingVertical: 9, gap: 11, borderBottomWidth: 1, borderBottomColor: C.border }]}>
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 21 }}>{icon}</Text>
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{title}</Text>
      <Text style={S.sub}>{desc}</Text>
    </View>
    {right}
  </View>;
}
function RouteMap({ to, heightLabel }: { to: RouteStop; heightLabel?: string }) {
  return <View style={{ position: 'relative' }}>
    <MapPreview />
    <View style={{ position: 'absolute', left: '13%', top: 53, padding: 5, borderRadius: 22, backgroundColor: C.blue, borderColor: '#fff', borderWidth: 3 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>●</Text>
    </View>
    {(to === 'merchant' || to === 'both') ? <View style={{ position: 'absolute', left: '47%', top: 37, backgroundColor: C.darkGreen, borderRadius: 12, padding: 8, borderWidth: 2, borderColor: '#fff' }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>① Burger Hub</Text>
    </View> : null}
    {(to === 'customer' || to === 'both') ? <View style={{ position: 'absolute', right: 7, bottom: 35, backgroundColor: '#C92D36', borderRadius: 12, padding: 9, borderWidth: 2, borderColor: '#fff' }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>⌂ {to === 'both' ? '② ' : ''}Emily</Text>
    </View> : null}
    <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#fff', borderRadius: 10, padding: 7 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.ink }}>{heightLabel || 'Illustrative Nairobi route'}</Text>
    </View>
  </View>;
}
function Progress({ state }: { state: DeliveryState }) {
  const status = state.status;
  const current =
    status === 'delivered' ? 5 :
    status === 'at_customer' ? 4 :
    ['picked_up', 'navigating_customer'].includes(status) ? 3 :
    status === 'at_merchant' ? 2 : 1;
  return <Panel>
    <Text style={[S.label, { marginBottom: 9 }]}>DELIVERY PROGRESS</Text>
    <View style={{ flexDirection: 'row', gap: 2, justifyContent: 'space-between' }}>
      {['Accepted', 'At merchant', 'Picked up', 'At customer', 'Delivered'].map((name, index) => {
        const n = index + 1, done = n < current, active = n === current;
        return <View key={name} style={{ width: '19.5%', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done || active ? C.darkGreen : '#E7EDEA', borderWidth: active ? 2 : 0, borderColor: C.green }}>
            <Text style={{ color: done || active ? '#fff' : C.subtle, fontWeight: '900', fontSize: 12 }}>{done ? '✓' : n}</Text>
          </View>
          <Text style={{ fontWeight: active ? '800' : '500', fontSize: 10, textAlign: 'center', color: active ? C.darkGreen : C.muted }}>{name}</Text>
        </View>;
      })}
    </View>
  </Panel>;
}
function ContactActions({ target, onAction }: { target: 'merchant' | 'customer'; onAction: (title: string) => void }) {
  return <View style={{ flexDirection: 'row', gap: 9 }}>
    <View style={{ flex: 1 }}><Button outline label="Call" icon="☎" onPress={() => onAction('Calling the ' + target)} /></View>
    <View style={{ flex: 1 }}><Button outline label="Message" icon="▤" onPress={() => onAction('Messaging the ' + target)} /></View>
  </View>;
}
function Items({ interactive = false, confirmed = false, onToggle }: { interactive?: boolean; confirmed?: boolean; onToggle?: () => void }) {
  return <Panel title="Order items (3)">
    {demoOrder.items.map((item, index) => <DetailRow key={item.name} icon={item.icon} title={item.quantity + ' × ' + item.name} desc={kes(item.price)} right={index === 0 ? <Tag label="Food" /> : undefined} />)}
    {interactive ? <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} style={[S.row, { minHeight: 57, gap: 12, marginTop: 8 }]}>
      <Text style={{ fontSize: 24, color: C.darkGreen }}>{confirmed ? '☑' : '□'}</Text>
      <View style={{ flex: 1 }}><Text style={[S.text, { fontWeight: '800' }]}>All 3 items match the order</Text><Text style={S.meta}>Check the package with merchant staff.</Text></View>
    </Pressable> : <Text style={[S.meta, { marginTop: 12 }]}>Item prices are customer menu prices, not your rider payout.</Text>}
  </Panel>;
}
const issueTypes: DeliveryIssueType[] = [
  'Merchant delay', 'Missing or damaged items', 'Wrong pickup location',
  'Customer unavailable', 'Incorrect address', 'Vehicle breakdown', 'Other',
];

export function Phase2DeliveryScreens({ state, dispatch, online, approved, onHome }: Props) {
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueType, setIssueType] = useState<DeliveryIssueType | ''>('');
  const [issueText, setIssueText] = useState('');
  const [issueValidation, setIssueValidation] = useState('');
  const [toast, setToast] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [handoverOtp, setHandoverOtp] = useState('');
  const [proofMethod, setProofMethod] = useState<ProofMethod>('otp');
  const [turnByTurn, setTurnByTurn] = useState(false);
  const [showReviewControls, setShowReviewControls] = useState(false);

  useEffect(() => {
    if (!online || state.status !== 'offered') return;
    const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(timer);
  }, [online, state.status, dispatch]);

  function reportIssue() {
    const error = validateDeliveryIssue(issueType, issueText);
    if (error) { setIssueValidation(error); return; }
    dispatch({ type: 'REPORT_ISSUE', issue: issueType as DeliveryIssueType, description: issueText });
    setShowIssueForm(false); setIssueType(''); setIssueText(''); setIssueValidation('');
  }
  function presentIssueForm() {
    setShowIssueForm(true);
    setIssueValidation('');
    if (state.screen === 'pickup') setIssueType('Missing or damaged items');
    if (state.screen === 'handover') setIssueType('Customer unavailable');
  }
  function setScreenPreview(screen: DeliveryScreen) {
    dispatch({ type: 'DEMO_STAGE', screen });
    setShowReviewControls(false); setToast(''); setShowIssueForm(false);
    setPickupCode(''); setHandoverOtp(''); setProofMethod('otp');
  }

  const issuePanel = showIssueForm ? <Panel title="Report a delivery problem">
    <Notice title="Rider cannot close an incident" body="This creates a local demo report only. Dispatch/support would review an actual report." tone="orange" />
    {spacer(12)}
    <Text style={S.label}>Issue category</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
      {issueTypes.map(type => <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: issueType === type }} onPress={() => { setIssueType(type); setIssueValidation(''); }} style={{ borderRadius: 12, borderWidth: 1, borderColor: issueType === type ? C.darkGreen : C.border, backgroundColor: issueType === type ? C.mint : '#fff', paddingHorizontal: 11, paddingVertical: 11, minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>{type}</Text>
      </Pressable>)}
    </View>
    <Text style={S.label}>What happened?</Text>
    <TextInput accessibilityLabel="Describe delivery problem" multiline value={issueText} onChangeText={setIssueText} placeholder="Describe the issue clearly…" placeholderTextColor={C.subtle}
      style={[S.input, { minHeight: 100, textAlignVertical: 'top', paddingTop: 13 }]} />
    {issueValidation ? <Text style={{ color: C.red, paddingTop: 9 }}>{issueValidation}</Text> : null}
    {spacer(12)}<View style={{ flexDirection: 'row', gap: 9 }}>
      <View style={{ flex: 1 }}><Button outline label="Cancel" onPress={() => setShowIssueForm(false)} /></View>
      <View style={{ flex: 2 }}><Button label="Submit demo report" onPress={reportIssue} /></View>
    </View>
  </Panel> : null;
  const issueStatus = state.issue ? <Notice title={'Incident reported: ' + state.issue.type} body={'Awaiting support/dispatch review. ' + state.issue.description} tone="orange" /> : null;
  const info = state.info ? <Notice title="Delivery status" body={state.info} tone={state.status === 'delivered' ? 'green' : 'orange'} /> : null;
  const toastInfo = toast ? <Notice title="Preview only" body={toast} tone="blue" /> : null;
  const active = activeDeliveryStatus(state.status);

  let content: React.ReactNode;
  if (state.status === 'idle' || state.status === 'declined' || state.status === 'expired') {
    content = <>
      <Text style={S.h1}>Incoming delivery requests</Text>
      <Text style={S.sub}>An interactive demo of DeeToo's offer and dispatch experience.</Text>
      <RouteMap to="both" />
      <Notice title={state.status === 'expired' ? 'Request expired' : state.status === 'declined' ? 'Request declined' : online ? 'Ready for an offer' : 'You are offline'} body={
        !approved ? 'Approval is required before accepting deliveries.' :
        !online ? 'Switch on availability from Home to enable mock offers.' :
        'Tap the button to simulate a timed delivery offer.'
      } tone={online && approved ? 'green' : 'orange'} />
      {info}
      <Button label="Simulate new delivery request" icon="↗" disabled={!approved || !online} onPress={() => dispatch({ type: 'NEW_OFFER' })} />
      <Button outline label="Back to Home" onPress={onHome} />
    </>;
  } else if (state.status === 'offered') {
    content = <>
      <View style={S.split}><View style={{ flex: 1 }}><Text style={S.h1}>New Delivery Request</Text><Text style={S.sub}>Accept the offer before the countdown ends</Text></View>
        <View accessibilityLabel={state.offerSeconds + ' seconds remaining'} style={{ width: 76, height: 76, borderRadius: 42, backgroundColor: C.mint, borderWidth: 5, borderColor: state.offerSeconds <= 7 ? C.orange : C.green, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24, color: C.darkGreen, fontWeight: '900' }}>{state.offerSeconds}</Text><Text style={S.meta}>seconds</Text>
        </View>
      </View>
      <RouteMap to="both" heightLabel="Pickup → Drop-off" />
      <View style={{ flexDirection: 'row', gap: 8 }}><Metric title="Estimated rider pay" value={kes(demoOrder.riderPayoutEstimate)} /><Metric title="Total route" value="6.0 km" tone="blue" /></View>
      <Panel title="Pickup and drop-off">
        <DetailRow icon="🏪" title={demoOrder.merchant} desc={demoOrder.branch + ' • ' + demoOrder.pickupDistanceKm + ' km'} />
        <DetailRow icon="⌂" title={demoOrder.customer} desc={demoOrder.customerAddress + ' • ' + demoOrder.customerDistanceKm + ' km'} />
        <Text style={[S.meta, { marginTop: 11 }]}>Estimated duration: {demoOrder.pickupEtaMinutes + demoOrder.customerEtaMinutes} min • 3 food items • No special handling</Text>
      </Panel>
      <Panel title="Delivery notes"><Text style={S.sub}>{demoOrder.customerNote}</Text></Panel>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <View style={{ flex: 1 }}><Button outline label="Decline" onPress={() => dispatch({ type: 'DECLINE' })} /></View>
        <View style={{ flex: 2 }}><Button label="✓ Accept Order" disabled={!online || !approved} onPress={() => dispatch({ type: 'ACCEPT' })} /></View>
      </View>
      <Text style={[S.meta, { textAlign: 'center' }]}>Estimated pay is sample data; real dispatch and payments are not connected.</Text>
    </>;
  } else if (state.status === 'delivered') {
    content = <>
      <Progress state={state} />
      <Notice title="Delivery completed!" body="The rider-to-customer handover was verified using demo proof. No real order or payment was changed." />
      <Panel title={demoOrder.id + ' • Completion record'}>
        <DetailRow icon="✓" title={demoOrder.customer} desc={demoOrder.customerAddress} />
        <DetailRow icon="▣" title="Estimated rider earnings" desc={kes(demoOrder.riderPayoutEstimate) + ' • Sample only'} />
      </Panel>
      <Notice title="Screen 13 comes next" body="The detailed delivery completion summary, final authoritative earnings and next order actions will be designed in Phase 3." tone="blue" />
      <Button label="Try another offer" onPress={() => dispatch({ type: 'NEW_OFFER' })} disabled={!online} />
      <Button outline label="Back to Home" onPress={onHome} />
    </>;
  } else {
    const current = state.screen;
    content = <>
      <Text style={S.h1}>{deliveryScreenDescriptions.find(x => x.screen === current)?.title.slice(5)}</Text>
      <Text style={S.sub}>Order {demoOrder.id} • Food delivery • Demonstration</Text>
      <Progress state={state} />
      {current === 'details' ? <>
        <RouteMap to="both" />
        <Notice title="Head to Burger Hub" body="Your delivery has been accepted. Start with the merchant pickup location." />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Metric title="Expected rider pay" value={kes(demoOrder.riderPayoutEstimate)} />
          <Metric title="Total distance" value="6.0 km" tone="blue" />
        </View>
        <Panel title="Pickup → Delivery">
          <DetailRow icon="🏪" title={demoOrder.merchant} desc={demoOrder.branch + ' • 5 min'} />
          <DetailRow icon="⌂" title={demoOrder.customer} desc={demoOrder.customerAddress + ' • 23 min'} />
        </Panel>
        <Items />
        <Panel title="Merchant contact"><ContactActions target="merchant" onAction={title => setToast(actionToastMessage(title))} /></Panel>
        <Panel title="Customer instructions"><Text style={S.sub}>{demoOrder.customerNote}</Text></Panel>
        <Button label="Navigate to Merchant →" icon="➤" onPress={() => dispatch({ type: 'GO_TO_MERCHANT' })} />
      </> : current === 'merchantRoute' ? <>
        <Notice title="Navigate to merchant" body="Your route is ready. Confirm arrival only once you reach the merchant." />
        <RouteMap to="merchant" heightLabel="To Burger Hub • 1.2 km • 5 min" />
        <View style={{ flexDirection: 'row', gap: 8 }}><Metric title="Pickup distance" value="1.2 km" /><Metric title="Estimated time" value="5 min" tone="blue" /></View>
        <Panel title="Turn-by-turn guidance">
          <DetailRow icon="➤" title="Continue toward Westlands" desc="650 m • Main road" />
          <DetailRow icon="↱" title="Turn toward Sarit Centre" desc="400 m • Westlands" />
          <DetailRow icon="🏪" title="Arrive at Burger Hub" desc="Shop LG-12, Sarit Centre" />
          <Button outline label={turnByTurn ? 'Hide route details' : 'Show route details'} onPress={() => setTurnByTurn(v => !v)} />
          {turnByTurn ? <Notice title="Navigation demonstration" body="This is a static route preview, not live positioning, spoken navigation or traffic routing." tone="blue" /> : null}
        </Panel>
        <Panel title="Burger Hub"><Text style={S.h2}>{demoOrder.merchant}</Text><Text style={S.sub}>{demoOrder.branch}</Text>{spacer(11)}<ContactActions target="merchant" onAction={title => setToast(actionToastMessage(title))} /></Panel>
        <Button label="I'm at the Merchant →" onPress={() => dispatch({ type: 'ARRIVE_MERCHANT' })} />
        <Button outline label="View Order Details" onPress={() => dispatch({ type: 'VIEW_DETAILS' })} />
      </> : current === 'pickup' ? <>
        <Notice title="Arrived at Merchant" body="Check items and verify the collection reference with the merchant before leaving." />
        <Panel title="Burger Hub • Pickup">
          <DetailRow icon="🏪" title="Burger Hub" desc={demoOrder.branch} />
          <DetailRow icon="◷" title="Pickup status" desc="Waiting for merchant handover" right={<Tag label="Pending" tone="orange" />} />
          <ContactActions target="merchant" onAction={title => setToast(actionToastMessage(title))} />
        </Panel>
        <Items interactive confirmed={state.itemCountConfirmed} onToggle={() => dispatch({ type: 'SET_ITEMS_CONFIRMED', value: !state.itemCountConfirmed })} />
        <Panel title="Verify pickup reference">
          <Text style={[S.sub, { marginBottom: 11 }]}>Ask the merchant to confirm the order reference. Preview code: {DEMO_PICKUP_CODE}.</Text>
          <TextInput accessibilityLabel="Pickup code" keyboardType="number-pad" maxLength={4} value={pickupCode} onChangeText={setPickupCode} placeholder="4-digit pickup code" placeholderTextColor={C.subtle} style={S.input} />
          {spacer(10)}
          <Button outline label={state.pickupCodeVerified ? '✓ Verified' : 'Verify pickup code'} onPress={() => dispatch({ type: 'VERIFY_PICKUP_CODE', code: pickupCode })} />
        </Panel>
        <Notice title="Order evidence" body="A packaged-order photo is optional in this visual mock. Real media capture and storage are not enabled." tone="blue" />
        <Button label="Confirm Pickup & Continue" disabled={!canConfirmPickup(state)} onPress={() => dispatch({ type: 'CONFIRM_PICKUP' })} />
      </> : current === 'customerRoute' ? <>
        <Notice title="Order picked up" body="Travel to the customer using the route and delivery instructions below." />
        <RouteMap to="customer" heightLabel="To Emily Wanjiru • 4.8 km • 23 min" />
        <View style={{ flexDirection: 'row', gap: 8 }}><Metric title="Customer distance" value="4.8 km" /><Metric title="Estimated time" value="23 min" tone="blue" /></View>
        <Panel title="Route directions">
          <DetailRow icon="➤" title="Continue toward Upper Hill" desc="2.0 km • Nairobi" />
          <DetailRow icon="↱" title="Turn right onto Lenana Road" desc="300 m to destination" />
          <DetailRow icon="⌂" title="Sunset Apartments" desc={demoOrder.destination} />
          <Button outline label={turnByTurn ? 'Collapse directions' : 'Expanded route instructions'} onPress={() => setTurnByTurn(v => !v)} />
          {turnByTurn ? <Notice title="No live navigation in mock mode" body="Actual turn-by-turn updates will come from DeeToo routing/location integrations in the backend phase." tone="blue" /> : null}
        </Panel>
        <Panel title="Customer contact">
          <Text style={S.h2}>{demoOrder.customer}</Text><Text style={S.sub}>{demoOrder.customerAddress}</Text>
          {spacer(11)}<ContactActions target="customer" onAction={title => setToast(actionToastMessage(title))} />
        </Panel>
        <Panel title="Delivery instructions"><Text style={S.text}>{demoOrder.customerNote}</Text></Panel>
        <Button label="Slide simulation: Arrived at Customer →" onPress={() => dispatch({ type: 'ARRIVE_CUSTOMER' })} />
      </> : <>
        <Notice title="Arrived at Customer" body="Confirm customer handover with an authorized proof before marking delivered." />
        <Panel title="Recipient">
          <DetailRow icon="⌂" title={demoOrder.customer} desc={demoOrder.customerAddress} />
          <Text style={S.sub}>{demoOrder.destination}</Text>
          {spacer(11)}<ContactActions target="customer" onAction={title => setToast(actionToastMessage(title))} />
        </Panel>
        <RouteMap to="customer" heightLabel="At Sunset Apartments • demo arrival" />
        <Panel title="Delivery instructions"><Text style={S.text}>{demoOrder.customerNote}</Text></Panel>
        <Panel title="Confirm delivery">
          <Text style={[S.sub, { marginBottom: 10 }]}>Choose a demonstration proof-of-delivery method:</Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {(['otp', 'photo'] as const).map(method =>
              <View key={method} style={{ flex: 1 }}><Button outline={proofMethod !== method} label={method === 'otp' ? 'Customer PIN' : 'Photo proof'} onPress={() => setProofMethod(method)} /></View>)}
          </View>
          {spacer(15)}
          {proofMethod === 'otp' ? <>
            <Text style={S.label}>Customer delivery PIN</Text>
            <Text style={[S.meta, { marginBottom: 9 }]}>Demo PIN: {DEMO_HANDOVER_OTP}. No SMS is sent.</Text>
            <TextInput accessibilityLabel="Customer handover PIN" keyboardType="number-pad" maxLength={6} value={handoverOtp} onChangeText={setHandoverOtp} placeholder="Enter six-digit PIN" placeholderTextColor={C.subtle} style={S.input} />
          </> : <>
            <Notice title={state.photoStaged ? 'Demo proof staged' : 'No proof staged'} body="Staging toggles a sample proof indicator only. No actual camera image is captured." tone="blue" />
            {spacer(9)}
            <Button outline label={state.photoStaged ? 'Remove demo photo' : 'Stage a demo proof photo'} onPress={() => dispatch({ type: 'STAGE_DELIVERY_PHOTO', staged: !state.photoStaged })} />
          </>}
        </Panel>
        <Button label="✓ Verify and Mark Delivered" disabled={!canCompleteDelivery(state, proofMethod, handoverOtp) || !!state.issue}
          onPress={() => dispatch({ type: 'COMPLETE_DELIVERY', method: proofMethod, otp: handoverOtp })} />
        <Text style={S.meta}>Delivery cannot be completed while an unresolved issue is attached.</Text>
      </>}
      {active ? <View style={{ flexDirection: 'row', gap: 9 }}>
        <View style={{ flex: 1 }}><Button outline label="Report an issue" onPress={presentIssueForm} /></View>
        <View style={{ flex: 1 }}><Button outline label="Contact Support" onPress={() => setToast('Support screens are in Phase 4. Your mock issue stays attached to this delivery.')} /></View>
      </View> : null}
      {issuePanel}{issueStatus}{info}{toastInfo}
    </>;
  }

  return <View style={{ gap: 15, paddingBottom: 16 }}>
    {content}
    {!active && state.status !== 'offered' && !['idle', 'declined', 'expired', 'delivered'].includes(state.status) ? issuePanel : null}
    <Pressable accessibilityRole="button" onPress={() => setShowReviewControls(v => !v)} style={{ minHeight: 46, borderRadius: 12, backgroundColor: '#E8F1EB', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '800', fontSize: 13, color: C.darkGreen }}>{showReviewControls ? 'Hide' : 'Show'} visual acceptance shortcuts ▾</Text>
    </Pressable>
    {showReviewControls ? <Panel title="Screen 7–12 preview presets">
      <Notice title="For design review only" body="Presets set locally simulated milestones so every approved screen can be inspected independently." tone="blue" />
      {spacer(8)}
      {deliveryScreenDescriptions.map(({ screen, title, subtitle }) => <Pressable key={screen} accessibilityRole="button" onPress={() => setScreenPreview(screen)}
        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 53 }}>
        <Text style={{ fontWeight: '800', color: C.ink }}>{title}</Text><Text style={S.meta}>{subtitle}</Text>
      </Pressable>)}
      {spacer(10)}<Button outline label="Reset delivery demo" onPress={() => { dispatch({ type: 'RESET' }); setShowReviewControls(false); setToast(''); }} />
    </Panel> : null}
  </View>;
}
