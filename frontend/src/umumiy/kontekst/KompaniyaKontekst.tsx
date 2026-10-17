/**
 * KompaniyaKontekst.tsx — TIZIM_02 ning YAGONA kompaniya/tenant konteksti.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NEGA: avval 3 xil "kompaniya" tushunchasi bor edi va ular bir-biri bilan
 * gaplashmasdi:
 *   1) test02/KompaniyaTanlov — `t2_kompaniya` ni to'g'ridan o'qirdi
 *      (a'zolik filtri yo'q), faqat TestShell ichida edi;
 *   2) api/t2-men — kanonik `t2_men_v1` (ident: + a'zoliklar), faqat
 *      /admin/kompaniya sahifasida;
 *   3) sess.kompaniyalar — JWT ichidagi a'zoliklar, faqat serverda.
 *
 * Natijada `/admin/*` sahifalari (dashboard, hujjat-nazorat, participants,
 * documents, system-control) `useKompaniya()` ni chaqirardi, lekin
 * AdminShell'da PROVIDER YO'Q edi → `joriy` doim `null` →
 * "Avval yuqoridan kompaniya tanlang" — hech qachon tanlab bo'lmasdi.
 *
 * ENDI: bitta provider, App.tsx da /admin va /boss ustida turadi, kanonik
 * `t2_men_v1` (a'zoliklar) dan oziqlanadi. SUPERADMIN uchun Global rejim
 * bor — kompaniya tanlamasdan global sahifalar ishlaydi.
 *
 * Eski `import { useKompaniya } from '../test02/KompaniyaTanlov'` yo'llari
 * ISHLAYVERADI — KompaniyaTanlov endi shu fayldan re-export qiladi.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMen, type Men } from '../../api/t2-men';

export type KompaniyaMavqe = 'zakazchik' | 'pudratchi' | 'loyihachi' | string;

/** Kontekstda ishlatiladigan yengil kompaniya shakli (eski `T2Kompaniya`
 *  bilan mos: consumer'lar asosan `.id` va `.nom` ni ishlatadi). */
export type KompaniyaQisqa = {
  id: number;
  nom: string;
  kod: string;
  rol: string;
  membershipRole?: string | null;
  is_director: boolean;
  /** Eski UI mosli­gi uchun — `t2_men_v1` bermaydi, hozircha null. */
  mavqe: KompaniyaMavqe | null;
};

type Holat = {
  /** Foydalanuvchi a'zo bo'lgan kompaniyalar (kanonik `t2_men_v1`). */
  kompaniyalar: KompaniyaQisqa[];
  /** Tanlangan kompaniya. Global rejimda `null`. */
  joriy: KompaniyaQisqa | null;
  joriyId: number | null;
  /** Kompaniyani tanlash (a'zo bo'lmagan id rad etiladi). */
  tanla: (id: number) => void;
  /** Global rejim — faqat superadmin. */
  globalRejim: boolean;
  globalGa: () => void;
  superadmin: boolean;
  kopKompaniya: boolean;
  yuklanmoqda: boolean;
  /** Foydalanuvchiga ko'rsatiladigan xato matni (xom PostgREST EMAS). */
  xato: string;
  /** Xato auth bilan bog'liqmi — "qayta kiring" ko'rsatish uchun. */
  authXato: boolean;
  qayta: () => void;
  foydalanuvchi: Men['foydalanuvchi'] | null;
};

const BOSH: Holat = {
  kompaniyalar: [], joriy: null, joriyId: null, tanla: () => {},
  globalRejim: false, globalGa: () => {}, superadmin: false, kopKompaniya: false,
  yuklanmoqda: true, xato: '', authXato: false, qayta: () => {}, foydalanuvchi: null,
};

const Kontekst = createContext<Holat>(BOSH);
export const useKompaniya = () => useContext(Kontekst);

/* Kontekst tanlovi ACTOR-ga bog'langan holda saqlanadi (Codex audit P1):
 * bir brauzerni bo'lishgan ikki foydalanuvchi bir-birining tanlovini
 * ko'rmasin. Bitta JSON kalit: { uid, id, global }. */
const KEY = 't2_kompaniya_kontekst';
type Saqlangan = { uid: number; id: number | null; global: boolean };

function olSaqlangan(): Saqlangan | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.uid === 'number') return { uid: p.uid, id: typeof p.id === 'number' ? p.id : null, global: !!p.global };
  } catch { /* ignore */ }
  return null;
}
function yozSaqlangan(s: Saqlangan | null) {
  try { if (s == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(s)); }
  catch { /* private mode */ }
}

/** Xom server xatosini foydalanuvchi tiliga o'giradi (ichki). */
function kompaniyaXatoMatni(e: any): { matn: string; auth: boolean } {
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  if (code === 'AUTH_REQUIRED' || /foydalanuvchi yo|401|sessiya|qayta kiring/i.test(code + msg)) {
    return { matn: 'Sessiyani yangilash kerak. Chiqing va qaytadan kiring.', auth: true };
  }
  if (code === 'ACTOR_RESOLVE_FAILED') {
    return { matn: 'Kanonik foydalanuvchi yozuvi olinmadi. Chiqib, qaytadan kiring; takrorlansa administratorga ayting.', auth: true };
  }
  if (code === 'CONFIG' || code === 'ME_FAILED') {
    return { matn: 'Kompaniya ma’lumoti serveri sozlamasida nosozlik. Administrator bilan bog‘laning.', auth: false };
  }
  if (code === 'ACTOR_NOT_FOUND') {
    return { matn: 'Foydalanuvchi yozuvi topilmadi. Chiqib, qaytadan kiring.', auth: true };
  }
  return { matn: 'Kompaniya ma’lumotini o‘qib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.', auth: false };
}

