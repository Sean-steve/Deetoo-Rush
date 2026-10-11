import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, C, Notice, Panel, S, Tag } from './ui';
import { validKenyanPhone } from './phase1-model';
import {
  type NotificationPreferences, type ProfileAction, type ProfileSection,
  type RiderPreviewProfile,
} from './phase4-model';

type Props = {
  profile: RiderPreviewProfile;
  dispatch: React.Dispatch<ProfileAction>;
  prefs: NotificationPreferences;
  setPref: (key: keyof NotificationPreferences, next: boolean) => void;
  cashOutstanding: number;
  hasActiveDelivery: boolean;
  openSafety: () => void;
  openPerformance: () => void;
  openSupport: () => void;
  openNotifications: () => void;
};
const sections: { key: ProfileSection; title: string; subtitle: string; icon: string }[] = [
  { key: 'personal', title: 'Personal Information', subtitle: 'Personal and emergency contact details', icon: '♙' },
  { key: 'vehicle', title: 'Vehicle Details', subtitle: 'Registered transport and equipment', icon: '🛵' },
  { key: 'documents', title: 'Documents', subtitle: 'Verification and expiry tracking', icon: '▤' },
  { key: 'payout', title: 'Payout Settings', subtitle: 'M-PESA destination and settlements', icon: '▣' },
  { key: 'security', title: 'Security & Privacy', subtitle: 'Credentials and device preferences', icon: '♧' },
  { key: 'notifications', title: 'Notification Preferences', subtitle: 'Essential and optional alerts', icon: '♧' },
  { key: 'preferences', title: 'App Preferences', subtitle: 'Language, display and accessibility', icon: '⚙' },
  { key: 'account', title: 'Account Management', subtitle: 'Data access, deactivation and deletion', icon: '⚑' },
];
function Row({ title, detail, onPress, trailing }: { title: string; detail: string; onPress?: () => void; trailing?: React.ReactNode }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress} style={{
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 51,
    flexDirection: 'row', alignItems: 'center', gap: 11,
  }}>
    <View style={{ flex: 1, gap: 4 }}><Text style={[S.text, { fontWeight: '800' }]}>{title}</Text><Text style={S.meta}>{detail}</Text></View>
    {trailing || (onPress ? <Text style={{ color: C.darkGreen, fontSize: 23 }}>›</Text> : null)}
  </Pressable>;
}
function Toggle({ label, checked, onPress, locked }: { label: string; checked: boolean; onPress: () => void; locked?: boolean }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked, disabled: !!locked }} disabled={locked} onPress={onPress}
    style={[S.split, { minHeight: 54, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 }]}>
    <Text style={[S.text, { flex: 1 }]}>{label}{locked ? ' · required' : ''}</Text>
    <View style={{ width: 54, height: 31, backgroundColor: checked ? C.darkGreen : '#AFBAB2', borderRadius: 24, padding: 3, justifyContent: 'center' }}>
      <View style={{ width: 25, height: 25, backgroundColor: '#fff', borderRadius: 18, alignSelf: checked ? 'flex-end' : 'flex-start' }} />
    </View>
  </Pressable>;
}
export function RiderProfileScreen({ profile, dispatch, prefs, setPref, cashOutstanding, hasActiveDelivery, openSafety, openPerformance, openSupport, openNotifications }: Props) {
  const [section, setSection] = useState<ProfileSection>('overview');
  const [editing, setEditing] = useState(false);
  const [personal, setPersonal] = useState({ name: profile.name, email: profile.email, address: profile.address });
  const [vehicle, setVehicle] = useState({ vehicle: profile.vehicle, plate: profile.plate });
  const [phone, setPhone] = useState(profile.payoutPhone);
  const [feedback, setFeedback] = useState('');
  const [requestedAction, setRequestedAction] = useState<'deactivation' | 'deletion' | null>(null);
  const blockers = [
    ...(hasActiveDelivery ? ['An active delivery must be completed or escalated.'] : []),
    ...(cashOutstanding > 0 ? ['Outstanding customer cash requires administrative reconciliation.'] : []),
  ];
  function navigate(next: ProfileSection) { setSection(next); setEditing(false); setFeedback(''); }
  function savePersonal() {
    if (personal.name.trim().length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personal.email.trim())) {
      setFeedback('Enter a valid full name and email address.'); return;
    }
    dispatch({ type: 'EDIT_PERSONAL', ...personal }); setEditing(false);
    setFeedback('Mock personal changes saved. Reverification is required before production changes.');
  }
  function saveVehicle() {
    if (!vehicle.vehicle.trim() || !vehicle.plate.trim()) { setFeedback('Enter valid vehicle details.'); return; }
    dispatch({ type: 'EDIT_VEHICLE', ...vehicle }); setEditing(false);
    setFeedback('Vehicle edit staged. Real verified vehicles require administrator review.');
  }
  function savePayout() {
    if (!validKenyanPhone(phone)) { setFeedback('Enter a valid Kenyan M-PESA number.'); return; }
    dispatch({ type: 'EDIT_PAYOUT', phone }); setEditing(false);
    setFeedback('New M-PESA destination staged. Production changes require reverification.');
  }
  function requestAction(kind: 'deactivation' | 'deletion') {
    if (blockers.length) {
      setFeedback('Request cannot proceed: ' + blockers.join(' '));
      return;
    }
    setRequestedAction(kind);
    setFeedback('Confirm ' + kind + ' request below. No real account operation will occur.');
  }
  function confirmAccountAction() {
    if (!requestedAction || blockers.length) return;
    dispatch({ type: requestedAction === 'deactivation' ? 'REQUEST_DEACTIVATION' : 'REQUEST_DELETION' });
    setFeedback('Your ' + requestedAction + ' request was recorded in this mock only. No real account data was changed.');
    setRequestedAction(null);
  }
  return <View style={{ gap: 15 }}>
    <Text style={S.h1}>Rider Profile & Settings</Text>
    <Text style={S.sub}>Screen 24 of 24 · Personal, security and account preferences</Text>
    <View style={[S.card, { alignItems: 'center', gap: 8 }]}>
      <View style={{ width: 92, height: 92, backgroundColor: C.mint, borderRadius: 49, borderWidth: 3, borderColor: C.green, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 40, color: C.darkGreen }}>♙</Text>
      </View>
      <Text style={[S.h1, { textAlign: 'center' }]}>{profile.name}</Text>
      <Text style={S.meta}>Rider ID: #RDR-78432 · Member since Jan 15, 2024</Text>
      <Tag label={profile.accountStatus} tone={profile.accountStatus === 'Verified' ? 'green' : 'orange'} />
    </View>
    <Notice title={profile.accountStatus === 'Verified' ? 'Your demo profile is verified' : 'Reverification needed'}
      body={profile.accountStatus === 'Verified' ? 'Illustrative verification status. All information and dates shown are samples.' : 'Some changes to identity, vehicle or payout information require real DeeToo administrator approval.'}
      tone={profile.accountStatus === 'Verified' ? 'green' : 'orange'} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
      <View style={{ flex: 1, minWidth: 145 }}><Button outline label="Performance & Ratings" onPress={openPerformance} /></View>
      <View style={{ flex: 1, minWidth: 135 }}><Button outline label="Safety & Incidents" onPress={openSafety} /></View>
    </View>
    {section === 'overview' ? <>
      <Panel title="Profile sections">
        {sections.map(item => <Pressable accessibilityRole="button" key={item.key} onPress={() => navigate(item.key)}
          style={[S.row, { gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 61 }]}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 21, color: C.darkGreen }}>{item.icon}</Text></View>
          <View style={{ flex: 1 }}><Text style={[S.text, { fontWeight: '800' }]}>{item.title}</Text><Text style={S.meta}>{item.subtitle}</Text></View>
          <Text style={{ fontSize: 23, color: C.darkGreen }}>›</Text>
        </Pressable>)}
      </Panel>
    </> : <>
      <Button outline label="← Back to Profile" onPress={() => navigate('overview')} />
      <Panel title={sections.find(x => x.key === section)?.title || 'Settings'}>
        {section === 'personal' ? <>
          {editing ? <>
            <Text style={S.label}>Full name</Text><TextInput accessibilityLabel="Full name" style={S.input} value={personal.name} onChangeText={name => setPersonal(v => ({ ...v, name }))} />
            <View style={{ height: 10 }} /><Text style={S.label}>Email</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" style={S.input} value={personal.email} onChangeText={email => setPersonal(v => ({ ...v, email }))} />
            <View style={{ height: 10 }} /><Text style={S.label}>Residential address</Text><TextInput accessibilityLabel="Residential address" style={S.input} value={personal.address} onChangeText={address => setPersonal(v => ({ ...v, address }))} />
            <View style={{ height: 12 }} /><Button label="Stage changes for review" onPress={savePersonal} />
          </> : <>
            <Row title="Full name" detail={profile.name} /><Row title="Phone number" detail={profile.phone} />
            <Row title="Email" detail={profile.email} /><Row title="Address" detail={profile.address} />
            <Row title="Emergency contact" detail={profile.emergencyContact} />
            <View style={{ height: 12 }} /><Button label="Edit personal information" onPress={() => setEditing(true)} />
          </>}
        </> : section === 'vehicle' ? <>
          {editing ? <>
            <Text style={S.label}>Vehicle make/model</Text><TextInput accessibilityLabel="Vehicle make and model" style={S.input} value={vehicle.vehicle} onChangeText={value => setVehicle(v => ({ ...v, vehicle: value }))} />
            <View style={{ height: 10 }} /><Text style={S.label}>Vehicle plate number</Text><TextInput accessibilityLabel="Vehicle plate" style={S.input} value={vehicle.plate} onChangeText={value => setVehicle(v => ({ ...v, plate: value }))} />
            <View style={{ height: 12 }} /><Button label="Stage vehicle edit" onPress={saveVehicle} />
          </> : <>
            <Row title="Transport type" detail="Motorcycle" /><Row title="Make and model" detail={profile.vehicle} /><Row title="Registration number" detail={profile.plate} />
            <Row title="Equipment" detail="Helmet • delivery bag • reflective vest" />
            <View style={{ height: 12 }} /><Button label="Edit vehicle" onPress={() => setEditing(true)} />
          </>}
        </> : section === 'documents' ? <>
          {[['National ID', 'Verified • Expires Dec 31, 2030'], ['Driving licence', 'Verified • Expires Jun 15, 2028'], ['Vehicle insurance', 'Expires Apr 10, 2027'], ['Vehicle logbook', 'Verified']].map(([name, detail]) =>
            <Row key={name} title={name} detail={detail} trailing={<Tag label="On file" />} />)}
          <Notice title="Sensitive documents" body="This preview displays only document labels. Actual uploads, expiry checks and rejection/resubmission require the secure backend integration." tone="blue" />
        </> : section === 'payout' ? <>
          <Row title="Primary payout method" detail="M-PESA · Safaricom (sample only)" /><Row title="Destination phone" detail={profile.payoutPhone} />
          <Row title="Payout schedule" detail="Weekly (illustrative; subject to backend policy)" />
          {editing ? <>
            <View style={{ height: 10 }} /><Text style={S.label}>New M-PESA phone</Text>
            <TextInput accessibilityLabel="New payout phone" keyboardType="phone-pad" style={S.input} value={phone} onChangeText={setPhone} />
            <View style={{ height: 10 }} /><Button label="Stage payout change" onPress={savePayout} />
          </> : <View style={{ marginTop: 12 }}><Button label="Edit payout destination" onPress={() => setEditing(true)} /></View>}
          <Notice title="Verification required" body="A payout destination edit never updates a real DeeToo account and always enters a new-review state." tone="orange" />
        </> : section === 'security' ? <>
          <Row title="Password" detail="Managed by secure DeeToo authentication after integration" />
          <Toggle label="Two-factor authentication (preview preference)" checked={profile.twoFactor} onPress={() => dispatch({ type: 'TOGGLE', key: 'twoFactor' })} />
          <Toggle label="Biometric login (preview preference)" checked={profile.biometric} onPress={() => dispatch({ type: 'TOGGLE', key: 'biometric' })} />
          <Row title="Trusted devices" detail="No live sessions are available in the mock" />
          <Notice title="Mock switches do not weaken real security" body="Actual MFA, password and device revocation are enforced by the authoritative authentication backend." tone="blue" />
        </> : section === 'notifications' ? <>
          {([
            ['delivery', 'Delivery requests', true], ['payouts', 'Payout alerts', false],
            ['account', 'Account security updates', true], ['support', 'Support updates', false],
            ['promotions', 'Promotions and bonuses', false], ['updates', 'Service updates', false],
          ] as const).map(([key, label, locked]) => <Toggle key={key} label={label} locked={locked}
            checked={locked ? true : prefs[key]} onPress={() => setPref(key, !prefs[key])} />)}
          <Toggle label="Safety and emergency alerts" checked locked onPress={() => undefined} />
          <View style={{ height: 11 }} /><Button outline label="Open Notifications Center" onPress={openNotifications} />
        </> : section === 'preferences' ? <>
          <Text style={S.label}>Language</Text>
          <View style={[S.row, { gap: 8 }]}>{(['English', 'Kiswahili'] as const).map(value =>
            <View key={value} style={{ flex: 1 }}><Button outline={profile.language !== value} label={value} onPress={() => dispatch({ type: 'LANGUAGE', value })} /></View>)}</View>
          <View style={{ height: 12 }} /><Text style={S.label}>Map style</Text>
          <View style={[S.row, { gap: 8 }]}>{(['Standard', 'Satellite'] as const).map(value =>
            <View key={value} style={{ flex: 1 }}><Button outline={profile.mapStyle !== value} label={value} onPress={() => dispatch({ type: 'MAP_STYLE', value })} /></View>)}</View>
          <Toggle label="Sound alerts" checked={profile.sounds} onPress={() => dispatch({ type: 'TOGGLE', key: 'sounds' })} />
          <Toggle label="Vibration" checked={profile.vibration} onPress={() => dispatch({ type: 'TOGGLE', key: 'vibration' })} />
          <Toggle label="Dark mode preference" checked={profile.darkMode} onPress={() => dispatch({ type: 'TOGGLE', key: 'darkMode' })} />
          <Notice title="Design preview" body="Appearance and language selectors store mock preferences only. Full theme and translation assets will be implemented separately." tone="blue" />
        </> : <>
          <Row title="Download my data" detail="A real export will require account authentication and an authorized data request." />
          <View style={{ height: 9 }} /><Button outline label="Preview data export request" onPress={() => setFeedback('No personal data export is generated in this frontend-only preview.')} />
          <View style={{ height: 11 }} /><Notice title="Account restrictions apply" body={blockers.length ? blockers.join(' ') : 'No simulated active delivery or cash blockers were detected. Requests will not immediately deactivate or erase data.'} tone="orange" />
          <View style={{ height: 11 }} /><Button outline label="Request account deactivation" onPress={() => requestAction('deactivation')} />
          <View style={{ height: 9 }} /><Button outline label="Request account deletion" onPress={() => requestAction('deletion')} />
          {requestedAction ? <View style={{ gap: 9, marginTop: 13 }}>
            <Notice title="Confirm request" body={'This only records a simulated ' + requestedAction + ' request. No rider account will actually be disabled or deleted.'} tone="red" />
            <Button label={'Confirm demo ' + requestedAction + ' request'} onPress={confirmAccountAction} />
            <Button outline label="Cancel" onPress={() => setRequestedAction(null)} />
          </View> : null}
          {profile.deactivationRequested || profile.deletionRequested ? <Tag label="Account request staged (demo)" tone="orange" /> : null}
        </>}
      </Panel>
    </>}
    {feedback ? <Notice title="Profile status" body={feedback} tone="blue" /> : null}
    <Panel title="Need help?">
      <Text style={S.sub}>Our support workflows keep full conversations available to authorized participants.</Text>
      <View style={{ height: 10 }} /><Button label="Go to Support Center" onPress={openSupport} />
    </Panel>
    <Text style={[S.meta, { textAlign: 'center' }]}>All visible identity and account details are fake preview values.</Text>
  </View>;
}
