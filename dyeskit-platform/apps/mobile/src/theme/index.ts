/**
 * Design tokens. The palette is drawn from Ladakh: night-sky indigo, Pangong turquoise,
 * apricot, prayer-flag red, gold and green, and snow. Every colour used in the app is here.
 */
import { useColorScheme } from 'react-native';
import type { DimensionId, DistrictId } from '@dyeskit/core';

const light = {
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surface2: '#EEF1F8',
  ink: '#121A33',
  ink2: '#4A5470',
  ink3: '#8590AA',
  line: '#E1E6F0',
  brand: '#1F6FEB',
  brandDeep: '#16245A',
  brandSoft: '#E5EEFF',
  lake: '#14A3A8',
  apricot: '#F59E4B',
  danger: '#E2554F',
  warning: '#E9A23B',
  success: '#2AA676',
  overlay: 'rgba(12,18,40,0.45)',
  shadow: '#1B2550',
};
const dark: typeof light = {
  bg: '#0B1022',
  surface: '#141B33',
  surface2: '#1C2443',
  ink: '#EEF2FF',
  ink2: '#B4BDD6',
  ink3: '#7480A0',
  line: '#26304F',
  brand: '#5B9BFF',
  brandDeep: '#0A1230',
  brandSoft: '#1D2C55',
  lake: '#2CC5C9',
  apricot: '#FFB46B',
  danger: '#FF7A73',
  warning: '#FFC15C',
  success: '#3FD19A',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};
export type Palette = typeof light;

/** One colour per well-being dimension, used everywhere that dimension appears. */
export const DIM_COLORS: Record<DimensionId, string> = {
  phy: '#EF5D60',
  fin: '#F0A030',
  emo: '#E064AA',
  soc: '#8A63F0',
  env: '#22B07D',
  int: '#3B8CF0',
  spi: '#F27A36',
};

/** Feather icon names for each dimension. */
export const DIM_ICONS: Record<DimensionId, 'heart' | 'briefcase' | 'smile' | 'users' | 'droplet' | 'book-open' | 'sun'> = {
  phy: 'heart', fin: 'briefcase', emo: 'smile', soc: 'users', env: 'droplet', int: 'book-open', spi: 'sun',
};

/** Band colours: deep red (band 1) through amber to green (band 7). */
export const BAND_COLORS: Record<number, string> = {
  1: '#C23B3B', 2: '#E0613A', 3: '#EE9A2E', 4: '#E3B530', 5: '#7CC35A', 6: '#2BAE7E', 7: '#11998E',
};
export const bandColor = (band: number | null | undefined) => (band ? BAND_COLORS[band] : '#8590AA');

/** Score (0–100) to a colour on the same ramp as the bands. */
export const scoreColor = (score: number | null | undefined) => {
  if (score === null || score === undefined) return '#8590AA';
  if (score < 15) return BAND_COLORS[1];
  if (score < 29) return BAND_COLORS[2];
  if (score < 43) return BAND_COLORS[3];
  if (score < 57) return BAND_COLORS[4];
  if (score < 71) return BAND_COLORS[5];
  if (score < 85) return BAND_COLORS[6];
  return BAND_COLORS[7];
};

/** Severity of an insight: share of households affected. */
export const LEVEL_COLOR = { critical: '#D93F3F', serious: '#EE8A2E', watch: '#D9B12C' } as const;

export const DISTRICT_COLORS: Record<DistrictId, string> = {
  leh: '#3B6CF0', sham: '#F27A36', nubra: '#22B07D', changthang: '#14A3A8', kargil: '#8A63F0', zanskar: '#E064AA', drass: '#EF5D60',
};
export const districtColor = (id: string) => DISTRICT_COLORS[id as DistrictId] ?? '#8590AA';

/** Gradients for hero areas: dawn over the Indus valley, and night over Pangong. */
export const GRADIENTS = {
  hero: ['#16245A', '#1F4FB8', '#14A3A8'] as const,
  heroDark: ['#060A1A', '#122459', '#0E6E73'] as const,
  sunrise: ['#F59E4B', '#E2554F'] as const,
  lake: ['#14A3A8', '#1F6FEB'] as const,
  violet: ['#8A63F0', '#3B8CF0'] as const,
  success: ['#22B07D', '#14A3A8'] as const,
};

/** The five prayer-flag colours: blue sky, white air, red fire, green water, yellow earth. */
export const PRAYER_FLAGS = ['#2F6FE4', '#F4F6FB', '#E2554F', '#22B07D', '#F2C230'];

export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
};

export const RADIUS = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: isDark ? dark : light, isDark };
}