export function KompaniyaProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  /* ⚠️ 2026-09-05 (Claude): AVVAL bu yerda o'zining alohida useState+useEffect
   * bilan menOl() chaqirardi — useMen() (KompaniyaPage.tsx, react-query)dan
   * BUTUNLAY mustaqil kesh. Natija: yangi kompaniya ochilganda
   * qc.invalidateQueries({queryKey:['men']}) faqat useMen()ni yangilardi,
   * bu yerdagi holat esa ESKI qolardi — sahifa tepasidagi "Kontekst"
   * tanlagichida yangi kompaniya HECH QACHON ko'rinmasdi (faqat to'liq
   * sahifa qayta yuklansa). Endi BITTA haqiqat manbai: useMen(). */
  const men_q = useMen();
  const men: Men | null = men_q.data ?? null;
  const yuklanmoqda = men_q.isLoading;
  const xatoHolat = useMemo(
    () => (men_q.isError ? kompaniyaXatoMatni(men_q.error) : { matn: '', auth: false }),
    [men_q.isError, men_q.error],
  );
  const xato = xatoHolat.matn;
  const authXato = xatoHolat.auth;
  const [joriyId, setJoriyId] = useState<number | null>(null);
  const [globalRejim, setGlobalRejim] = useState<boolean>(false);

  const uid = men?.foydalanuvchi?.id ?? null;
  const yoz = useCallback((id: number | null, global: boolean) => {
    if (uid != null) yozSaqlangan({ uid, id, global });
  }, [uid]);

  const kompaniyalar = useMemo<KompaniyaQisqa[]>(
    () => men?.context_kompaniyalar ? men.context_kompaniyalar.filter(a => a.faol).map(a => ({ id: a.kompaniya_id, nom: a.nom, kod: a.kod, rol: a.effective_role, membershipRole: a.membership_role, is_director: a.is_director, mavqe: null })) : (men?.azoliklar ?? [])
      .filter((a) => a.faol !== false)
      .map((a) => ({ id: a.kompaniya_id, nom: a.nom, kod: a.kod, rol: a.rol, is_director: a.is_director, mavqe: null })),
    [men],
  );
  const superadmin = useMemo(
    () => men?.platform_role === 'superadmin' || (men?.platform_role == null && (men?.azoliklar ?? []).some((a) => a.rol === 'superadmin')),
    [men],
  );

  /* men kelgach: SHU actor uchun saqlangan tanlovni tiklash + a'zoliklar
   * bilan solishtirish (bir marta). Boshqa actor tanlovi (uid mos kelmasa)
   * e'tiborga olinmaydi. */
  useEffect(() => {
    if (!men) return;
    const s = olSaqlangan();
    const wantId = s && s.uid === men.foydalanuvchi.id ? s.id : null;
    const wantGlobal = !!(s && s.uid === men.foydalanuvchi.id && s.global);

    if (wantGlobal && superadmin) { setGlobalRejim(true); yoz(null, true); return; }
    const valid = kompaniyalar.find((k) => k.id === wantId);
    if (valid) { setJoriyId(valid.id); setGlobalRejim(false); yoz(valid.id, false); return; }
    if (kompaniyalar.length === 1) { setJoriyId(kompaniyalar[0].id); setGlobalRejim(false); yoz(kompaniyalar[0].id, false); return; }
    if (superadmin) { setJoriyId(null); setGlobalRejim(true); yoz(null, true); return; }
    setJoriyId(null); setGlobalRejim(false); yoz(null, false); // ko'p kompaniya, tanlov yo'q -> selector
  }, [men]); // eslint-disable-line react-hooks/exhaustive-deps

  const joriy = useMemo(
    () => (globalRejim ? null : (kompaniyalar.find((k) => k.id === joriyId) ?? null)),
    [globalRejim, kompaniyalar, joriyId],
  );

  const tanla = useCallback((id: number) => {
    if (!kompaniyalar.some((k) => k.id === id)) return;
    setJoriyId(id); setGlobalRejim(false);
    yoz(id, false);
    qc.clear();                                           // eski kompaniya keshini o'chirish
  }, [kompaniyalar, qc, yoz]);

  const globalGa = useCallback(() => {
    if (!superadmin) return;
    setGlobalRejim(true); setJoriyId(null); yoz(null, true);
    qc.clear();
  }, [superadmin, qc, yoz]);

  const qiymat: Holat = {
    kompaniyalar, joriy, joriyId: joriy?.id ?? null, tanla,
    globalRejim: globalRejim && superadmin,
    globalGa, superadmin,
    kopKompaniya: kompaniyalar.length > 1,
    yuklanmoqda, xato, authXato, qayta: () => { void men_q.refetch(); },
    foydalanuvchi: men?.foydalanuvchi ?? null,
  };

  return <Kontekst.Provider value={qiymat}>{children}</Kontekst.Provider>;
}
