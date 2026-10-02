/**
 * Shared building blocks. Every screen is made from these, so the look stays consistent.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, GRADIENTS, RADIUS, SPACE, bandColor, useTheme } from '@/theme';
import { bandShort } from '@/lib/format';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
export const success = () => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };

/* ------------------------------------------------------------------ text */
type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'label' | 'number';
const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: FONT.heavy, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: FONT.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontFamily: FONT.bold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  h3: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FONT.medium, fontSize: 11.5, lineHeight: 15 },
  label: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
  number: { fontFamily: FONT.heavy, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
};

export function Text({ v = 'body', color, muted, faint, center, style, children, numberOfLines, onPress }: {
  v?: Variant; color?: string; muted?: boolean; faint?: boolean; center?: boolean; style?: StyleProp<TextStyle>;
  children: React.ReactNode; numberOfLines?: number; onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <RNText numberOfLines={numberOfLines} onPress={onPress ? () => { tap(); onPress(); } : undefined}
      style={[VARIANTS[v], { color: color ?? (faint ? c.ink3 : muted ? c.ink2 : c.ink) }, center && { textAlign: 'center' }, style]}>
      {children}
    </RNText>
  );
}

/* ---------------------------------------------------------------- layout */
export function Screen({ children, scroll = true, padded = true, header, refreshControl, bottomInset = true }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; header?: React.ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl']; bottomInset?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const body = <View style={[padded && { paddingHorizontal: SPACE.lg }, { paddingBottom: bottomInset ? insets.bottom + 110 : SPACE.xl }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
          {header}
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>{header}{body}</View>
      )}
    </View>
  );
}

/** Fades and rises into place; `i` staggers a list. */
export function Rise({ i = 0, children, style }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Animated.View entering={FadeInDown.delay(Math.min(i, 12) * 55).duration(420)} style={style}>{children}</Animated.View>;
}

export function Card({ children, style, onPress, pad = true, tone }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; pad?: boolean; tone?: string;
}) {
  const { c, isDark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: tone ?? c.surface, borderRadius: RADIUS.lg, padding: pad ? SPACE.lg : 0,
    borderWidth: isDark ? 1 : 0, borderColor: c.line,
    shadowColor: c.shadow, shadowOpacity: isDark ? 0 : 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: isDark ? 0 : 2,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [base, style, pressed && { transform: [{ scale: 0.985 }], opacity: 0.94 }]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, gap = SPACE.sm, style, wrap }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function SectionTitle({ title, sub, right, style }: { title: string; sub?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: SPACE.xl, marginBottom: SPACE.md }, style]}>
      <View style={{ flex: 1 }}>
        <Text v="h2">{title}</Text>
        {sub ? <Text v="small" muted style={{ marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const Gap = ({ h = SPACE.md }: { h?: number }) => <View style={{ height: h }} />;

/* --------------------------------------------------------------- controls */
export function Button({ title, onPress, kind = 'primary', icon, loading, disabled, style, small, gradient }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light'; icon?: IconName;
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean; gradient?: readonly [string, string, ...string[]];
}) {
  const { c } = useTheme();
  const colors = {
    primary: { bg: c.brand, fg: '#fff', border: 'transparent' },
    secondary: { bg: c.brandSoft, fg: c.brand, border: 'transparent' },
    ghost: { bg: 'transparent', fg: c.ink2, border: c.line },
    danger: { bg: c.danger, fg: '#fff', border: 'transparent' },
    light: { bg: 'rgba(255,255,255,0.18)', fg: '#fff', border: 'rgba(255,255,255,0.35)' },
  }[kind];
  const h = small ? 38 : 52;
  const inner = (
    <Row gap={8} style={{ justifyContent: 'center', height: h, paddingHorizontal: small ? 14 : 20 }}>
      {loading ? <ActivityIndicator color={colors.fg} /> : icon ? <Feather name={icon} size={small ? 15 : 18} color={colors.fg} /> : null}
      <Text v={small ? 'small' : 'h3'} color={colors.fg} style={{ fontFamily: FONT.semibold }}>{title}</Text>
    </Row>
  );
  const grad = gradient ?? (kind === 'primary' ? GRADIENTS.lake : null);
  return (
    <Pressable disabled={disabled || loading} onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [{ borderRadius: RADIUS.pill, overflow: 'hidden', opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        borderWidth: 1, borderColor: colors.border, backgroundColor: grad ? undefined : colors.bg }, style]}>
      {grad ? <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{inner}</LinearGradient> : inner}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, bg, size = 40, badge }: { icon: IconName; onPress: () => void; color?: string; bg?: string; size?: number; badge?: number }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} hitSlop={8}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg ?? c.surface2, opacity: pressed ? 0.7 : 1 })}>
      <Feather name={icon} size={size * 0.45} color={color ?? c.ink} />
      {badge ? (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text v="caption" color="#fff" style={{ fontSize: 10 }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color, icon, count }: { label: string; active?: boolean; onPress?: () => void; color?: string; icon?: IconName; count?: number }) {
  const { c } = useTheme();
  const tint = color ?? c.brand;
  return (
    <Pressable onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: RADIUS.pill,
        backgroundColor: active ? tint : c.surface, borderWidth: 1, borderColor: active ? tint : c.line, opacity: pressed ? 0.8 : 1,
      })}>
      {icon ? <Feather name={icon} size={14} color={active ? '#fff' : c.ink2} /> : null}
      <Text v="small" color={active ? '#fff' : c.ink} style={{ fontFamily: FONT.semibold }}>{label}</Text>
      {count !== undefined ? <Text v="caption" color={active ? 'rgba(255,255,255,0.85)' : c.ink3}>{count}</Text> : null}
    </Pressable>
  );
}

