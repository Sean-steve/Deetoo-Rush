import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, C, Notice, Panel, S, Tag } from './ui';
import {
  supportCategories,
  type InboxCategory, type NotificationPreferences, type RiderNotice,
  type SupportAction, type SupportCase, type SupportCategory, type SupportState,
} from './phase4-model';

function Item({ icon, title, body, right, onPress }: {
  icon: string; title: string; body: string; right?: React.ReactNode; onPress?: () => void;
}) {
  return <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress}
    style={{ flexDirection: 'row', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 60, alignItems: 'center' }}>
    <View style={{ width: 41, height: 41, borderRadius: 13, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, color: C.darkGreen }}>{icon}</Text>
    </View>
    <View style={{ flex: 1, gap: 3 }}><Text style={{ color: C.ink, fontWeight: '800', fontSize: 14 }}>{title}</Text>
      <Text style={S.sub}>{body}</Text>
    </View>{right}
  </Pressable>;
}
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11, minHeight: 44, justifyContent: 'center', backgroundColor: selected ? C.darkGreen : '#EFF4F1', borderWidth: 1, borderColor: selected ? C.darkGreen : C.border }}>
    <Text style={{ color: selected ? '#fff' : C.ink, fontWeight: '800', fontSize: 12 }}>{label}</Text>
  </Pressable>;
}
export function NotificationsScreen({ notices, onRead, onAllRead, prefs, setPref, openTarget }: {
  notices: RiderNotice[];
  onRead: (id: string) => void;
  onAllRead: () => void;
  prefs: NotificationPreferences;
  setPref: (key: keyof NotificationPreferences, value: boolean) => void;
  openTarget: (target: NonNullable<RiderNotice['target']>) => void;
}) {
  const [category, setCategory] = useState<InboxCategory>('All');
  const [showSettings, setShowSettings] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unread = notices.filter(n => !n.read).length;
  const filtered = notices.filter(n => (category === 'All' || n.kind === category) && (!unreadOnly || !n.read));
  return <View style={{ gap: 15 }}>
    <View style={S.split}><View style={{ flex: 1 }}><Text style={S.h1}>Notifications Center</Text><Text style={S.sub}>Screen 20 of 24 · Delivery and account updates</Text></View><Tag label={unread + ' unread'} tone={unread ? 'orange' : 'green'} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {(['All', 'Orders', 'Earnings', 'Account', 'Support', 'Updates'] as const).map(label =>
        <Chip key={label} label={label + (label === 'All' ? ' (' + unread + ')' : '')} selected={category === label} onPress={() => setCategory(label)} />)}
    </View>
    <Panel>
      <View style={[S.split, { gap: 8 }]}>
        <Text style={S.h2}>Recent alerts</Text>
        <Pressable accessibilityRole="button" onPress={onAllRead} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: C.darkGreen, fontWeight: '800' }}>Mark all read</Text></Pressable>
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: unreadOnly }} onPress={() => setUnreadOnly(!unreadOnly)} style={[S.row, { gap: 8, minHeight: 44 }]}>
        <Text style={{ fontSize: 20, color: C.darkGreen }}>{unreadOnly ? '☑' : '□'}</Text><Text style={S.text}>Unread only</Text>
      </Pressable>
      {filtered.length === 0 ? <Notice title="No notifications" body="Nothing matches your selected category and unread filter." tone="blue" /> : filtered.map(n => (
        <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={'Open ' + n.title} onPress={() => { onRead(n.id); if (n.target) openTarget(n.target); }}
          style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: n.read ? '#fff' : '#F1FBF5' }}>
          <View style={[S.split, { gap: 8 }]}>
            <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontWeight: n.read ? '700' : '900' }}>{n.read ? '' : '●  '}{n.title}</Text>
              <Text style={[S.sub, { marginTop: 5 }]}>{n.body}</Text><Text style={[S.meta, { marginTop: 4 }]}>{n.time} · {n.kind}{n.critical ? ' · Essential' : ''}</Text></View>
            <Text style={{ fontSize: 19, color: C.darkGreen }}>›</Text>
          </View>
        </Pressable>
      ))}
    </Panel>
    <Panel title="Notification summary">
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['Orders', 'Earnings', 'Account', 'Support', 'Updates'] as const).map(kind =>
          <View key={kind} style={{ width: '47%', backgroundColor: '#F0F8F3', padding: 12, borderRadius: 13, gap: 5 }}>
            <Text style={{ color: C.darkGreen, fontSize: 22, fontWeight: '900' }}>{notices.filter(n => n.kind === kind && !n.read).length}</Text><Text style={S.meta}>{kind} unread</Text>
          </View>)}
      </View>
    </Panel>
    <Button outline label={showSettings ? 'Hide notification settings' : 'Notification settings'} onPress={() => setShowSettings(!showSettings)} />
    {showSettings ? <Panel title="Notification preferences">
      {([
        ['delivery', 'Delivery requests', true],
        ['payouts', 'Payout and earnings updates', false],
        ['account', 'Account updates', true],
        ['support', 'Support replies', false],
        ['promotions', 'Promotions and bonuses', false],
        ['updates', 'Service announcements', false],
      ] as const).map(([key, label, critical]) =>
        <View key={key} style={[S.split, { minHeight: 53, borderBottomWidth: 1, borderBottomColor: C.border }]}>
          <View style={{ flex: 1 }}><Text style={S.text}>{label}</Text>{critical ? <Text style={S.meta}>Essential alerts remain enabled</Text> : null}</View>
          <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: critical ? true : prefs[key], disabled: critical }}
            disabled={critical} onPress={() => setPref(key, !prefs[key])} style={{ padding: 9, minWidth: 55, alignItems: 'center' }}>
            <Text style={{ fontSize: 23, color: critical || prefs[key] ? C.darkGreen : C.subtle }}>{critical || prefs[key] ? '☑' : '□'}</Text>
          </Pressable>
        </View>)}
      <Notice title="Safety alerts are mandatory" body="Security and safety-critical notifications cannot be disabled through preferences." tone="blue" />
    </Panel> : null}
    <Text style={[S.meta, { textAlign: 'center' }]}>Messages and read states are local mock data, not pushed or synchronized.</Text>
  </View>;
}

