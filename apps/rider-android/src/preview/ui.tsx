import React from 'react';
import {
  Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput,
  TextInputProps, View,
} from 'react-native';
import type { RiderTab, RiderScreen } from './phase1-model';

// Exactly aligned to packages/ui/src/tokens.ts in the shared DeeToo design system.
export const C = {
  green: '#00BF62', darkGreen: '#0B6B43', greenDeep: '#063D23',
  mint: '#DDFBEA', canvas: '#F6FAF7', surface: '#FFFFFF',
  ink: '#10231A', muted: '#43564B', subtle: '#718079',
  border: '#D8E8DE', navy: '#0C2338', yellow: '#F4CB28',
  orange: '#F39A3D', blue: '#1A73E8', paleBlue: '#E9F2FF',
  red: '#BA1A1A', paleRed: '#FFF0EE', paleOrange: '#FFF4E6',
};
export const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.canvas },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  split: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderColor: C.border, borderRadius: 13, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 15, color: C.ink },
  h1: { color: C.ink, fontSize: 27, lineHeight: 34, fontWeight: '800' },
  h2: { color: C.ink, fontWeight: '800', fontSize: 19, lineHeight: 26 },
  sub: { color: C.muted, fontSize: 14, lineHeight: 21 },
  meta: { fontSize: 12, color: C.subtle, lineHeight: 18 },
  text: { fontSize: 14, lineHeight: 21, color: C.ink },
  button: { minHeight: 52, backgroundColor: C.darkGreen, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  buttonText: { fontWeight: '800', fontSize: 15, color: '#fff' },
  outline: { minHeight: 49, borderWidth: 1.5, borderColor: C.darkGreen, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  outlineText: { color: C.darkGreen, fontWeight: '800', fontSize: 14 },
  tinyBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.mint },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
});
type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; outline?: boolean; color?: string; icon?: string };
export function Button({ label, onPress, disabled, outline, color, icon }: ButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [
    outline ? S.outline : S.button,
    !outline && color ? { backgroundColor: color } : null,
    pressed && { opacity: 0.86 }, disabled && { opacity: 0.43 },
  ]}>
    {icon ? <Text style={[outline ? S.outlineText : S.buttonText, { fontSize: 18 }]}>{icon}</Text> : null}
    <Text style={outline ? S.outlineText : S.buttonText}>{label}</Text>
  </Pressable>;
}
type FieldProps = TextInputProps & { label: string; hint?: string };
export function Field({ label, hint, ...props }: FieldProps) {
  return <View style={{ gap: 3 }}><Text style={S.label}>{label}</Text>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor="#82958A" style={[S.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />
    {hint ? <Text style={S.meta}>{hint}</Text> : null}
  </View>;
}
export function Panel({ children, title, action }: { children: React.ReactNode; title?: string; action?: React.ReactNode }) {
  return <View style={S.card}>
    {title ? <View style={[S.split, { marginBottom: 12 }]}><Text style={S.h2}>{title}</Text>{action}</View> : null}
    {children}
  </View>;
}
export function Tag({ label, tone = 'green' }: { label: string; tone?: 'green' | 'orange' | 'red' | 'neutral' }) {
  const color = tone === 'orange' ? C.orange : tone === 'red' ? C.red : tone === 'neutral' ? C.muted : C.darkGreen;
  const bg = tone === 'orange' ? C.paleOrange : tone === 'red' ? C.paleRed : tone === 'neutral' ? '#EEF2F0' : C.mint;
  return <View style={{ backgroundColor: bg, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' }}>
    <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{label}</Text>
  </View>;
}
export function Notice({ title, body, tone = 'green' }: { title: string; body: string; tone?: 'green' | 'orange' | 'red' | 'blue' }) {
  const bg = tone === 'orange' ? C.paleOrange : tone === 'red' ? C.paleRed : tone === 'blue' ? C.paleBlue : C.mint;
  return <View accessibilityRole="alert" style={{ padding: 13, borderRadius: 15, backgroundColor: bg, gap: 4 }}>
    <Text style={{ color: C.ink, fontWeight: '800', fontSize: 14 }}>{title}</Text>
    <Text style={S.sub}>{body}</Text>
  </View>;
}
export function Brand({ light = false }: { light?: boolean }) {
  return <View accessible accessibilityLabel="DeeToo Rush" style={{ alignSelf: 'flex-start' }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 29, fontWeight: '900', letterSpacing: -1.4, color: light ? '#fff' : C.ink }}>DeeToo</Text>
      <Text style={{ fontSize: 29, fontWeight: '900', letterSpacing: -1.4, color: C.green }}>Rush</Text>
    </View>
    <Text style={{ fontSize: 11, fontStyle: 'italic', marginTop: -3, fontWeight: '700', color: light ? '#EAF7EE' : C.muted }}>▰▰▰ Faster. Closer. Together.</Text>
  </View>;
}
export function Header({ title, subtitle, onBack, right }: { title?: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  return <View style={{ backgroundColor: C.navy, paddingHorizontal: 18, paddingTop: 15, paddingBottom: 19 }}>
    <View style={S.split}>
      {onBack ? <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={onBack} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 29 }}>‹</Text></Pressable> : null}
      <Brand light />
      {right || <View style={{ width: 44 }} />}
    </View>
    {title ? <View style={{ marginTop: 18, gap: 4 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>{title}</Text>
      {subtitle ? <Text style={{ color: '#E4F3EA', lineHeight: 19, fontSize: 13 }}>{subtitle}</Text> : null}
    </View> : null}
  </View>;
}
export function HeroRider({ title, sub }: { title: string; sub: string }) {
  return <View style={{ backgroundColor: C.greenDeep, padding: 17, borderRadius: 22, overflow: 'hidden', minHeight: 164 }}>
    <View style={{ width: 175, height: 175, borderRadius: 110, position: 'absolute', right: -35, top: -20, backgroundColor: C.darkGreen, borderWidth: 10, borderColor: C.yellow, opacity: 0.9 }} />
    <View style={{ position: 'absolute', right: 28, top: 26, width: 96, height: 110, borderRadius: 24, backgroundColor: '#10231A', borderWidth: 5, borderColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 58, color: C.yellow }}>🛵</Text>
    </View>
    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24, lineHeight: 30, maxWidth: '58%' }}>{title}</Text>
    <Text style={{ color: '#ECF8EF', fontSize: 13, lineHeight: 20, marginTop: 8, maxWidth: '58%' }}>{sub}</Text>
    <View style={{ flexDirection: 'row', gap: 5, marginTop: 13 }}>
      {['DELIVER', 'EARN', 'GROW'].map(x => <Text key={x} style={{ color: C.yellow, fontSize: 9, fontWeight: '800' }}>{x}  •</Text>)}
    </View>
  </View>;
}
export function OnboardingTracker({ step }: { step: number }) {
  const stages = ['Personal', 'Contact', 'Documents', 'Vehicle', 'Review'];
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
    {stages.map((x, i) => <View key={x} style={{ alignItems: 'center', width: '19%', gap: 7 }}>
      <View style={{ width: 32, height: 32, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: i <= step ? C.darkGreen : '#E6EEE9' }}>
        <Text style={{ fontWeight: '800', color: i <= step ? '#fff' : C.muted }}>{i < step ? '✓' : i + 1}</Text>
      </View><Text style={{ textAlign: 'center', color: i === step ? C.darkGreen : C.muted, fontWeight: i === step ? '800' : '500', fontSize: 11 }}>{x}</Text>
    </View>)}
  </View>;
}
export function Metric({ title, value, subtitle, tone = 'green' }: { title: string; value: string; subtitle?: string; tone?: 'green' | 'blue' | 'orange' }) {
  const color = tone === 'blue' ? C.blue : tone === 'orange' ? '#965000' : C.darkGreen;
  const bg = tone === 'blue' ? '#EAF3FF' : tone === 'orange' ? C.paleOrange : '#EAF9F1';
  return <View style={{ flex: 1, minWidth: 126, backgroundColor: bg, padding: 15, borderRadius: 16, gap: 6 }}>
    <Text style={[S.meta, { color: C.ink, fontWeight: '700' }]}>{title}</Text>
    <Text style={{ fontSize: 23, fontWeight: '900', color }}>{value}</Text>
    {subtitle ? <Text style={S.meta}>{subtitle}</Text> : null}
  </View>;
}
export function MapPreview() {
  return <View accessible accessibilityLabel="Illustrative Nairobi service-zone map preview, not live GPS" style={{ backgroundColor: '#ECF1E9', height: 222, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
    <View style={{ position: 'absolute', top: 28, left: -30, height: 11, width: '118%', backgroundColor: '#fff', transform: [{ rotate: '-18deg' }] }} />
    <View style={{ position: 'absolute', top: 90, left: -20, height: 13, width: '122%', backgroundColor: '#fff', transform: [{ rotate: '22deg' }] }} />
    <View style={{ position: 'absolute', top: 140, left: -20, height: 8, width: '120%', backgroundColor: '#fff', transform: [{ rotate: '-7deg' }] }} />
    <View style={{ position: 'absolute', left: 90, top: -20, height: 280, width: 10, backgroundColor: '#fff', transform: [{ rotate: '27deg' }] }} />
    <View style={{ position: 'absolute', right: 65, top: -20, height: 280, width: 13, backgroundColor: '#FFE4A8', transform: [{ rotate: '-25deg' }] }} />
    <View style={{ position: 'absolute', backgroundColor: '#D0EACD', width: 90, height: 67, left: 8, top: 40, borderRadius: 26, opacity: 0.8 }} />
    <View style={{ position: 'absolute', backgroundColor: '#C6E3C8', width: 80, height: 65, right: 13, bottom: 7, borderRadius: 28, opacity: 0.65 }} />
    <Text style={{ position: 'absolute', top: 27, left: '32%', fontSize: 12, color: '#60766A' }}>Westlands</Text>
    <Text style={{ position: 'absolute', top: 87, right: 24, fontSize: 11, color: '#60766A' }}>Eastleigh</Text>
    <Text style={{ position: 'absolute', bottom: 31, left: 22, fontSize: 12, color: '#60766A' }}>Kilimani</Text>
    <Text style={{ position: 'absolute', top: 112, left: '43%', fontWeight: '800', color: C.muted, fontSize: 16 }}>Nairobi</Text>
    <View style={{ position: 'absolute', top: 94, left: '34%', width: 60, height: 60, backgroundColor: 'rgba(26,115,232,.14)', borderRadius: 100, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 12, backgroundColor: C.blue, borderWidth: 4, borderColor: '#fff' }} />
    </View>
    <View style={{ position: 'absolute', right: 10, top: 9, backgroundColor: '#fff', borderRadius: 9, padding: 7 }}><Text style={{ color: C.darkGreen, fontSize: 10, fontWeight: '800' }}>SERVICE ZONE</Text></View>
    <View style={{ position: 'absolute', left: 10, bottom: 8, backgroundColor: '#fff', borderRadius: 9, padding: 7 }}><Text style={{ color: C.muted, fontSize: 10 }}>Map preview • sample location</Text></View>
  </View>;
}
export function BottomNav({ active, onChange }: { active: RiderTab; onChange: (next: RiderTab) => void }) {
  const tabs: { label: RiderTab; icon: string }[] = [
    { label: 'Home', icon: '⌂' }, { label: 'Deliveries', icon: '◈' },
    { label: 'Earnings', icon: '▥' }, { label: 'Inbox', icon: '▤' },
    { label: 'Profile', icon: '♙' },
  ];
  return <View accessibilityRole="tablist" style={{ backgroundColor: '#fff', flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 8 }}>
    {tabs.map(({ label, icon }) => <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active === label }}
      onPress={() => onChange(label)} style={{ flex: 1, minHeight: 54, justifyContent: 'center', alignItems: 'center', gap: 2, borderRadius: 12, backgroundColor: active === label ? C.mint : '#fff' }}>
      <Text style={{ color: active === label ? C.darkGreen : C.muted, fontWeight: '700', fontSize: 24, lineHeight: 26 }}>{icon}</Text>
      <Text numberOfLines={1} style={{ fontWeight: active === label ? '800' : '600', fontSize: 10, color: active === label ? C.darkGreen : C.muted }}>{label}</Text>
    </Pressable>)}
  </View>;
}
export function PrototypeShell({ children, activeTab, onTab, currentScreen, title, subtitle, onBack, right }: {
  children: React.ReactNode; activeTab?: RiderTab; onTab?: (value: RiderTab) => void;
  currentScreen: RiderScreen; title?: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode;
}) {
  return <SafeAreaView style={S.page}>
    <Header title={title} subtitle={subtitle} onBack={onBack} right={right} />
    <ScrollView key={currentScreen + (activeTab || '')} keyboardShouldPersistTaps="handled" contentContainerStyle={S.body}>
      {children}
    </ScrollView>
    {activeTab && onTab ? <BottomNav active={activeTab} onChange={onTab} /> : null}
  </SafeAreaView>;
}
