/**
 * akkaunt-lib.ts — Akkaunt markazi uchun sof (React'siz) yordamchilar.
 * Qoidalar: NULL != 0 (noma'lum son — "—"), rol/ruxsat qarori sidebar bilan BIR manba
 * (`routePermission` + `k.joriy.permissions`); server tekshiruvi yakuniy qo'riqchi.
 */
import { routePermission } from '../../lib/company-authorization/route-permission';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';

export type AzolikQator = { kompaniya_id: number; nom: string; rol: string; faol?: boolean };
export type KompaniyaRollari = { kompaniyaId: number; nom: string; rollar: string[] };

/** Ism/login/email dan bosh harflar (maks. 2). Bo'sh bo'lsa "?". */
export function initsiallar(...manbalar: Array<string | null | undefined>): string {
  const matn = manbalar.map((m) => (m ?? '').trim()).find((m) => m.length > 0) ?? '';
  if (!matn) return '?';
  const boshi = matn.includes('@') ? matn.split('@')[0] : matn;
  const sozlar = boshi.split(/[\s._-]+/).filter(Boolean);
  const harflar = sozlar.length >= 2 ? [sozlar[0], sozlar[1]] : [sozlar[0] ?? ''];
  const r = harflar.map((s) => Array.from(s)[0] ?? '').join('').toUpperCase();
  return sozlar.length === 1 ? Array.from(sozlar[0]).slice(0, 2).join('').toUpperCase() : r;
}

export function rolNomi(rol: string | null | undefined): string {
  if (!rol) return '—';
  return ROLE_LABELS[rol] ?? rol;
}

/** Bir odam bir kompaniyada bir nechta rol tutishi mumkin: a'zolik qatorlari kompaniya bo'yicha guruhlanadi. */
export function kompaniyaRollari(azoliklar: AzolikQator[], qoshimcha: Array<{ kompaniyaId: number; nom: string; rol: string | null | undefined }> = []): KompaniyaRollari[] {
  const xarita = new Map<number, KompaniyaRollari>();
  const qosh = (id: number, nom: string, rol: string | null | undefined) => {
    let q = xarita.get(id);
    if (!q) { q = { kompaniyaId: id, nom, rollar: [] }; xarita.set(id, q); }
    if (rol && !q.rollar.includes(rol)) q.rollar.push(rol);
  };
  for (const a of azoliklar) if (a.faol !== false) qosh(a.kompaniya_id, a.nom, a.rol);
  for (const a of qoshimcha) qosh(a.kompaniyaId, a.nom, a.rol);
  return [...xarita.values()];
}

/** Noma'lum (null/undefined/NaN) — "—"; 0 haqiqiy nol sifatida ko'rsatiladi. */
export function sonYoki(n: number | null | undefined, tolaQiymat = '—'): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return tolaQiymat;
  return new Intl.NumberFormat('uz-UZ').format(n);
}

/** Sessiya muddati: `exp` sekundda (JWT) yoki millisekundda bo'lishi mumkin. */
export function sessiyaTugashi(exp: number | null | undefined): Date | null {
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= 0) return null;
  return new Date(exp < 1e12 ? exp * 1000 : exp);
}

export type HubKontekst = {
  superadmin: boolean;
  permissions?: string[];
  rol?: string;
  modulYoqilgan?: (yol: string) => boolean;
};
export type HubBand = { yol: string; nom: string; izoh: string; guruh: HubGuruhId; ikonka: string; faqatAdmin?: boolean };
export type HubGuruhId = 'hisob' | 'kompaniya' | 'narx' | 'hujjat' | 'tizim';

export const HUB_GURUH_NOMI: Record<HubGuruhId, string> = {
  hisob: 'Hisob va ish joylari',
  kompaniya: 'Kompaniya boshqaruvi',
  narx: 'Narx va hisob-kitob',
  hujjat: 'Hujjat va fayllar',
  tizim: 'Tizim va nazorat',
};

