// src/theme.ts — myai mobile design system
// Aesthetic: Dark terminal + neon pulse. Industrial-minimal.

export const colors = {
  // Base
  bg:         '#0a0a0f',
  bgCard:     '#111118',
  bgElevated: '#16161f',
  bgInput:    '#0e0e16',
  border:     '#1e1e2e',
  borderBright: '#2a2a3e',

  // Accent — electric violet-cyan
  primary:    '#7c6aff',
  primaryDim: '#4a3fa0',
  accent:     '#00d4ff',
  accentDim:  '#005566',
  success:    '#00e5a0',
  warning:    '#ffb800',
  danger:     '#ff4466',

  // Text
  text:       '#e8e8f0',
  textMuted:  '#6b6b8a',
  textDim:    '#3a3a55',

  // Special
  userBubble: '#5b4fe8',
  aiBubble:   '#111118',
  codeBlock:  '#0a0a14',
};

export const fonts = {
  mono:    'SpaceMono',   // code, IDs, numbers
  sans:    'System',      // body text
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const shadows = {
  glow: {
    shadowColor: '#7c6aff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
};