export function Input({ label, icon, error, style, ...props }: TextInputProps & { label?: string; icon?: IconName; error?: string | null }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={style as StyleProp<ViewStyle>}>
      {label ? <Text v="label" muted style={{ marginBottom: 6 }}>{label}</Text> : null}
      <Row style={{ backgroundColor: c.surface, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: error ? c.danger : focus ? c.brand : c.line, paddingHorizontal: 14, height: 52 }}>
        {icon ? <Feather name={icon} size={18} color={focus ? c.brand : c.ink3} /> : null}
        <TextInput placeholderTextColor={c.ink3} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, fontFamily: FONT.medium, fontSize: 15, color: c.ink, height: '100%', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} {...props} />
      </Row>
      {error ? <Text v="small" color={c.danger} style={{ marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

/** A search field with a search button; filters as you type. */
export function SearchBar({ value, onChange, placeholder = 'Search', onSubmit }: { value: string; onChange: (s: string) => void; placeholder?: string; onSubmit?: () => void }) {
  const { c } = useTheme();
  return (
    <Row style={{ backgroundColor: c.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: c.line, paddingLeft: 16, paddingRight: 5, height: 50 }}>
      <Feather name="search" size={18} color={c.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.ink3} returnKeyType="search"
        onSubmitEditing={onSubmit} autoCorrect={false}
        style={{ flex: 1, fontFamily: FONT.medium, fontSize: 15, color: c.ink, height: '100%', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
      {value ? <IconButton icon="x" size={32} onPress={() => onChange('')} /> : null}
      <Pressable onPress={() => { tap(); onSubmit?.(); }} style={{ backgroundColor: c.brand, borderRadius: RADIUS.pill, height: 40, paddingHorizontal: 16, justifyContent: 'center' }}>
        <Text v="small" color="#fff" style={{ fontFamily: FONT.semibold }}>Search</Text>
      </Pressable>
    </Row>
  );
}

/* --------------------------------------------------------------- display */
export function BandPill({ band, score, size = 'md' }: { band: number | null | undefined; score?: number | null; size?: 'sm' | 'md' }) {
  const col = bandColor(band);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: col + '22', borderRadius: RADIUS.pill, paddingHorizontal: size === 'sm' ? 8 : 11, height: size === 'sm' ? 24 : 28 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col }} />
      <Text v={size === 'sm' ? 'caption' : 'small'} color={col} style={{ fontFamily: FONT.bold }}>
        {band ? `${band} · ${bandShort(band)}` : 'No score'}{score !== undefined && score !== null ? `  ${score.toFixed(1)}` : ''}
      </Text>
    </View>
  );
}

export function Badge({ label, color, icon }: { label: string; color: string; icon?: IconName }) {
  return (
    <Row gap={5} style={{ backgroundColor: color + '1F', borderRadius: RADIUS.pill, paddingHorizontal: 10, height: 26, alignSelf: 'flex-start' }}>
      {icon ? <Feather name={icon} size={12} color={color} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />}
      <Text v="caption" color={color} style={{ fontFamily: FONT.bold }}>{label}</Text>
    </Row>
  );
}

/** Review status of an uploaded survey. */
export function StatusBadge({ status }: { status: string }) {
  const { c } = useTheme();
  const map: Record<string, [string, string]> = { submitted: ['Waiting review', c.warning], approved: ['Approved', c.success], rejected: ['Rejected', c.danger] };
  const [label, color] = map[status] ?? [status, c.ink3];
  return <Badge label={label} color={color} />;
}

/** Round icon on a soft tinted disc. */
export function IconDisc({ icon, color, size = 40 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '1F', alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={size * 0.48} color={color} />
    </View>
  );
}

export function StatTile({ label, value, sub, icon, color, i = 0 }: { label: string; value: string; sub?: string; icon: IconName; color: string; i?: number }) {
  return (
    <Rise i={i} style={{ flex: 1, minWidth: 150 }}>
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text v="label" muted style={{ flex: 1 }}>{label}</Text>
          <IconDisc icon={icon} color={color} size={34} />
        </Row>
        <CountUp value={value} />
        {sub ? <Text v="small" faint style={{ marginTop: 2 }}>{sub}</Text> : null}
      </Card>
    </Rise>
  );
}

/** Animates a number up from zero when it first appears. */
export function CountUp({ value, v = 'number', color }: { value: string; v?: Variant; color?: string }) {
  const target = parseFloat(value);
  const decimals = (value.split('.')[1] ?? '').replace(/\D.*$/, '').length;
  const suffix = value.replace(/^[\d.,-]+/, '');
  const [n, setN] = useState(isFinite(target) ? 0 : target);
  useEffect(() => {
    if (!isFinite(target)) return;
    let raf = 0; const start = Date.now(); const dur = 900;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setN(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <Text v={v} color={color} style={{ marginTop: 6 }}>{isFinite(target) ? n.toFixed(decimals) + suffix : value}</Text>;
}

export function Progress({ value, color, height = 8, track }: { value: number; color?: string; height?: number; track?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? c.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: height, backgroundColor: color ?? c.brand }} />
    </View>
  );
}

export function ListRow({ title, sub, left, right, onPress, chevron = true }: {
  title: string; sub?: string; left?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; chevron?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress ? () => { tap(); onPress(); } : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
      {left}
      <View style={{ flex: 1 }}>
        <Text v="h3" numberOfLines={1}>{title}</Text>
        {sub ? <Text v="small" muted numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right}
      {onPress && chevron ? <Feather name="chevron-right" size={18} color={c.ink3} /> : null}
    </Pressable>
  );
}

export const Divider = () => { const { c } = useTheme(); return <View style={{ height: 1, backgroundColor: c.line }} />; };

export function Empty({ icon = 'inbox', title, sub, action }: { icon?: IconName; title: string; sub?: string; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
      <IconDisc icon={icon} color={c.brand} size={64} />
      <Text v="h3" center>{title}</Text>
      {sub ? <Text v="small" muted center style={{ maxWidth: 320 }}>{sub}</Text> : null}
      {action}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator size="large" color={c.brand} />
      <Text v="small" muted>{label}</Text>
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { c } = useTheme();
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: c.danger, marginTop: SPACE.lg }}>
      <Row><Feather name="wifi-off" size={18} color={c.danger} /><Text v="h3" style={{ flex: 1 }}>Could not load this</Text></Row>
      <Text v="small" muted style={{ marginTop: 6 }}>{msg}</Text>
      {onRetry ? <Button title="Try again" kind="secondary" small icon="refresh-cw" onPress={onRetry} style={{ marginTop: 12, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

/** A panel that slides up from the bottom. */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '88%', paddingBottom: insets.bottom + 12, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: c.line }} /></View>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md }}>
          <Text v="h2" style={{ flex: 1 }}>{title}</Text>
          <IconButton icon="x" onPress={onClose} />
        </Row>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg }}>{children}</ScrollView>
        {footer ? <View style={{ paddingHorizontal: SPACE.lg, paddingTop: 8 }}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ toast */
let showToast: ((msg: string, kind?: 'ok' | 'error') => void) | null = null;
export const toast = (msg: string, kind: 'ok' | 'error' = 'ok') => showToast?.(msg, kind);

export function ToastHost() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'error'; id: number } | null>(null);
  useEffect(() => {
    showToast = (msg, kind = 'ok') => setT({ msg, kind, id: Date.now() });
    return () => { showToast = null; };
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 2800);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <Animated.View key={t.id} entering={FadeInDown.duration(250)} pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 10, alignItems: 'center', zIndex: 100 }}>
      <Row style={{ backgroundColor: t.kind === 'ok' ? c.ink : c.danger, borderRadius: RADIUS.pill, paddingHorizontal: 18, paddingVertical: 12, maxWidth: 520 }}>
        <Feather name={t.kind === 'ok' ? 'check-circle' : 'alert-circle'} size={18} color={c.bg} />
        <Text v="small" color={c.bg} style={{ fontFamily: FONT.semibold, flexShrink: 1 }}>{t.msg}</Text>
      </Row>
    </Animated.View>
  );
}

export const styles = StyleSheet.create({
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
});
