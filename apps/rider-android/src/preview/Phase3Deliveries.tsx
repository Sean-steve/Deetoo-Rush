import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, C, MapPreview, Metric, Notice, Panel, S, Tag } from './ui';
import { kes } from './phase1-model';
import { demoOrder, type DeliveryState } from './phase2-model';
import {
  filterHistory, nextMultiStop, routeSequenceValid,
  sampleHistory, sampleMultiStops,
  type DeliveryView, type HistoryFilter, type HistoryOrder,
  type MockStopState, type RangeFilter,
} from './phase3-model';

function Space({ h = 12 }: { h?: number }) { return <View style={{ height: h }} />; }
function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={{ paddingVertical: 10, paddingHorizontal: 13, minHeight: 44, borderRadius: 12, backgroundColor: active ? C.darkGreen : '#EDF2EF', alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#fff' : C.ink }}>{label}</Text>
  </Pressable>;
}
function Head({ num, name, detail }: { num: number; name: string; detail: string }) {
  return <View style={{ gap: 3 }}>
    <Text style={S.h1}>{name}</Text>
    <Text style={S.sub}>Screen {num} of 24 · {detail}</Text>
  </View>;
}
export function DeliveryCompletionScreen({ state, sampleOnly, onHistory, onNext }: {
  state: DeliveryState; sampleOnly: boolean; onHistory: () => void; onNext: () => void;
}) {
  return <View style={{ gap: 15 }}>
    <Head num={13} name="Delivery Completion" detail="Customer handover and delivery summary" />
    <Notice title={sampleOnly ? 'Sample completion preview' : 'Delivery completed (demo only)'}
      body="Your handover was confirmed in the frontend simulation. No live order, payment or wallet balance was changed." />
    <Panel>
      <View style={{ alignItems: 'center', gap: 11, paddingVertical: 14 }}>
        <View style={{ width: 92, height: 92, backgroundColor: C.mint, borderRadius: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: C.green }}>
          <Text style={{ color: C.darkGreen, fontSize: 54, fontWeight: '900' }}>✓</Text>
        </View>
        <Text style={[S.h1, { textAlign: 'center', color: C.darkGreen }]}>Delivery Completed!</Text>
        <Text style={[S.sub, { textAlign: 'center' }]}>Great work! You're ready for your next assignment.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Metric title="Total time" value="56 min" />
        <Metric title="Total distance" value="8.7 km" tone="blue" />
      </View>
      <Space />
      <Tag label="Handover confirmed in demo" />
    </Panel>
    <Panel title="Delivery journey">
      <View style={[S.row, { gap: 13, paddingVertical: 9 }]}>
        <Text style={{ fontSize: 25 }}>🏪</Text>
        <View style={{ flex: 1 }}><Text style={[S.text, { fontWeight: '800' }]}>{demoOrder.merchant}</Text><Text style={S.meta}>{demoOrder.branch}</Text></View>
      </View>
      <View style={{ height: 16, width: 2, backgroundColor: C.green, marginLeft: 12 }} />
      <View style={[S.row, { gap: 13, paddingVertical: 9 }]}>
        <Text style={{ fontSize: 25 }}>⌂</Text>
        <View style={{ flex: 1 }}><Text style={[S.text, { fontWeight: '800' }]}>{demoOrder.customer}</Text><Text style={S.meta}>{demoOrder.destination}</Text></View>
      </View>
    </Panel>
    <Panel title="Earnings summary • illustration">
      {[['Base fare', 'KSh 250'], ['Distance component', 'KSh 120'], ['Time bonus', 'KSh 50'], ['Peak-hour bonus', 'KSh 50']].map(([name, value]) =>
        <View key={name} style={[S.split, { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border }]}>
          <Text style={S.sub}>{name}</Text><Text style={[S.text, { fontWeight: '800' }]}>{value}</Text>
        </View>)}
      <View style={[S.split, { marginTop: 12 }]}><Text style={[S.h2, { color: C.darkGreen }]}>Sample rider earnings</Text><Text style={[S.h2, { color: C.darkGreen }]}>{kes(470)}</Text></View>
      <Text style={[S.meta, { marginTop: 7 }]}>This illustrative breakdown does not affect the wallet, order or settlement ledger.</Text>
    </Panel>
    <Panel title="Customer feedback">
      <Text style={[S.h2, { color: C.orange }]}>★★★★★</Text>
      <Text style={S.sub}>Example 5-star feedback layout. Actual customer feedback is not available in preview mode.</Text>
    </Panel>
    <Panel title="Receipt & settlement">
      <View style={S.split}><Text style={S.sub}>Order reference</Text><Text style={S.text}>{demoOrder.id}</Text></View>
      <Space h={8} />
      <View style={S.split}><Text style={S.sub}>Delivery status</Text><Tag label={state.status === 'delivered' ? 'Demo completed' : 'Preview example'} /></View>
      <Space h={8} />
      <View style={S.split}><Text style={S.sub}>Wallet posting</Text><Tag label="Not posted" tone="orange" /></View>
      <Space />
      <MapPreview />
    </Panel>
    <Button label="Get Next Order →" onPress={onNext} />
    <Button outline label="View Delivery History" onPress={onHistory} />
  </View>;
}

export function ActiveDeliveriesScreen({ stop, setStop, openOperations, openCompletion, openHistory, onToast }: {
  stop: MockStopState;
  setStop: (step: MockStopState) => void;
  openOperations: () => void;
  openCompletion: () => void;
  openHistory: () => void;
  onToast: (message: string) => void;
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [showRouteSuggestion, setShowRouteSuggestion] = useState(false);
  const allDone = stop === 3;
  return <View style={{ gap: 15 }}>
    <Head num={14} name="Active Deliveries" detail="Multiple orders and stop sequence" />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Metric title="Sample active orders" value={allDone ? '0' : '2'} subtitle="2 drop-offs" />
      <Metric title="Route estimate" value="1h 08m" tone="blue" subtitle="12.4 km" />
    </View>
    <Panel title="Delivery overview">
      <MapPreview />
      <Space h={10} />
      <Notice title="Dispatch-assigned route" body="Pickup first, then customer drop-offs in the assigned sequence. Riders cannot independently reorder stops." tone="blue" />
    </Panel>
    <Panel title="Delivery sequence" action={<Tag label={allDone ? 'All simulated' : 'In progress'} tone={allDone ? 'green' : 'orange'} />}>
      {sampleMultiStops.map((step, i) => {
        const completed = i < stop, current = i === stop;
        return <View key={step.id} style={{
          flexDirection: 'row', gap: 11, alignItems: 'center', paddingVertical: 13,
          borderBottomWidth: i < 2 ? 1 : 0, borderColor: C.border,
        }}>
          <View style={{ backgroundColor: completed ? C.darkGreen : current ? C.orange : '#E7EDEA', width: 34, height: 34, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '900', color: current || completed ? '#fff' : C.muted }}>{completed ? '✓' : step.number}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[S.meta, { color: current ? C.darkGreen : C.muted, fontWeight: '800' }]}>{step.type}{current ? ' • CURRENT' : completed ? ' • COMPLETE' : ''}</Text>
            <Text style={{ fontWeight: '800', color: C.ink }}>{step.name}</Text>
            <Text style={S.meta}>{step.place}</Text>
            <Text style={[S.meta, { fontWeight: '800' }]}>{step.order} · {step.eta} · {step.distance}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={'View stop ' + step.number + ' details'} onPress={() => setExpandedOrder(expandedOrder === step.id ? null : step.id)} style={{ minHeight: 44, minWidth: 48, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.darkGreen }}>{expandedOrder === step.id ? 'Hide' : 'Details'}</Text>
          </Pressable>
        </View>;
      })}
      {expandedOrder ? <Notice title="Order information" body={'Stop ' + expandedOrder + ' is part of the simulated dispatch plan. Contact instructions and earnings are illustrative.'} tone="blue" /> : null}
      <Space />
      <Button label={allDone ? 'Reset sample stop sequence' : '✓ Simulate next stop'} onPress={() => {
        if (allDone) { setStop(0); onToast('Sample route reset. No actual orders were altered.'); return; }
        if (!routeSequenceValid(sampleMultiStops.map(s => s.id))) { onToast('The dispatch route is invalid.'); return; }
        setStop(nextMultiStop(stop)); onToast('Stop updated locally. No delivery was completed on the DeeToo backend.');
      }} />
    </Panel>
    <Panel title="Multi-order controls">
      <View style={{ gap: 9 }}>
        <Button outline label="Request optimized route" onPress={() => setShowRouteSuggestion(!showRouteSuggestion)} />
        {showRouteSuggestion ? <Notice title="No unauthorized reordering" body="Optimization can suggest route changes, but dispatch approval will be required before changing the real stop order." tone="orange" /> : null}
        <Button outline label="View order details" onPress={() => { setExpandedOrder('pickup'); onToast('Order detail expanded in the delivery sequence.'); }} />
        <Button outline label="Message customers" onPress={() => onToast('Customer contact is deferred to the communication integration; no message was sent.')} />
        <Button outline label="Contact dispatch support" onPress={() => onToast('Dispatch escalation is a preview control; no support case was created.')} />
        <Button outline label="Report an issue" onPress={() => onToast('For the full mock incident form, open the single-delivery operations demo.')} />
      </View>
    </Panel>
    <Panel title="More delivery screens">
      <View style={{ gap: 9 }}>
        <Button label="Screens 7–12 • Delivery flow" onPress={openOperations} />
        <Button outline label="Screen 13 • Completion summary" onPress={openCompletion} />
        <Button outline label="Screen 15 • Delivery history" onPress={openHistory} />
      </View>
    </Panel>
    <Text style={[S.meta, { textAlign: 'center' }]}>All active order assignments and completion events on this screen are simulated.</Text>
  </View>;
}

function StatusColour({ status }: { status: HistoryOrder['status'] }) {
  return <Tag label={status} tone={status === 'Completed' ? 'green' : status === 'Cancelled' ? 'orange' : 'red'} />;
}
export function DeliveryHistoryScreen({ onActive, onCompletion }: { onActive: () => void; onCompletion: () => void }) {
  const [status, setStatus] = useState<HistoryFilter>('All');
  const [range, setRange] = useState<RangeFilter>('30 days');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const results = useMemo(() => filterHistory(sampleHistory, status, range, search), [status, range, search]);
  const totals = useMemo(() => ({
    completed: sampleHistory.filter(v => v.status === 'Completed').length,
    cancelled: sampleHistory.filter(v => v.status === 'Cancelled').length,
    failed: sampleHistory.filter(v => v.status === 'Failed').length,
    earned: sampleHistory.filter(v => v.status === 'Completed').reduce((total, o) => total + o.riderEarnings, 0),
  }), []);
  return <View style={{ gap: 15 }}>
    <Head num={15} name="Delivery History" detail="Search and review delivery records" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Metric title="Completed" value={String(totals.completed)} />
      <Metric title="Cancelled" value={String(totals.cancelled)} tone="orange" />
      <Metric title="Failed" value={String(totals.failed)} tone="blue" />
      <Metric title="Completed earnings" value={kes(totals.earned)} />
    </View>
    <Panel title="Filter deliveries">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {(['All', 'Completed', 'Cancelled', 'Failed'] as const).map(value => <Pill key={value} label={value} active={status === value} onPress={() => setStatus(value)} />)}
      </View>
      <Space />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {(['Today', '7 days', '30 days'] as const).map(value => <Pill key={value} label={value} active={range === value} onPress={() => setRange(value)} />)}
      </View>
      <Space />
      <TextInput accessibilityLabel="Search delivery history" placeholder="Order, customer, restaurant or location…" placeholderTextColor={C.subtle} style={S.input} value={search} onChangeText={setSearch} />
      <Text style={[S.meta, { marginTop: 10 }]}>{results.length} matching sample deliveries · October 2026</Text>
    </Panel>
    {results.length === 0 ? <Panel><Notice title="No matching deliveries" body="Change the search or date/status filters. No demo records match these selections." tone="blue" /></Panel> : null}
    {results.map(order => {
      const selected = selectedId === order.id;
      return <Panel key={order.id}>
        <View style={S.split}><StatusColour status={order.status} /><Text style={S.meta}>{order.date} · {order.time}</Text></View>
        <Space />
        <View style={S.split}>
          <View style={{ flex: 1, paddingRight: 10, gap: 3 }}>
            <Text style={[S.h2, { fontSize: 16 }]}>{order.merchant}</Text>
            <Text style={S.sub}>{order.route}</Text>
            <Text style={S.meta}>{order.id} · {order.durationMinutes} min · {order.distanceKm} km</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}><Text style={[S.h2, { color: C.darkGreen }]}>{kes(order.riderEarnings)}</Text><Text style={S.meta}>Illustrative</Text></View>
        </View>
        <Space />
        <Button outline label={selected ? 'Hide delivery details' : 'View Delivery Details →'} onPress={() => setSelectedId(selected ? null : order.id)} />
        {selected ? <View style={{ marginTop: 12, gap: 9 }}>
          <View style={S.split}><Text style={S.sub}>Customer</Text><Text style={S.text}>{order.customer}</Text></View>
          <View style={S.split}><Text style={S.sub}>Status</Text><StatusColour status={order.status} /></View>
          <View style={S.split}><Text style={S.sub}>Wallet record</Text><Tag label={order.payoutStatus} tone={order.payoutStatus === 'Credited' ? 'green' : 'orange'} /></View>
          <Notice title="Delivery detail" body={order.note} tone={order.status === 'Completed' ? 'green' : 'orange'} />
          {order.id === demoOrder.id && order.status === 'Completed' ? <Button label="Preview completion summary" onPress={onCompletion} /> : null}
        </View> : null}
      </Panel>;
    })}
    <Notice title="Preview data only" body="Cancelled and failed order compensation is not automatically payable. The authoritative backend will determine any applicable amounts." tone="blue" />
    <Button outline label="← Active Deliveries" onPress={onActive} />
  </View>;
}
