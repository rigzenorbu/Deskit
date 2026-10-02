/**
 * Ladakh scenery used in headers: a gradient sky, layered mountain ranges, a string of
 * prayer flags and a sun. Pure SVG, so it is crisp at any size and costs nothing to load.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, Polygon, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS, PRAYER_FLAGS, useTheme } from '@/theme';

/**
 * The project logo. A placeholder for now: replace assets/images/logo.png (square, 1024×1024)
 * with the real logo and it changes everywhere — sign-in, headers, app icon and splash
 * (see the README for the icon files).
 */
export function Logo({ size = 48, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', backgroundColor: '#ffffff22' }, style]}>
      <Image source={require('@/assets/images/logo.png')} style={{ width: size, height: size }} contentFit="cover" />
    </View>
  );
}

/** Layered ranges: far peaks with snow caps, then nearer, darker ridges. */
export function Mountains({ width, height = 120, tint = '#ffffff' }: { width: number; height?: number; tint?: string }) {
  const w = width, h = height;
  return (
    <Svg width={w} height={h} viewBox={`0 0 400 120`} preserveAspectRatio="none">
      <Defs>
        <SvgGradient id="far" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tint} stopOpacity="0.32" />
          <Stop offset="1" stopColor={tint} stopOpacity="0.08" />
        </SvgGradient>
        <SvgGradient id="near" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tint} stopOpacity="0.22" />
          <Stop offset="1" stopColor={tint} stopOpacity="0.04" />
        </SvgGradient>
      </Defs>
      <Path d="M0 120 L0 70 L40 42 L70 60 L110 18 L150 55 L185 34 L225 62 L262 26 L300 58 L338 30 L372 52 L400 40 L400 120 Z" fill="url(#far)" />
      {/* snow caps */}
      <Path d="M110 18 L100 30 L108 28 L114 33 L121 28 Z M262 26 L252 37 L260 35 L266 40 L273 35 Z M338 30 L330 39 L337 37 L342 41 L348 38 Z" fill={tint} fillOpacity="0.55" />
      <Path d="M0 120 L0 88 L55 66 L95 86 L140 60 L190 90 L240 70 L290 92 L340 72 L400 90 L400 120 Z" fill="url(#near)" />
    </Svg>
  );
}

/** A curved string of prayer flags in the five traditional colours. */
export function PrayerFlags({ width, count = 15 }: { width: number; count?: number }) {
  const sag = 16;
  const y = (x: number) => 6 + sag * 4 * (x / width) * (1 - x / width);
  return (
    <Svg width={width} height={44}>
      <Path d={`M0 6 Q ${width / 2} ${6 + sag * 2} ${width} 6`} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={1} fill="none" />
      {Array.from({ length: count }, (_, i) => {
        const x = ((i + 0.7) / (count + 0.4)) * width;
        const top = y(x);
        return (
          <G key={i}>
            <Polygon points={`${x - 7},${top} ${x + 7},${top} ${x + 6},${top + 15} ${x - 6},${top + 14}`}
              fill={PRAYER_FLAGS[i % 5]} fillOpacity={0.9} />
          </G>
        );
      })}
    </Svg>
  );
}

/**
 * The big header used at the top of main screens: sky gradient, sun, flags, mountains,
 * then whatever content is passed in on top.
 */
export function Hero({ children, colors, compact = false, flags = true }: {
  children: React.ReactNode; colors?: readonly [string, string, ...string[]]; compact?: boolean; flags?: boolean;
}) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = React.useState(390);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', marginBottom: 6 }}>
      <LinearGradient colors={colors ?? (isDark ? GRADIENTS.heroDark : GRADIENTS.hero)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + (compact ? 10 : 16), paddingBottom: compact ? 22 : 34 }}>
        <Svg width={w} height={160} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Circle cx={w - 60} cy={insets.top + 40} r={46} fill="#FFD27A" fillOpacity={0.16} />
          <Circle cx={w - 60} cy={insets.top + 40} r={26} fill="#FFD27A" fillOpacity={0.28} />
        </Svg>
        {flags ? <View style={{ position: 'absolute', top: insets.top + 2, left: 0 }}><PrayerFlags width={w} /></View> : null}
        <View style={{ position: 'absolute', bottom: 0, left: 0 }}><Mountains width={w} height={compact ? 70 : 110} /></View>
        {/* above the scenery: on the web, positioned decorations would otherwise paint over the text */}
        <View style={{ paddingHorizontal: 18, paddingTop: flags ? 34 : 4, maxWidth: 1100, width: '100%', alignSelf: 'center', position: 'relative', zIndex: 1 }}>{children}</View>
      </LinearGradient>
    </View>
  );
}
