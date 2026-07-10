/**
 * Identidade visual "Hora do Remédio".
 *
 * Paleta "farmácia de bairro": verde-garrafa (confiança) sobre papel-creme,
 * âmbar reservado para tudo que é hora/alarme. Tipografia arredondada
 * (SF Rounded, nativa do iOS) nos horários — redonda como comprimido.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1F2B25',
    textSecondary: '#5E6B63',
    background: '#F7F4EC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EAE6DB',
    brand: '#175A41',
    onBrand: '#FFFFFF',
    brandSoft: '#DEEDE4',
    accent: '#B36F12',
    accentSoft: '#F6E8CC',
    outline: '#E3DFD3',
    danger: '#B3402C',
  },
  dark: {
    text: '#EDF3EE',
    textSecondary: '#9FAFA4',
    background: '#101612',
    backgroundElement: '#1B231D',
    backgroundSelected: '#273129',
    brand: '#57B98A',
    onBrand: '#0C1A12',
    brandSoft: '#20362A',
    accent: '#E5A84E',
    accentSoft: '#3A2F1B',
    outline: '#2A342C',
    danger: '#E07B62',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  chip: 10,
  card: 20,
  bubble: 999,
} as const;

export const MaxContentWidth = 800;