export function SupportCenterScreen({ state, dispatch, openCase, openSafety }: {
  state: SupportState;
  dispatch: React.Dispatch<SupportAction>;
  openCase: (id: string) => void;
  openSafety: () => void;
}) {
  const [filter, setFilter] = useState<'All' | SupportCase['status']>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('Orders & Deliveries');
  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState('');
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const cases = state.cases.filter(c => (filter === 'All' || c.status === filter) && [c.id, c.subject, c.category].some(x => x.toLowerCase().includes(search.toLowerCase())));
  const faqs = [
    ['How do I receive my payouts?', 'View Earnings → Wallet → Payouts for records and withdrawal requests.'],
    ['What if an order is cancelled?', 'Check Deliveries → History. Only DeeToo backend rules determine fees.'],
    ['How can I update documents?', 'Open Profile → Documents. A verified change may require administrative review.'],
    ['What if the app shows no orders?', 'Check availability and zone eligibility, then open an App & Technical support case.'],
  ];
  return <View style={{ gap: 15 }}>
    <Text style={S.h1}>Rider Support Center</Text>
    <Text style={S.sub}>Screen 21 of 24 · Keep every issue linked to a complete conversation.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
      <View style={{ flex: 1, minWidth: 140 }}><Button label="＋ Start a New Case" onPress={() => setShowCreate(!showCreate)} /></View>
      <View style={{ flex: 1, minWidth: 140 }}><Button outline label="Report Safety Issue" onPress={openSafety} /></View>
    </View>
    {showCreate ? <Panel title="New support case">
      <Text style={S.label}>Subject</Text>
      <TextInput style={S.input} accessibilityLabel="Support case subject" value={subject} onChangeText={setSubject} placeholder="Brief issue summary" placeholderTextColor={C.subtle} />
      <View style={{ height: 12 }} />
      <Text style={S.label}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {supportCategories.map(value => <Chip key={value} label={value} selected={category === value} onPress={() => setCategory(value)} />)}
      </View>
      <View style={{ height: 12 }} />
      <Text style={S.label}>Related order (optional; verified fixture)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {['', '#DR-78425', '#DR-78424', '#DR-78423', '#DR-78420'].map(value => <Chip key={value} label={value || 'No order'} selected={orderId === value} onPress={() => setOrderId(value)} />)}
      </View>
      <View style={{ height: 12 }} />
      <Text style={S.label}>Description</Text>
      <TextInput style={[S.input, { minHeight: 95, textAlignVertical: 'top' }]} multiline accessibilityLabel="Support case description" value={description} onChangeText={setDescription} placeholder="What happened? How can we help?" placeholderTextColor={C.subtle} />
      <View style={{ height: 12 }} />
      <Button label="Create Demo Case" onPress={() => {
        if (subject.trim().length < 5 || description.trim().length < 10) { dispatch({ type: 'CREATE', subject, category, description, orderId: orderId || undefined }); return; }
        dispatch({ type: 'CREATE', subject, category, description, orderId: orderId || undefined });
        setSubject(''); setDescription(''); setOrderId(''); setShowCreate(false);
      }} />
    </Panel> : null}
    {state.info ? <Notice title="Support preview status" body={state.info} tone="orange" /> : null}
    <Panel title="Support categories">
      {supportCategories.map((cat, i) => <Item key={cat} icon={['🛵', '▣', '♙', '➤', '⚑', '▣', '•••'][i]} title={cat}
        body={['Pickups, delivery or routing', 'Payments, wallet and settlement', 'Verification and personal data', 'App, device or location errors', 'Accidents, harassment or risk', 'Bag, helmet and vehicle gear', 'Other rider requests'][i]}
        onPress={() => { setCategory(cat); setShowCreate(true); }} />)}
    </Panel>
    <Panel title="My Support Cases">
      <TextInput accessibilityLabel="Search support cases" value={search} onChangeText={setSearch} placeholder="Find case, subject or category…" placeholderTextColor={C.subtle} style={S.input} />
      <View style={{ height: 10 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['All', 'Open', 'In Progress', 'Waiting for Rider', 'Resolved'] as const).map(value => <Chip key={value} label={value} selected={filter === value} onPress={() => setFilter(value)} />)}
      </View>
      {cases.length === 0 ? <Notice title="No matching cases" body="Try a different status or search term." tone="blue" /> : cases.map(c =>
        <Item key={c.id} icon="▤" title={c.subject} body={c.id + ' · ' + c.category + ' · ' + c.updatedAt}
          right={<Tag label={c.status} tone={c.status === 'Resolved' ? 'green' : 'orange'} />} onPress={() => openCase(c.id)} />)}
    </Panel>
    <Panel title="Frequently Asked Questions">
      {faqs.map(([question, answer], index) => <Pressable accessibilityRole="button" key={question} onPress={() => setExpandedFaq(expandedFaq === index ? null : index)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 50 }}>
        <Text style={[S.text, { fontWeight: '800' }]}>{question}  {expandedFaq === index ? '−' : '＋'}</Text>
        {expandedFaq === index ? <Text style={[S.sub, { marginTop: 7 }]}>{answer}</Text> : null}
      </Pressable>)}
    </Panel>
    <Notice title="Emergency safety issues" body="For immediate danger, contact local emergency services directly. The mock Support Center does not initiate calls or dispatch responders." tone="red" />
  </View>;
}

