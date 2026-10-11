import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, C, MapPreview, Metric, Notice, Panel, S, Tag } from './ui';
import {
  type IncidentType, type SafetyAction, type SafetyState,
  validateIncident,
} from './phase4-model';

const issueTypes: { value: IncidentType; icon: string; description: string }[] = [
  { value: 'Accident', icon: '⚠', description: 'Vehicle incident, injury or collision' },
  { value: 'Vehicle breakdown', icon: '🛵', description: 'Mechanical breakdown or equipment failure' },
  { value: 'Unsafe location', icon: '⚑', description: 'Unsafe area or location concern' },
  { value: 'Harassment', icon: '▣', description: 'Threat, harassment or violence' },
  { value: 'Other', icon: '•••', description: 'Other safety or operational incident' },
];
type Step = 1 | 2 | 3 | 4;
export function RiderSafetyScreen({ state, dispatch, openSupport }: {
  state: SafetyState; dispatch: React.Dispatch<SafetyAction>; openSupport: () => void;
}) {
  const [showEmergency, setShowEmergency] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [issueType, setIssueType] = useState<IncidentType | ''>('Accident');
  const [occurred, setOccurred] = useState('2026-10-11 16:00');
  const [location, setLocation] = useState('Westlands, Nairobi');
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [linkedOrder, setLinkedOrder] = useState('');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>('INC-78432');
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const selected = state.incidents.find(i => i.id === selectedId);
  function resetForm() { setStep(1); setError(''); setEvidence([]); setDetails(''); setLinkedOrder(''); }
  function begin(type?: IncidentType) { if (type) setIssueType(type); resetForm(); setShowReport(true); }
  function next() {
    setError('');
    if (step === 1 && (issueType === '' || details.trim().length < 15)) { setError('Select an issue and explain what happened (at least 15 characters).'); return; }
    if (step === 2 && location.trim().length < 3) { setError('Enter your current location or a nearby landmark.'); return; }
    if (step < 4) setStep((step + 1) as Step);
  }
  function submit() {
    const invalid = validateIncident(issueType, details, location);
    if (invalid) { setError(invalid); return; }
    dispatch({ type: 'REPORT', issueType: issueType as IncidentType, details: details + ' • Approx. time: ' + occurred, location, evidence, orderId: linkedOrder || undefined });
    setShowReport(false); resetForm(); setSelectedId(null);
  }
  return <View style={{ gap: 15 }}>
    <View style={S.split}><View style={{ flex: 1 }}><Text style={S.h1}>Safety & Incidents</Text><Text style={S.sub}>Screen 23 of 24 · Report incidents and track case progress</Text></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Emergency assistance information" onPress={() => setShowEmergency(v => !v)}
      style={{ borderWidth: 1, borderColor: '#FFB0AB', backgroundColor: C.paleRed, borderRadius: 17, padding: 16, minHeight: 66 }}>
      <Text style={{ color: C.red, fontWeight: '900', fontSize: 18 }}>☎ Emergency Assistance ›</Text>
      <Text style={[S.sub, { marginTop: 4 }]}>Urgent help and safety instructions · no call initiated</Text>
    </Pressable>
    {showEmergency ? <Panel title="In an emergency">
      <Notice title="Get immediate real-world help" body="Move to safety if possible. Contact your local emergency services directly using your phone dialer. This preview does not call, alert or dispatch help." tone="red" />
      <View style={{ height: 10 }} />
      <Text style={S.sub}>In Kenya, confirm the appropriate national or local emergency number on your device. You may also contact local police, ambulance or a trusted emergency contact.</Text>
      <View style={{ height: 11 }} /><Button outline label="Open support information" onPress={openSupport} />
    </Panel> : null}
    <Panel title="Report a safety incident">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {issueTypes.map(item => <Pressable key={item.value} accessibilityRole="button" onPress={() => begin(item.value)}
          style={{ width: '47%', minHeight: 117, backgroundColor: '#F4F9F6', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, gap: 5 }}>
          <Text style={{ fontSize: 24 }}>{item.icon}</Text>
          <Text style={{ color: C.ink, fontWeight: '800' }}>{item.value}</Text>
          <Text style={S.meta}>{item.description}</Text>
        </Pressable>)}
      </View>
    </Panel>
    {showReport ? <Panel title="New incident report">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 15 }}>
        {['Details', 'Location', 'Evidence', 'Review'].map((label, index) => <View key={label} style={{ alignItems: 'center', width: '24%', gap: 5 }}>
          <View style={{ height: 30, width: 30, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: step >= index + 1 ? C.darkGreen : '#E6EEE9' }}>
            <Text style={{ color: step >= index + 1 ? '#fff' : C.subtle, fontWeight: '800' }}>{step > index + 1 ? '✓' : index + 1}</Text>
          </View><Text style={[S.meta, { textAlign: 'center' }]}>{label}</Text>
        </View>)}
      </View>
      {step === 1 ? <>
        <Text style={S.label}>Incident type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {issueTypes.map(x => <Pressable key={x.value} accessibilityRole="radio" accessibilityState={{ checked: issueType === x.value }}
            onPress={() => setIssueType(x.value)} style={{ padding: 10, minHeight: 44, borderRadius: 11, backgroundColor: issueType === x.value ? C.mint : '#F3F7F4', borderWidth: 1, borderColor: issueType === x.value ? C.green : C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.ink }}>{x.value}</Text>
          </Pressable>)}
        </View>
        <View style={{ height: 13 }} />
        <Text style={S.label}>When did this happen?</Text>
        <TextInput accessibilityLabel="Incident date and time" style={S.input} value={occurred} onChangeText={setOccurred} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={C.subtle} />
        <View style={{ height: 13 }} />
        <Text style={S.label}>Describe what happened *</Text>
        <TextInput accessibilityLabel="Incident description" style={[S.input, { minHeight: 110, textAlignVertical: 'top' }]} multiline value={details} onChangeText={setDetails} placeholder="Explain the situation clearly…" placeholderTextColor={C.subtle} />
        <Text style={S.meta}>{details.length} characters</Text>
      </> : step === 2 ? <>
        <Text style={S.label}>Where did this happen? *</Text>
        <TextInput accessibilityLabel="Incident location" style={S.input} value={location} onChangeText={setLocation} placeholder="Nearest landmark / address" placeholderTextColor={C.subtle} />
        <View style={{ height: 10 }} /><MapPreview />
        <Notice title="Illustrative location only" body="The displayed map is a sample. Location is entered manually; no real GPS capture or background tracking is started." tone="blue" />
        <View style={{ height: 13 }} />
        <Text style={S.label}>Related delivery (optional)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {['', '#DR-78425', '#DR-78424', '#DR-78423'].map(id => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: linkedOrder === id }} onPress={() => setLinkedOrder(id)}
            style={{ padding: 10, borderRadius: 10, backgroundColor: linkedOrder === id ? C.mint : '#EEF3F0', minHeight: 44 }}>
            <Text style={[S.meta, { color: C.darkGreen, fontWeight: '800' }]}>{id || 'None'}</Text>
          </Pressable>)}
        </View>
      </> : step === 3 ? <>
        <Text style={S.sub}>Photos, videos and documents can later be uploaded securely. To review this design, stage sample filenames locally.</Text>
        <View style={{ height: 12 }} />
        <Button outline label={evidence.length ? 'Remove demo evidence' : '＋ Stage demo evidence'} onPress={() => setEvidence(evidence.length ? [] : ['demo-incident-photo.jpg'])} />
        {evidence.map(e => <Text key={e} style={[S.meta, { marginTop: 9 }]}>▣ {e} • sample only, no file captured</Text>)}
        <Notice title="Personal safety first" body="Do not take photos or gather evidence when doing so would put you in danger. Evidence is optional." tone="orange" />
      </> : <>
        <Text style={[S.h2, { marginBottom: 12 }]}>Review your report</Text>
        {[['Type', issueType], ['Date/time', occurred], ['Location', location], ['Linked order', linkedOrder || 'None'], ['Evidence', evidence.length ? '1 demo file staged' : 'No attachment'], ['Description', details]].map(([key, value]) =>
          <View key={key} style={{ borderBottomWidth: 1, borderColor: C.border, paddingVertical: 9 }}>
            <Text style={S.meta}>{key}</Text><Text style={S.text}>{value}</Text>
          </View>)}
        <View style={{ height: 11 }} />
        <Notice title="Not a real safety report" body="Submitting this demonstration will store a mock incident only in the preview. For immediate danger, contact local emergency services directly." tone="red" />
      </>}
      {error ? <View style={{ marginTop: 11 }}><Notice title="Check your report" body={error} tone="red" /></View> : null}
      <View style={{ height: 14 }} />
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <View style={{ flex: 1 }}><Button outline label={step === 1 ? 'Cancel' : '← Back'} onPress={() => { setError(''); if (step === 1) { setShowReport(false); resetForm(); } else setStep((step - 1) as Step); }} /></View>
        <View style={{ flex: 2 }}><Button label={step === 4 ? 'Submit Demo Report' : 'Next →'} onPress={step === 4 ? submit : next} /></View>
      </View>
    </Panel> : null}
    {state.info ? <Notice title="Safety report status" body={state.info} tone="blue" /> : null}
    <Panel title="My recent reports">
      {state.incidents.map(incident => <View key={incident.id} style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 11 }}>
        <Pressable accessibilityRole="button" onPress={() => setSelectedId(selectedId === incident.id ? null : incident.id)} style={[S.split, { gap: 9, minHeight: 48 }]}>
          <View style={{ flex: 1, gap: 4 }}><Text style={[S.text, { fontWeight: '800' }]}>{incident.type}</Text><Text style={S.meta}>{incident.id} · {incident.location}</Text><Text style={S.meta}>{incident.time}</Text></View>
          <Tag label={incident.status} tone={incident.status === 'Resolved' ? 'green' : incident.status === 'Investigating' ? 'orange' : 'neutral'} />
        </Pressable>
      </View>)}
    </Panel>
    {selected ? <Panel title="Incident details & investigation">
      <View style={[S.split, { gap: 10 }]}><Text style={[S.h2, { flex: 1 }]}>{selected.type}</Text><Tag label={selected.status} tone={selected.status === 'Resolved' ? 'green' : 'orange'} /></View>
      <Text style={[S.meta, { marginTop: 8 }]}>Incident #{selected.id} · {selected.time}</Text>
      <Text style={[S.sub, { marginTop: 10 }]}>{selected.details}</Text>
      <Text style={[S.meta, { marginTop: 8 }]}>Location: {selected.location}</Text>
      <View style={{ height: 12 }} />
      {(['Submitted', 'Acknowledged', 'Investigating', 'Resolved'] as const).map((status, i) => {
        const rank = ['Submitted', 'Acknowledged', 'Investigating', 'Resolved'].indexOf(selected.status);
        return <View key={status} style={[S.row, { gap: 10, minHeight: 35 }]}>
          <Text style={{ fontWeight: '900', color: rank >= i ? C.darkGreen : C.subtle }}>{rank >= i ? '✓' : '○'}</Text>
          <Text style={[S.text, { color: rank >= i ? C.ink : C.muted }]}>{status}</Text>
        </View>;
      })}
      <Notice title="Administrative investigation" body="Riders can submit evidence and track progress; only authorized DeeToo staff may acknowledge, investigate and resolve incidents." tone="blue" />
      <View style={{ height: 10 }} /><Button outline label="Contact Support" onPress={openSupport} />
    </Panel> : null}
    <Panel title="Safety tips">
      <Text style={S.sub}>Stay aware of surroundings, use well-lit routes, and retain emergency contact information.</Text>
      <View style={{ height: 10 }} /><Button outline label={tipsExpanded ? 'Hide safety guidance' : 'View more safety guidance'} onPress={() => setTipsExpanded(v => !v)} />
      {tipsExpanded ? <Text style={[S.sub, { marginTop: 10 }]}>• Do not confront threatening individuals.{"\n"}• Move to a public, safe location.{"\n"}• Contact emergency services directly when in danger.{"\n"}• Do not continue operating a damaged or unsafe vehicle.</Text> : null}
    </Panel>
    <Notice title="Admin-controlled incident outcomes" body="Acknowledged, investigating and resolved are view-only states for riders. Administrative controls are deliberately absent from the rider interface." tone="blue" />
  </View>;
}
