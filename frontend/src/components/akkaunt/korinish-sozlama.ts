/** Ko‘rinish sozlamalari: zichlik (control balandliklari) va yon panel mahkamlanishi. Brauzer xotirasi yopiq bo‘lsa ham sahifa ishlaydi. */
export type Zichlik = 'qulay' | 'ixcham';
const ZICHLIK_KALIT = 'fz-zichlik';
export const SIDEBAR_KALIT = 'fz-sidebar-mahkam';
export const SIDEBAR_HODISA = 'fz-sidebar-mahkam-ozgardi';

const QIYMATLAR: Record<Zichlik, Record<string, string>> = {
  qulay: { '--control-sm': '28px', '--control-md': '32px', '--control-lg': '40px' },
  ixcham: { '--control-sm': '24px', '--control-md': '28px', '--control-lg': '34px' },
};

export function zichlikOqi(): Zichlik {
  try { return localStorage.getItem(ZICHLIK_KALIT) === 'ixcham' ? 'ixcham' : 'qulay'; } catch { return 'qulay'; }
}
export function zichlikQollash(z: Zichlik): void {
  if (typeof document === 'undefined') return;
  const st = document.documentElement.style;
  for (const [k, v] of Object.entries(QIYMATLAR[z])) {
    if (z === 'qulay') st.removeProperty(k); else st.setProperty(k, v);
  }
}
export function zichlikSaqla(z: Zichlik): void {
  try { localStorage.setItem(ZICHLIK_KALIT, z); } catch { /* saqlanmasa ham amal qiladi */ }
  zichlikQollash(z);
}

export function sidebarMahkamOqi(): boolean {
  try { return localStorage.getItem(SIDEBAR_KALIT) === '1'; } catch { return false; }
}
export function sidebarMahkamSaqla(v: boolean): void {
  try { localStorage.setItem(SIDEBAR_KALIT, v ? '1' : '0'); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SIDEBAR_HODISA, { detail: v }));
}