export function SupportConversationScreen({ state, dispatch, onBack, openOrder }: {
  state: SupportState;
  dispatch: React.Dispatch<SupportAction>;
  onBack: () => void;
  openOrder: () => void;
}) {
  const c = state.cases.find(item => item.id === state.selectedId);
  const [reply, setReply] = useState('');
  const [followup, setFollowup] = useState('');
  const [showFollowup, setShowFollowup] = useState(false);
  const [demoAttachment, setDemoAttachment] = useState(false);
  const [showAdminPreview, setShowAdminPreview] = useState(false);
  if (!c) return <Notice title="No conversation selected" body="Return to your support cases to open a thread." tone="blue" />;
  return <View style={{ gap: 15 }}>
    <Button outline label="‹ Back to Support Center" onPress={onBack} />
    <Text style={S.h1}>Support Conversation</Text>
    <Text style={S.sub}>Screen 22 of 24 · Complete case history with authorized support</Text>
    <Panel>
      <View style={S.split}><Text style={[S.h2, { flex: 1 }]}>{c.subject}</Text><Tag label={c.status} tone={c.status === 'Resolved' ? 'green' : 'orange'} /></View>
      <Text style={[S.meta, { marginTop: 9 }]}>Case #{c.id} · {c.category} · {c.updatedAt}</Text>
      <Text style={S.meta}>Priority: {c.priority}</Text>
      {c.orderId ? <Pressable accessibilityRole="button" onPress={openOrder} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[S.text, { color: C.darkGreen, fontWeight: '800' }]}>Related order: {c.orderId} →</Text></Pressable> : null}
    </Panel>
    <Panel title="Conversation">
      {c.messages.map(m => <View key={m.id} style={{ marginVertical: 8, gap: 5, maxWidth: '95%', alignSelf: m.sender === 'Rider' ? 'flex-end' : 'flex-start' }}>
        <Text style={[S.meta, { textAlign: m.sender === 'Rider' ? 'right' : 'left', fontWeight: '700' }]}>{m.sender === 'Rider' ? 'You (Rider)' : m.sender === 'System' ? 'Case update' : 'DeeToo Support'} · {m.time}</Text>
        <View style={{ backgroundColor: m.sender === 'Rider' ? C.mint : m.sender === 'System' ? C.paleOrange : C.paleBlue, borderRadius: 15, padding: 12 }}>
          <Text style={S.text}>{m.body}</Text>
          {m.attachments.map(x => <Text key={x} style={[S.meta, { color: C.darkGreen, marginTop: 8 }]}>▤ {x} (mock attachment)</Text>)}
        </View>
      </View>)}
      <Text style={[S.meta, { marginTop: 8 }]}>Messages are retained in this local session. No real support team received them.</Text>
    </Panel>
    {c.status !== 'Resolved' ? <Panel title="Send a reply">
      <TextInput accessibilityLabel="Support conversation message" multiline placeholder="Type your message…" placeholderTextColor={C.subtle} style={[S.input, { minHeight: 88, textAlignVertical: 'top' }]} value={reply} onChangeText={setReply} />
      <View style={[S.row, { gap: 9, marginTop: 12 }]}>
        <View style={{ flex: 1 }}><Button outline label={demoAttachment ? 'Remove demo file' : '＋ Attachment'} onPress={() => setDemoAttachment(v => !v)} /></View>
        <View style={{ flex: 1 }}><Button label="Send ➤" onPress={() => { dispatch({ type: 'REPLY', body: reply, attachment: demoAttachment ? 'demo-screenshot.jpg' : undefined }); if (reply.trim()) { setReply(''); setDemoAttachment(false); } }} /></View>
      </View>
      {demoAttachment ? <Text style={S.meta}>demo-screenshot.jpg staged. No file bytes uploaded.</Text> : null}
    </Panel> : <Notice title="Case marked resolved by Admin" body="Only an authorized administrator can formally resolve this case. You can request a follow-up if the issue persists." />}
    <Panel title="Are you satisfied?">
      <Text style={S.sub}>Your feedback informs the support team but does not close the case.</Text>
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
        <View style={{ flex: 1 }}><Button outline label="I'm satisfied" onPress={() => dispatch({ type: 'SATISFACTION', satisfied: true })} /></View>
        <View style={{ flex: 1 }}><Button outline label="Not yet" onPress={() => { dispatch({ type: 'SATISFACTION', satisfied: false }); setShowFollowup(true); }} /></View>
      </View>
      {c.riderSatisfied !== null ? <Text style={[S.meta, { marginTop: 10 }]}>Your feedback: {c.riderSatisfied ? 'Satisfied' : 'Further help requested'}</Text> : null}
      <View style={{ height: 9 }} />
      <Button label={showFollowup ? 'Hide follow-up form' : 'Request Follow-up'} onPress={() => setShowFollowup(v => !v)} />
      {showFollowup ? <>
        <View style={{ height: 12 }} />
        <TextInput accessibilityLabel="Follow-up explanation" multiline style={[S.input, { minHeight: 80, textAlignVertical: 'top' }]} value={followup} onChangeText={setFollowup} placeholder="What still needs attention?" placeholderTextColor={C.subtle} />
        <View style={{ height: 9 }} /><Button outline label="Submit follow-up" onPress={() => { dispatch({ type: 'FOLLOW_UP', note: followup }); if (followup.trim().length >= 10) { setFollowup(''); setShowFollowup(false); } }} />
      </> : null}
    </Panel>
    {state.info ? <Notice title="Conversation status" body={state.info} tone="blue" /> : null}
    <Panel title="Visual acceptance: administrator-only state">
      <Text style={S.sub}>This is a simulation of what an administrator could do in the backend. Riders never receive a real Resolve or Close Case permission.</Text>
      <View style={{ height: 10 }} />
      <Button outline label={showAdminPreview ? 'Hide admin preview' : 'Show admin-only state controls'} onPress={() => setShowAdminPreview(v => !v)} />
      {showAdminPreview ? <View style={{ marginTop: 9 }}><Button outline label="SIMULATE admin resolution (not a rider action)" onPress={() => dispatch({ type: 'PREVIEW_ADMIN_RESOLVE' })} /></View> : null}
    </Panel>
  </View>;
}
