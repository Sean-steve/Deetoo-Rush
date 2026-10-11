import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, C, Metric, Notice, Panel, S, Tag } from './ui';
import { kes } from './phase1-model';
import {
  achievements, financeBreakdownEqualsTotal, overview, sampleCharts,
  validatePayout, type ChartPeriod, type DemoPayout, type MoneyTransaction,
  type WalletAction, type WalletState,
} from './phase3-model';

type Move = () => void;
function Space({ h = 12 }: { h?: number }) { return <View style={{ height: h }} />; }
function Head({ num, title, description }: { num: number; title: string; description: string }) {
  return <View style={{ gap: 3 }}><Text style={S.h1}>{title}</Text><Text style={S.sub}>Screen {num} of 24 · {description}</Text></View>;
}
function MiniButton({ title, active, onPress }: { title: string; active: boolean; onPress: Move }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={{
    minHeight: 44, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, backgroundColor: active ? C.darkGreen : '#EEF3F0',
    alignItems: 'center', justifyContent: 'center',
  }}><Text style={{ fontWeight: '800', fontSize: 12, color: active ? '#fff' : C.muted }}>{title}</Text></Pressable>;
}
function Bars({ period }: { period: ChartPeriod }) {
  const data = sampleCharts[period];
  const maximum = Math.max(...data.map(x => x.base + x.bonus)) || 1;
  return <View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 175, gap: 8, paddingHorizontal: 3 }}>
      {data.map(x => {
        const height = Math.max(14, (x.base + x.bonus) / maximum * 154);
        const bonusHeight = x.bonus / (x.base + x.bonus) * height;
        return <View key={x.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
          <View style={{ width: '80%', maxWidth: 34, height, overflow: 'hidden', borderRadius: 7, justifyContent: 'flex-end', backgroundColor: C.green }}>
            <View style={{ width: '100%', height: bonusHeight, backgroundColor: '#84DCA9' }} />
          </View>
          <Text style={[S.meta, { fontSize: 10, textAlign: 'center' }]}>{x.label}</Text>
        </View>;
      })}
    </View>
    <View style={[S.row, { gap: 13, justifyContent: 'center', paddingTop: 15 }]}>
      <Text style={[S.meta, { color: C.darkGreen }]}>● Base fares</Text>
      <Text style={[S.meta, { color: '#53B485' }]}>● Bonuses</Text>
    </View>
    <Text style={[S.meta, { textAlign: 'center', marginTop: 8 }]}>Illustrative chart: amounts and date range are not live financial records.</Text>
  </View>;
}
function Breakdown() {
  const parts: { name: string; value: number; color: string }[] = [
    { name: 'Base fares', value: overview.base, color: C.darkGreen },
    { name: 'Time bonuses', value: overview.timeBonuses, color: '#63CDA0' },
    { name: 'Peak-hour', value: overview.peakBonuses, color: C.orange },
    { name: 'Distance bonuses', value: overview.distanceBonuses, color: '#2E73BB' },
    { name: 'Other adjustments', value: overview.otherAdjustments, color: '#9680D2' },
  ];
  return <>
    <View style={{ flexDirection: 'row', borderRadius: 15, height: 19, overflow: 'hidden', marginVertical: 11 }}>
      {parts.map(part => <View key={part.name} style={{ flex: part.value, backgroundColor: part.color }} />)}
    </View>
    {parts.map(part => <View key={part.name} style={[S.split, { paddingVertical: 7, gap: 8 }]}>
      <View style={[S.row, { gap: 8, flex: 1 }]}><View style={{ backgroundColor: part.color, width: 11, height: 11, borderRadius: 3 }} /><Text style={S.sub}>{part.name}</Text></View>
      <Text style={[S.text, { fontWeight: '800' }]}>{kes(part.value)}</Text>
    </View>)}
  </>;
}
export function EarningsDashboard({ onWallet, onPayout }: { onWallet: Move; onPayout: Move }) {
  const [period, setPeriod] = useState<ChartPeriod>('Daily');
  return <View style={{ gap: 15 }}>
    <Head num={16} title="Earnings Dashboard" description="Your income trends and delivery performance" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Metric title="Total earned (Oct)" value={kes(overview.totalEarned)} subtitle="Sample period only" />
      <Metric title="Base earnings" value={kes(overview.base)} tone="blue" subtitle="76% of earnings" />
      <Metric title="Bonuses + adjustments" value={kes(overview.totalEarned - overview.base)} tone="orange" subtitle="24% of earnings" />
      <Metric title="Historical payouts" value={kes(overview.paidOut)} subtitle="Not available balance" />
    </View>
    <Panel title="Earnings trend">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {(['Daily', 'Weekly', 'Monthly'] as const).map(value =>
          <MiniButton key={value} title={value} active={period === value} onPress={() => setPeriod(value)} />)}
      </View>
      <Space /><Bars period={period} />
    </Panel>
    <Panel title="Earnings breakdown">
      <Text style={[S.h2, { color: C.darkGreen }]}>{kes(overview.totalEarned)}</Text>
      <Text style={S.meta}>Sample total • October 2026</Text>
      <Breakdown />
      {!financeBreakdownEqualsTotal(overview) ? <Notice title="Illustrative breakdown mismatch" body="The mock totals need a review." tone="orange" /> : null}
    </Panel>
    <Panel title="Delivery statistics">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Metric title="Completed" value={String(overview.completedDeliveries)} />
        <Metric title="Cancelled" value="8" tone="orange" />
        <Metric title="Avg. delivery time" value={overview.averageDeliveryMinutes + ' min'} tone="blue" />
        <Metric title="Total distance" value={overview.totalDistanceKm + ' km'} />
      </View>
    </Panel>
    <Panel title="Achievements">
      {achievements.map(a => <View key={a.title} style={[S.row, { gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border }]}>
        <View style={{ height: 41, width: 41, backgroundColor: C.mint, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 22, color: C.darkGreen }}>{a.icon}</Text></View>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.ink }}>{a.title}</Text><Text style={S.meta}>{a.detail}</Text></View>
      </View>)}
    </Panel>
    <Panel title="Financial quick actions">
      <View style={{ gap: 9 }}>
        <Button label="Open Rider Wallet →" onPress={onWallet} />
        <Button outline label="Payouts & Transactions →" onPress={onPayout} />
      </View>
    </Panel>
    <Notice title="Finance preview" body="Charts, bonuses and ratings use fixture data. The DeeToo ledger will be the only financial source after integration." tone="blue" />
  </View>;
}
function TxRow({ tx }: { tx: MoneyTransaction }) {
  const negative = tx.amount < 0;
  return <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 5 }}>
    <View style={S.split}>
      <Text style={[S.text, { fontWeight: '800', flex: 1 }]}>{tx.title}</Text>
      <Text style={[S.text, { color: negative ? C.red : tx.amount === 0 ? C.muted : C.darkGreen, fontWeight: '900' }]}>{tx.amount > 0 ? '+' : ''}{kes(tx.amount)}</Text>
    </View>
    <View style={S.split}><Text style={S.meta}>{tx.date} · {tx.kind}</Text><Tag label={tx.status} tone={tx.status === 'Completed' ? 'green' : tx.status === 'Failed' ? 'red' : 'orange'} /></View>
    <Text style={S.meta}>Reference: {tx.reference}</Text>
  </View>;
}
export function RiderWalletScreen({ wallet, dispatch, onEarnings, onPayout }: {
  wallet: WalletState; dispatch: React.Dispatch<WalletAction>; onEarnings: Move; onPayout: Move;
}) {
  const [cashDescription, setCashDescription] = useState('');
  const [showCashReview, setShowCashReview] = useState(false);
  const [showAll, setShowAll] = useState(false);
  return <View style={{ gap: 15 }}>
    <Head num={17} title="Wallet & Cash Management" description="Know exactly what belongs to you" />
    <Panel>
      <Text style={S.sub}>AVAILABLE TO WITHDRAW · DEMO BALANCE</Text>
      <Text style={[S.h1, { color: C.darkGreen, fontSize: 35, marginTop: 5 }]}>{kes(wallet.available)}</Text>
      <Space />
      <Button label="Withdraw to M-PESA →" onPress={onPayout} />
      <Text style={[S.meta, { marginTop: 9 }]}>M-PESA setup is a preview. No account or number is connected to Safaricom.</Text>
    </Panel>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
      <Metric title="Cash collected" value={kes(wallet.cashCollected)} tone="blue" subtitle="Held from customers" />
      <Metric title="Cash to reconcile" value={kes(wallet.cashOutstanding)} tone="orange" subtitle="Not wallet credit" />
      <Metric title="Pending payouts" value={kes(wallet.pendingPayouts)} subtitle="Reserved, not withdrawn" />
      <Metric title="Period earnings" value={kes(wallet.totalEarned)} tone="blue" subtitle="Separate from cash" />
    </View>
    <Notice title="Different balances, different meaning" body="Earned income, cash handled on deliveries, outstanding cash, reserved payouts and withdrawable balance are separate ledgers—not amounts to simply add together." tone="blue" />
    <Panel title="Cash collection & reconciliation">
      <View style={S.split}><Text style={S.sub}>Cash received from customers</Text><Text style={[S.text, { fontWeight: '800' }]}>{kes(wallet.cashCollected)}</Text></View>
      <Space h={8} />
      <View style={S.split}><Text style={S.sub}>Outstanding for reconciliation</Text><Text style={[S.text, { fontWeight: '800', color: C.orange }]}>{kes(wallet.cashOutstanding)}</Text></View>
      <Space />
      <View style={{ height: 9, borderRadius: 10, backgroundColor: '#E6ECE7', overflow: 'hidden' }}>
        <View style={{ height: 9, width: '76%', backgroundColor: C.green, borderRadius: 10 }} />
      </View>
      <Text style={[S.meta, { marginTop: 9 }]}>Illustrative collection progress. No reconciliation is performed by this preview.</Text>
      <Space />
      <Button outline label={showCashReview ? 'Hide cash issue form' : 'Report Cash Discrepancy'} onPress={() => setShowCashReview(v => !v)} />
      {showCashReview ? <View style={{ marginTop: 13, gap: 10 }}>
        <Text style={S.label}>Describe the mismatch</Text>
        <TextInput accessibilityLabel="Cash discrepancy details" placeholder="e.g. Customer paid a different amount…" placeholderTextColor={C.subtle}
          multiline value={cashDescription} onChangeText={setCashDescription} style={[S.input, { minHeight: 90, textAlignVertical: 'top' }]} />
        <Button label={wallet.cashReviewPending ? 'Review already requested' : 'Submit cash review request'} disabled={wallet.cashReviewPending} onPress={() => {
          dispatch({ type: 'REQUEST_CASH_REVIEW', description: cashDescription });
        }} />
        <Text style={S.meta}>Admins review and reconcile cash; this form never edits the cash balance.</Text>
      </View> : null}
      {wallet.cashReviewPending ? <Tag label="Cash review pending (demo)" tone="orange" /> : null}
    </Panel>
    <Panel title="Recent transactions" action={
      <Pressable accessibilityRole="button" accessibilityLabel="View all transactions" onPress={() => setShowAll(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontWeight: '800', color: C.darkGreen }}>{showAll ? 'Show less' : 'View all →'}</Text>
      </Pressable>
    }>
      {wallet.transactions.slice(0, showAll ? undefined : 3).map(tx => <TxRow key={tx.id} tx={tx} />)}
    </Panel>
    <Panel title="Wallet insights">
      <Text style={S.meta}>Indicative available balance · last 7 days</Text>
      <View style={{ flexDirection: 'row', height: 135, alignItems: 'flex-end', gap: 9, marginVertical: 10 }}>
        {[37, 53, 48, 72, 61, 79, 93].map((amount, index) => <View key={index} style={{ flex: 1, gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: index === 6 ? C.darkGreen : '#66C996', height: amount, width: '82%', borderRadius: 7 }} />
          <Text style={S.meta}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</Text>
        </View>)}
      </View>
    </Panel>
    <Panel title="Account actions"><View style={{ gap: 9 }}>
      <Button outline label="View Earnings →" onPress={onEarnings} />
      <Button outline label="Payout and settlement history →" onPress={onPayout} />
    </View></Panel>
    {wallet.lastMessage ? <Notice title="Cash / wallet preview status" body={wallet.lastMessage} tone={wallet.lastMessage.includes('invalid') ? 'red' : 'blue'} /> : null}
  </View>;
}
type PayoutTab = 'Withdraw' | 'Payout History' | 'All Transactions' | 'Failed';
function PayoutRow({ payout, onSelect }: { payout: DemoPayout; onSelect: (id: string) => void }) {
  return <View style={{ paddingVertical: 13, borderBottomColor: C.border, borderBottomWidth: 1 }}>
    <View style={S.split}><Text style={[S.text, { fontWeight: '900' }]}>{kes(payout.amount)}</Text><Tag label={payout.status} tone={payout.status === 'Completed' ? 'green' : payout.status === 'Failed' ? 'red' : 'orange'} /></View>
    <Space h={5} />
    <Text style={S.meta}>{payout.createdAt} · M-PESA {payout.phone}</Text>
    <Text style={S.meta}>Ref: {payout.reference}</Text>
    <Space h={8} />
    <Button outline label="View transaction receipt" onPress={() => onSelect(payout.id)} />
  </View>;
}
export function PayoutsScreen({ wallet, dispatch, onWallet, onEarnings }: {
  wallet: WalletState; dispatch: React.Dispatch<WalletAction>; onWallet: Move; onEarnings: Move;
}) {
  const [tab, setTab] = useState<PayoutTab>('Withdraw');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(wallet.payoutPhone);
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState('');
  const [selectedPayout, setSelectedPayout] = useState<string | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<'All' | 'Earnings' | 'Payout' | 'Cash collected'>('All');
  const selected = wallet.payouts.find(p => p.id === selectedPayout);
  const shownTx = useMemo(() => wallet.transactions.filter(tx => transactionFilter === 'All' || tx.kind === transactionFilter), [wallet.transactions, transactionFilter]);
  function requestPayout() {
    const error = validatePayout(amount, phone, wallet.available, confirmed);
    if (error) { setLocalError(error); return; }
    dispatch({ type: 'REQUEST_PAYOUT', amountText: amount, phone, confirmed });
    setLocalError(''); setAmount(''); setConfirmed(false); setTab('Payout History');
  }
  return <View style={{ gap: 15 }}>
    <Head num={18} title="Payouts & Transactions" description="M-PESA requests and settlement history" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Metric title="Available balance" value={kes(wallet.available)} subtitle="Eligible to request" />
      <Metric title="Pending payouts" value={kes(wallet.pendingPayouts)} tone="blue" subtitle="Processing, not completed" />
      <Metric title="Period earnings" value={kes(wallet.totalEarned)} tone="orange" subtitle="Not all withdrawable" />
    </View>
    <Panel title="Payout workspace">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {(['Withdraw', 'Payout History', 'All Transactions', 'Failed'] as const).map(value =>
          <MiniButton key={value} title={value} active={tab === value} onPress={() => { setTab(value); setSelectedPayout(null); }} />)}
      </View>
      <Space />
      {tab === 'Withdraw' ? <>
        <Notice title="M-PESA • simulated withdrawal" body="This screen only adds a local demo payout request. No phone number is verified and no money is transferred." tone="blue" />
        <Space />
        <Text style={S.label}>Amount (KSh)</Text>
        <View style={[S.row, { gap: 8 }]}>
          <TextInput keyboardType="decimal-pad" accessibilityLabel="Withdrawal amount" placeholder="Enter amount" placeholderTextColor={C.subtle} value={amount} onChangeText={setAmount} style={[S.input, { flex: 1 }]} />
          <Button outline label="Max" onPress={() => { setAmount(String(wallet.available)); setLocalError(''); }} />
        </View>
        <Text style={[S.meta, { marginTop: 6 }]}>Preview minimum: KSh 100 · Maximum: available demo balance</Text>
        <Space />
        <Text style={S.label}>M-PESA phone number</Text>
        <TextInput keyboardType="phone-pad" accessibilityLabel="M-PESA recipient phone" placeholder="07xx xxx xxx" placeholderTextColor={C.subtle} value={phone} onChangeText={setPhone} style={S.input} />
        <Space />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} onPress={() => setConfirmed(v => !v)} style={[S.row, { gap: 12, minHeight: 52 }]}>
          <Text style={{ color: C.darkGreen, fontSize: 22 }}>{confirmed ? '☑' : '□'}</Text>
          <Text style={[S.sub, { flex: 1 }]}>I have checked the recipient and amount. Create a demonstration payout request.</Text>
        </Pressable>
        {localError ? <Notice title="Cannot request payout" body={localError} tone="red" /> : null}
        <Space h={8} />
        <Button label="Request Demo M-PESA Payout →" onPress={requestPayout} />
        <Text style={[S.meta, { marginTop: 10 }]}>Production payout charges, limits, and timing depend on DeeToo policy and the payment provider.</Text>
      </> : tab === 'Payout History' || tab === 'Failed' ? <>
        <Text style={S.meta}>{tab === 'Failed' ? 'Failed demo payouts and their references' : 'Historical and new demonstration payout requests'}</Text>
        {wallet.payouts.filter(p => tab !== 'Failed' || p.status === 'Failed').length === 0 ? <Notice title="Nothing to show" body="No payouts match this filter." tone="blue" /> : null}
        {wallet.payouts.filter(p => tab !== 'Failed' || p.status === 'Failed').map(p => <PayoutRow key={p.id} payout={p} onSelect={setSelectedPayout} />)}
      </> : <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {(['All', 'Earnings', 'Payout', 'Cash collected'] as const).map(type => <MiniButton key={type} title={type} active={transactionFilter === type} onPress={() => setTransactionFilter(type)} />)}
        </View>
        {shownTx.length === 0 ? <Notice title="No transactions" body="There are no example transactions matching this category." tone="blue" /> : shownTx.map(tx =>
          <View key={tx.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={S.split}><Text style={[S.text, { fontWeight: '800', flex: 1 }]}>{tx.title}</Text><Text style={[S.text, { fontWeight: '800', color: tx.amount >= 0 ? C.darkGreen : C.red }]}>{tx.amount > 0 ? '+' : ''}{kes(tx.amount)}</Text></View>
            <Text style={S.meta}>{tx.date} · {tx.kind}</Text><Text style={S.meta}>Ref: {tx.reference} · {tx.status}</Text>
          </View>)}
      </>}
    </Panel>
    {selected ? <Panel title="Demo payout receipt">
      <View style={S.split}><Text style={S.sub}>Reference</Text><Text style={[S.text, { fontWeight: '800' }]}>{selected.reference}</Text></View>
      <Space h={8} />
      <View style={S.split}><Text style={S.sub}>Amount</Text><Text style={S.text}>{kes(selected.amount)}</Text></View>
      <Space h={8} />
      <View style={S.split}><Text style={S.sub}>Status</Text><Tag label={selected.status} tone={selected.status === 'Completed' ? 'green' : selected.status === 'Failed' ? 'red' : 'orange'} /></View>
      <Space h={8} /><Text style={S.meta}>This is not a real Safaricom receipt. It must never be represented as proof of payment.</Text>
      {selected.status === 'Processing' ? <View style={{ gap: 9, marginTop: 13 }}>
        <Button outline label="Simulate provider success" onPress={() => dispatch({ type: 'SIMULATE_PAYOUT_RESULT', id: selected.id, result: 'Completed' })} />
        <Button outline label="Simulate provider failure / refund" onPress={() => dispatch({ type: 'SIMULATE_PAYOUT_RESULT', id: selected.id, result: 'Failed' })} />
      </View> : null}
      <Space /><Button outline label="Close details" onPress={() => setSelectedPayout(null)} />
    </Panel> : null}
    <Panel title="Safety & reconciliation">
      <Notice title="Authoritative backend integration comes later" body="A request is not a completed payout. Failure refunds and settlement references in this preview update only local mock state. No reconciliation-all action is provided." tone="orange" />
    </Panel>
    {wallet.lastMessage ? <Notice title="Payout activity" body={wallet.lastMessage} tone={wallet.lastMessage.includes('failed') ? 'orange' : 'blue'} /> : null}
    <View style={{ flexDirection: 'row', gap: 9 }}>
      <View style={{ flex: 1 }}><Button outline label="← Wallet" onPress={onWallet} /></View>
      <View style={{ flex: 1 }}><Button outline label="Earnings" onPress={onEarnings} /></View>
    </View>
  </View>;
}