/** Ilovada MAVJUD sozlama/boshqaruv sahifalari (App.tsx marshrutlari). Ikonka — nom, komponent UI'da. */
export const HUB_BANDLAR: HubBand[] = [
  { yol: '/admin/ish-joylarim', nom: 'Ish joylarim', izoh: 'Barcha ish joylari va navbatingiz', guruh: 'hisob', ikonka: 'layout' },
  { yol: '/admin/mutaxassis', nom: 'Mening xizmatlarim', izoh: 'Mutaxassis profili va xizmat takliflari', guruh: 'hisob', ikonka: 'briefcase' },
  { yol: '/admin/tokenlar', nom: 'Tokenlar va obuna', izoh: 'Token balansi, tarif va to‘lov so‘rovlari', guruh: 'hisob', ikonka: 'gauge' },
  { yol: '/admin/kompaniya', nom: 'Kompaniya, a‘zolar va modullar', izoh: 'Rekvizitlar, a‘zolar, rollar, ruxsatlar, modullar', guruh: 'kompaniya', ikonka: 'building' },
  { yol: '/admin/participants', nom: 'Loyiha ishtirokchilari', izoh: 'Loyihadagi tomonlar va ularning rollari', guruh: 'kompaniya', ikonka: 'users' },
  { yol: '/admin/tizim-sozlama', nom: 'Umumiy sozlamalar', izoh: 'Kompaniya sozlamalari va taklif havolalari', guruh: 'kompaniya', ikonka: 'settings' },
  { yol: '/admin/crm', nom: 'Kontragentlar (CRM/EDO)', izoh: 'Hamkorlar va elektron hujjat almashinuvi', guruh: 'kompaniya', ikonka: 'users' },
  { yol: '/admin/nakrutka', nom: 'Nakrutka koeffitsientlari', izoh: 'Ustama (nakrutka) qoidalari', guruh: 'narx', ikonka: 'calc' },
  { yol: '/admin/narx-manbalari', nom: 'Narx manbalari', izoh: 'Katalog, faktura va tijoriy takliflar', guruh: 'narx', ikonka: 'tags' },
  { yol: '/admin/narxlar', nom: 'Narxlar nazorati', izoh: 'Narx o‘zgarishi va chetlanishlar', guruh: 'narx', ikonka: 'tags' },
  { yol: '/admin/hujjat-dizayn', nom: 'Hujjatlar dizayni', izoh: 'Rasmiy hujjat ko‘rinishi va logotip', guruh: 'hujjat', ikonka: 'file' },
  { yol: '/admin/hujjat-nazorat', nom: 'Hujjat nazorati', izoh: 'Hujjat holati va muddatlar nazorati', guruh: 'hujjat', ikonka: 'shield' },
  { yol: '/admin/documents', nom: 'Hujjatlar markazi', izoh: 'Barcha loyiha hujjatlari', guruh: 'hujjat', ikonka: 'stack' },
  { yol: '/admin/storage', nom: 'Fayl saqlash (Storage)', izoh: 'Saqlash ulanishi va papkalar holati', guruh: 'hujjat', ikonka: 'hdd' },
  { yol: '/admin/fayl-boglash', nom: 'Fayl bog‘lash', izoh: 'Fayllarni obyekt va hujjatlarga bog‘lash', guruh: 'hujjat', ikonka: 'link' },
  { yol: '/admin/system-control', nom: 'Tizim boshqaruv markazi', izoh: 'Tizim holati, tekshiruvlar va nazorat', guruh: 'tizim', ikonka: 'alert', faqatAdmin: true },
  { yol: '/admin/ai-agentlar', nom: 'AI ishchilar', izoh: 'AI agentlar va ularning vazifalari', guruh: 'tizim', ikonka: 'flask', faqatAdmin: true },
  { yol: '/admin/sayt-xaritasi', nom: 'Sayt xaritasi', izoh: 'Barcha sahifa, jadval va oqimlar xaritasi', guruh: 'tizim', ikonka: 'map', faqatAdmin: true },
  { yol: '/admin/korzinka', nom: 'Korzinka', izoh: 'O‘chirilgan yozuvlarni tiklash', guruh: 'tizim', ikonka: 'trash' },
  { yol: '/admin/boshqaruv', nom: 'Platforma boshqaruvi', izoh: 'Barcha kompaniyalar, obunalar (superadmin)', guruh: 'tizim', ikonka: 'crown', faqatAdmin: true },
];

const ADMIN_ROLLAR = new Set(['admin', 'superadmin']);

/** Sidebar bilan bir qoida: superadmin — hammasi; ruxsatlar katalogi bor — `routePermission`; yo'q bo'lsa — eski rol filtri. */
export function hubKorinadi(band: HubBand, k: HubKontekst): boolean {
  if (k.modulYoqilgan && !k.modulYoqilgan(band.yol)) return false;
  if (k.superadmin) return true;
  if (band.yol === '/admin/boshqaruv') return false;
  if (k.permissions) return k.permissions.includes(routePermission(band.yol));
  const rol = k.rol ?? '';
  if (band.faqatAdmin) return ADMIN_ROLLAR.has(rol);
  return ['boss', 'rahbar', 'admin', 'pto', 'bugalter', 'prorab'].includes(rol) || band.yol === '/admin/ish-joylarim';
}

export function hubFiltr(bandlar: HubBand[], k: HubKontekst, qidiruv: string, tarjima: (s: string) => string): HubBand[] {
  const q = qidiruv.trim().toLowerCase();
  return bandlar.filter((b) => hubKorinadi(b, k)).filter((b) => {
    if (!q) return true;
    return `${tarjima(b.nom)} ${tarjima(b.izoh)} ${b.nom} ${b.yol}`.toLowerCase().includes(q);
  });
}

export function hubGuruhla(bandlar: HubBand[]): Array<{ id: HubGuruhId; bandlar: HubBand[] }> {
  return (Object.keys(HUB_GURUH_NOMI) as HubGuruhId[])
    .map((id) => ({ id, bandlar: bandlar.filter((b) => b.guruh === id) }))
    .filter((g) => g.bandlar.length > 0);
}
