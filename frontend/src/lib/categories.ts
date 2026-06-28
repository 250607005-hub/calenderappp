/**
 * Shared interest / event category taxonomy. Keys are stable (used in DB);
 * labels are Turkish-first because they show up in onboarding & filters.
 */
import { Ionicons } from '@expo/vector-icons';

export type CategoryKey =
  | 'internship'
  | 'job'
  | 'self_improvement'
  | 'opportunities'
  | 'education'
  | 'scholarship'
  | 'mentorship'
  | 'networking';

export type InterestKey = CategoryKey | 'all';

export type Category = {
  key: CategoryKey;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// Categories admins can attach to a broadcast.
export const CATEGORIES: Category[] = [
  {
    key: 'internship',
    label: 'Staj',
    description: 'Staj ilanları ve programları',
    icon: 'briefcase-outline',
  },
  {
    key: 'job',
    label: 'İş arıyorum',
    description: 'Tam zamanlı / yarı zamanlı iş ilanları',
    icon: 'business-outline',
  },
  {
    key: 'self_improvement',
    label: 'Kendini geliştirmek',
    description: 'Atölye, kitap kulübü, kişisel gelişim',
    icon: 'rocket-outline',
  },
  {
    key: 'opportunities',
    label: 'Yeni imkanlar',
    description: 'Yarışmalar, projeler, fırsatlar',
    icon: 'compass-outline',
  },
  {
    key: 'education',
    label: 'Eğitim & Kurs',
    description: 'Online kurslar, sertifikalı programlar',
    icon: 'school-outline',
  },
  {
    key: 'scholarship',
    label: 'Burs',
    description: 'Burs ve hibe duyuruları',
    icon: 'cash-outline',
  },
  {
    key: 'mentorship',
    label: 'Mentorluk',
    description: 'Mentor görüşmeleri, kariyer rehberliği',
    icon: 'people-outline',
  },
  {
    key: 'networking',
    label: 'Etkinlik & Networking',
    description: 'Meetup, panel, sosyal etkinlikler',
    icon: 'wine-outline',
  },
];

// Special "see everything" pseudo-interest. Users who pick this (or
// "Kafam karıştı") receive every broadcast regardless of category.
export const ALL_INTEREST = {
  key: 'all' as const,
  label: 'Kafam karıştı / Hepsi',
  description: 'Tüm ilanları göster',
  icon: 'sparkles-outline' as const,
};

export const ALL_INTERESTS: { key: InterestKey; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  ALL_INTEREST,
  ...CATEGORIES,
];

export function categoryLabel(key: CategoryKey): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function categoryIcon(key: CategoryKey): keyof typeof Ionicons.glyphMap {
  return CATEGORIES.find((c) => c.key === key)?.icon ?? 'pricetag-outline';
}

/**
 * Whether a user with the given interests should see a broadcast of the
 * given category. 'all' (or empty interests) means see-everything.
 */
export function userSeesCategory(interests: string[], category: CategoryKey): boolean {
  if (!interests || interests.length === 0) return true;
  if (interests.includes('all')) return true;
  return interests.includes(category);
}
