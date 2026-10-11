import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, C, Metric, Notice, Panel, S, Tag } from './ui';

const trend = [
  { day: 'Mon', deliveries: 14, ontime: 12, rating: 4.5 },
  { day: 'Tue', deliveries: 19, ontime: 18, rating: 4.6 },
  { day: 'Wed', deliveries: 22, ontime: 21, rating: 4.6 },
  { day: 'Thu', deliveries: 25, ontime: 23, rating: 4.7 },
  { day: 'Fri', deliveries: 18, ontime: 17, rating: 4.8 },
  { day: 'Sat', deliveries: 29, ontime: 28, rating: 4.9 },
  { day: 'Sun', deliveries: 24, ontime: 23, rating: 4.8 },
];
const comments = [
  { customer: 'Emily Wanjiru', stars: 5, quote: 'Friendly and professional. Delivered on time.', date: 'Oct 10, 2026', badge: 'On-time' },
  { customer: 'James Mwangi', stars: 5, quote: 'Kept me updated throughout the journey.', date: 'Oct 09, 2026', badge: 'On-time' },
  { customer: 'Grace Njeri', stars: 4, quote: 'Good service, but a bit longer than expected.', date: 'Oct 08, 2026', badge: 'Late' },
];
const achievements = [
  { icon: '★', label: 'Top Performer', desc: 'Completed 100+ deliveries this month' },
  { icon: '⚡', label: 'On-Time Hero', desc: 'Maintained over 90% on-time delivery' },
  { icon: '✦', label: '5-Star Rider', desc: 'Earned 50+ five-star ratings' },
];
type Period = 'Daily' | 'Weekly' | 'Monthly';
export function RiderPerformanceScreen({ goHome }: { goHome: () => void }) {
  const [period, setPeriod] = useState<Period>('Daily');
  const [showAllFeedback, setShowAllFeedback] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const periods: Period[] = ['Daily', 'Weekly', 'Monthly'];
  const data = period === 'Daily' ? trend : period === 'Weekly' ?
    [
      { day: 'W1', deliveries: 18, ontime: 16, rating: 4.5 },
      { day: 'W2', deliveries: 25, ontime: 23, rating: 4.6 },
      { day: 'W3', deliveries: 28, ontime: 26, rating: 4.8 },
      { day: 'W4', deliveries: 32, ontime: 30, rating: 4.9 },
    ] : [
      { day: 'May', deliveries: 13, ontime: 11, rating: 4.4 },
      { day: 'Jun', deliveries: 17, ontime: 16, rating: 4.5 },
      { day: 'Jul', deliveries: 22, ontime: 20, rating: 4.6 },
      { day: 'Aug', deliveries: 26, ontime: 24, rating: 4.7 },
      { day: 'Sep', deliveries: 31, ontime: 29, rating: 4.8 },
      { day: 'Oct', deliveries: 34, ontime: 32, rating: 4.8 },
    ];
  return <View style={{ gap: 15 }}>
    <Text style={S.h1}>Performance & Ratings</Text>
    <Text style={S.sub}>Screen 19 of 24 · Customer feedback and delivery trends</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
      <Metric title="Customer rating" value="4.8 / 5" subtitle="256 sample ratings" tone="orange" />
      <Metric title="Completion rate" value="96%" subtitle="+4% versus last month" />
      <Metric title="Acceptance rate" value="88%" subtitle="+6% versus last month" tone="blue" />
      <Metric title="On-time delivery" value="92%" subtitle="+5% versus last month" />
    </View>
    <Panel title="Performance trend">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {periods.map(p => <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: period === p }} onPress={() => setPeriod(p)}
          style={{ minHeight: 44, minWidth: 77, borderRadius: 11, padding: 10, backgroundColor: period === p ? C.darkGreen : '#EFF3F0', justifyContent: 'center' }}>
          <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '800', color: period === p ? '#fff' : C.ink }}>{p}</Text>
        </Pressable>)}
      </View>
      <View style={{ height: 170, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 16 }}>
        {data.map(x => <View key={x.day} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{ width: '88%', maxWidth: 40, justifyContent: 'flex-end', height: x.deliveries * 3.5, borderRadius: 7, backgroundColor: C.green, overflow: 'hidden' }}>
            <View style={{ width: '100%', backgroundColor: '#72D9A0', height: x.ontime / x.deliveries * x.deliveries * 3.5 }} />
          </View><Text style={[S.meta, { fontSize: 10 }]}>{x.day}</Text>
        </View>)}
      </View>
      <View style={[S.row, { gap: 13, justifyContent: 'center', marginTop: 10 }]}>
        <Text style={[S.meta, { color: C.darkGreen }]}>● Deliveries</Text><Text style={[S.meta, { color: '#5AAB85' }]}>● On time</Text>
      </View>
      <Text style={[S.meta, { textAlign: 'center', marginTop: 9 }]}>Illustrative performance trends only; not dispatch eligibility decisions.</Text>
    </Panel>
    <Panel title="Overall performance">
      <View style={[S.split, { gap: 12 }]}>
        <View style={{ width: 106, height: 106, borderRadius: 58, backgroundColor: C.mint, borderWidth: 10, borderColor: C.green, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.darkGreen, fontWeight: '900', fontSize: 29 }}>4.8</Text><Text style={[S.meta, { fontSize: 10 }]}>Excellent</Text>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          {['Customer rating  4.8 / 5', 'Completed deliveries  96%', 'On-time deliveries  92%', 'Acceptance rate  88%'].map(s => <Text key={s} style={[S.text, { fontSize: 13 }]}>{s}</Text>)}
        </View>
      </View>
    </Panel>
    <Panel title="Delivery stats">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Metric title="Completed" value="124" />
        <Metric title="Cancelled" value="8" tone="orange" />
        <Metric title="Average time" value="56 min" tone="blue" />
        <Metric title="Distance" value="312 km" />
      </View>
    </Panel>
    <Panel title="Achievements">
      {achievements.map(a => <View key={a.label} style={[S.row, { paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border }]}>
        <Text style={{ fontSize: 28, color: C.darkGreen }}>{a.icon}</Text>
        <View style={{ flex: 1 }}><Text style={[S.text, { fontWeight: '800' }]}>{a.label}</Text><Text style={S.meta}>{a.desc}</Text></View>
        <Text style={[S.meta, { color: C.darkGreen }]}>›</Text>
      </View>)}
    </Panel>
    <Panel title="Customer feedback">
      {comments.slice(0, showAllFeedback ? undefined : 2).map(c => <View key={c.customer} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 }}>
        <View style={S.split}><Text style={[S.text, { fontWeight: '800' }]}>{c.customer}</Text><Tag label={c.badge} tone={c.badge === 'Late' ? 'orange' : 'green'} /></View>
        <Text style={{ color: C.orange, fontSize: 19 }}>{'★'.repeat(c.stars) + '☆'.repeat(5 - c.stars)}</Text>
        <Text style={S.sub}>{c.quote}</Text><Text style={S.meta}>{c.date}</Text>
      </View>)}
      <Button outline label={showAllFeedback ? 'Show less feedback' : 'View all feedback'} onPress={() => setShowAllFeedback(v => !v)} />
    </Panel>
    <Panel title="Areas for improvement">
      <Notice title="Improve delivery consistency" body="When safe and possible, update delivery status promptly. Never speed or break traffic rules to improve metrics." tone="orange" />
      <View style={{ height: 10 }} />
      <Button outline label={showTips ? 'Hide resources' : 'View tips and resources'} onPress={() => setShowTips(v => !v)} />
      {showTips ? <Text style={[S.sub, { marginTop: 10 }]}>Keep contact details current, check route instructions before moving, and report merchant/customer delays rather than rushing.</Text> : null}
    </Panel>
    <Notice title="Performance is illustrative" body="Achievements, ratings and scores are fixtures. Any real performance and eligibility decisions will use DeeToo backend records." tone="blue" />
    <Button outline label="← Back to Home" onPress={goHome} />
  </View>;
}
