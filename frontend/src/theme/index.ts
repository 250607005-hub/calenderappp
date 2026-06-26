/**
 * Design tokens — derived from /app/design_guidelines.json
 * Moss Green personality, light mode primary, dark mode supported.
 */

export const colors = {
  surface: '#FAFAFA',
  onSurface: '#111111',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#1A1A1A',
  surfaceTertiary: '#F0F0F0',
  onSurfaceTertiary: '#4A4A4A',
  surfaceInverse: '#1A1A1A',
  onSurfaceInverse: '#FFFFFF',

  brand: '#2E4F3B',
  brandPrimary: '#3A6B4D',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#E8F2EC',
  onBrandSecondary: '#2E4F3B',
  brandTertiary: '#D1E6D9',
  onBrandTertiary: '#1D3627',

  success: '#287D3C',
  onSuccess: '#FFFFFF',
  warning: '#D97706',
  onWarning: '#FFFFFF',
  error: '#DA291C',
  onError: '#FFFFFF',

  border: '#E5E5E5',
  borderStrong: '#CCCCCC',
  divider: '#F0F0F0',
  muted: '#6B6B6B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  // Display sizes used on hero/auth
  display: 32,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
} as const;
