import type { IconName } from '../icons';

export type NavKey =
  | 'dashboard'
  | 'articles'
  | 'media'
  | 'taxonomy'
  | 'stats'
  | 'affiliate'
  | 'team'
  | 'audit'
  | 'settings';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: IconName;
  /** Hidden for editors; the server still enforces the role (DESIGN §7.1). */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'แดชบอร์ด', href: '/admin/', icon: 'dashboard' },
  { key: 'articles', label: 'บทความ', href: '/admin/articles/', icon: 'article' },
  { key: 'media', label: 'สื่อ', href: '/admin/media/', icon: 'photo' },
  { key: 'taxonomy', label: 'หมวดหมู่และแท็ก', href: '/admin/taxonomy/', icon: 'tags' },
  { key: 'stats', label: 'สถิติ', href: '/admin/stats/', icon: 'chart' },
  { key: 'affiliate', label: 'ลิงก์ affiliate', href: '/admin/affiliate/', icon: 'link' },
  { key: 'team', label: 'ทีม', href: '/admin/team/', icon: 'users', adminOnly: true },
  {
    key: 'audit',
    label: 'ประวัติการใช้งาน',
    href: '/admin/audit/',
    icon: 'history',
    adminOnly: true,
  },
  {
    key: 'settings',
    label: 'ตั้งค่าเว็บไซต์',
    href: '/admin/settings/',
    icon: 'settings',
    adminOnly: true,
  },
];

export function navFor(role: 'owner' | 'admin' | 'editor' | null): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin' || role === 'owner');
}

export const ROLE_LABEL = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  editor: 'บรรณาธิการ',
} as const;
