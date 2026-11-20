/**
 * disk-hujjat.ts - tizim hujjatining Diskdagi shaxsi: barqaror KALIT (bir hujjat = bir kalit, qayta yasalsa yangi VERSIYA, yangi fayl emas),
 * MANBA (tur + id) va aniq NOM («F-2 №5 — Fast Food 1-qavat — 2026-11»).
 *
 * KALIT FORMATI - yagona ta'rif (SQL: supabase/migrations/20270113200000_t2_disk_daraxt_a1_v1.sql `_t2_disk_kalit_v1` va hamrohlari;
 * ikkalasi disk-kalit-vektor.json dagi bir xil vektorlar bilan tekshiriladi - disk-hujjat.test.ts):
 *   F-2                    f2:<akt_id>
 *   F-3                    f3:<forma3_id>
 *   oylik/obyekt hujjati   <tur>:<obyekt_id>:<YYYY-MM | ->      (nakopitelniy, m29, slichitelniy, ostatka, aosr)
 *   VAQTINCHALIK           tmp:f2:<obyekt_id>:<raqam | ->:<YYYY-MM | ->  /  tmp:f3:<shartnoma_id | 0>:<YYYY-MM | ->
 * Vaqtinchalik kalitli fayl (backfill akt/forma3 ni aniqlay olmagan) haqiqiy kalit kelganda o'sha faylga ULANADI (t2_disk_tizim_yoz_v1).
 */
export type DiskManba = {
  /** Manba turi (t2_hm_fayl.manba_turi): f2 | forma3 | nakopitelniy | m29 | slichitelniy | ostatka ... */
  turi: string;
  /** Manba yozuvi id si (F-2 uchun akt_id; forma3 uchun forma3_id; oylik hujjatda obyekt_id). */
  id: number | null;
  /** Barqaror hujjat kaliti (t2_hm_fayl.hujjat_kalit). */
  kalit: string;
  /** Ko'rinadigan nom. */
  nom: string;
  shartnomaId?: number | null;
};

export const kalitF2 = (aktId: number): string => `f2:${aktId}`;
export const kalitF3 = (forma3Id: number): string => `f3:${forma3Id}`;
export const kalitOylik = (tur: string, obyektId: number, oy: string | null): string => `${tur}:${obyektId}:${oy ?? '-'}`;
export const kalitVaqtinchaF2 = (obyektId: number | null, raqam: string | null, oy: string | null): string => `tmp:f2:${obyektId ?? 0}:${raqam || '-'}:${oy ?? '-'}`;
export const kalitVaqtinchaF3 = (shartnomaId: number | null, oy: string | null): string => `tmp:f3:${shartnomaId ?? 0}:${oy ?? '-'}`;
/** Fayl nomidan F-2 akt raqami: `..._№36_2026-05.xlsx` -> '36' (SQL `_t2_disk_raqam_v1` bilan bir xil). */
export const aktRaqami = (faylNomi: string): string | null => /№([^_]+)_\d{4}-\d{2}\.[A-Za-z0-9]+$/.exec(faylNomi)?.[1] ?? null;

const AYIRGICH = ' — ';
const oyMatni = (s: string | null | undefined) => (s && /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null);
const qism = (...q: Array<string | null | undefined>) => q.map((x) => (x ?? '').toString().trim()).filter(Boolean).join(AYIRGICH);

export function f2Manba(p: { aktId: number; raqam: string | number | null; obyekt: string | null; oy: string | null }): DiskManba {
  return { turi: 'f2', id: p.aktId, kalit: kalitF2(p.aktId), nom: qism(`F-2 №${p.raqam ?? p.aktId}`, p.obyekt, oyMatni(p.oy)) };
}

export function forma3Manba(p: { forma3Id: number; shartnomaId: number | null; raqam: string | number | null; shartnomaRaqam?: string | null; davr: string | null }): DiskManba {
  return {
    turi: 'forma3', id: p.forma3Id, kalit: kalitF3(p.forma3Id), shartnomaId: p.shartnomaId,
    nom: qism(`F-3 №${p.raqam ?? p.forma3Id}`, p.shartnomaRaqam ? `shartnoma №${p.shartnomaRaqam}` : null, oyMatni(p.davr)),
  };
}

/** F-3 qoralamasi (brauzerda nakopitelniydan yasaladi, saqlangan t2_forma3 yozuvi yo'q): VAQTINCHALIK kalit; haqiqiy kalit (f3:<forma3_id>) kelganda SQL shu faylga ULAYDI. */
export function forma3QoralamaManba(p: { shartnomaId: number | null; raqam: string | number | null; shartnomaRaqam?: string | null; davr: string | null }): DiskManba {
  const oy = oyMatni(p.davr);
  return { turi: 'forma3', id: null, kalit: kalitVaqtinchaF3(p.shartnomaId, oy), shartnomaId: p.shartnomaId, nom: qism(p.raqam != null && p.raqam !== '' ? `F-3 №${p.raqam}` : 'F-3', p.shartnomaRaqam ? `shartnoma №${p.shartnomaRaqam}` : null, oy) };
}

const OYLIK_NOM: Record<string, string> = {
  nakopitelniy: 'Nakopitelniy', m29: 'M-29', slichitelniy: 'Slichitelniy', ostatka: 'Ostatka', aosr: 'AOSR', sverka: 'Sverka', sverka_lrv_res: 'LRV-RES sverkasi',
  smeta_lrv: 'LRV', smeta_res: 'RES', smeta: 'Smeta', f2_portfel: 'F-2 portfeli',
};
export type OylikTur = 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka' | 'aosr' | 'sverka' | 'sverka_lrv_res' | 'smeta_lrv' | 'smeta_res' | 'smeta' | 'f2_portfel';

/** Obyekt darajasidagi hujjat: kalit `<tur>:<obyekt_id>:<oy|->` (SQL `_t2_disk_kalit_v1` umumiy shakli bilan bir xil). */
export function obyektHujjatManba(p: { tur: OylikTur; obyektId: number; obyekt: string | null; oy: string | null }): DiskManba {
  const oy = oyMatni(p.oy);
  return { turi: p.tur, id: p.obyektId, kalit: kalitOylik(p.tur, p.obyektId, oy), nom: qism(OYLIK_NOM[p.tur] ?? p.tur, p.obyekt, oy) };
}

/** Shartnoma darajasidagi hujjat (oylik paket, shartnoma sverkasi): kalit `<tur>:s<shartnoma_id>:<oy|->` - obyektlar orasida to'qnashmaydi. */
export function shartnomaHujjatManba(p: { tur: 'shartnoma_oylik_paket' | 'sverka_shartnoma'; shartnomaId: number; shartnomaRaqam: string | null; oy: string | null }): DiskManba {
  const oy = oyMatni(p.oy);
  const nom = p.tur === 'shartnoma_oylik_paket' ? 'Oylik paket' : 'Shartnoma sverkasi';
  return { turi: p.tur, id: p.shartnomaId, kalit: `${p.tur}:s${p.shartnomaId}:${oy ?? '-'}`, shartnomaId: p.shartnomaId, nom: qism(nom, p.shartnomaRaqam ? `shartnoma №${p.shartnomaRaqam}` : null, oy) };
}

/** Server hujjat turi -> registry document_type (mavjud arxiv turlari bilan bir xil). */
export const DISK_HUJJAT_TURI: Readonly<Record<string, string>> = { f2: 'f2_hujjat', forma3: 'f3', nakopitelniy: 'nakopitelniy', m29: 'm29', slichitelniy: 'slichitelniy', ostatka: 'ostatka' };


/* ---------------------------------------------------------------------------------------------------------------------------------
 * A5: qolgan hujjat joylari (buxgalteriya, HR, ombor, hisobotlar ...). Hammasi BITTA yo'ldan: `hujjatJoyManba` (kalit + nom) va
 * `lib/disk-joy.ts` (har hujjat uchun tur/daraja). Kalit: <tur>:<obyekt_id | k<kompaniya_id>>:<YYYY-MM | ->[:<qism>]
 *   obyekt darajasi    - hujjat obyektga bog'liq (Loyiha -> Shartnoma -> Obyekt -> Tur -> Oy daraxti)
 *   kompaniya darajasi - obyektsiz hujjat (buxgalteriya, HR ...): tur `kompaniya_<nom>`, Kompaniya diskida «Kompaniya hujjatlari» papkasi
 *   qism               - bir obyekt/oyda bir nechta alohida hujjat bo'lsa (naryad raqami, protokol raqami, bo'lim ...): har qism = alohida fayl
 * `qism` faqat TS tomonida: SQL `_t2_disk_kalit_v1` uni bilmaydi (kalitni mijoz beradi; SQL faqat yozadi).
 * ------------------------------------------------------------------------------------------------------------------------------- */
export const KOMPANIYA_TUR_PREFIKS = 'kompaniya_';

/** Obyekt darajasidagi hujjat turlari (registry document_type) va Diskdagi ko'rinadigan nomi. */
export const JOY_NOMI: Readonly<Record<string, string>> = {
  bajarilmadi: 'Bajarilmadi ro‘yxati', loyiha_smeta_fakt: 'Loyiha-smeta-fakt solishtirmasi', narx_dalil: 'Narx asoslash', narx_protokol: 'Narx protokoli', naryad: 'Naryad',
  obosnovanie: 'Obosnovanie', pereraschet: 'Pereraschet', resurs_vedomost: 'Resurs vedomosti', smeta_dava: 'Smeta bo‘yicha da’vo', moliya_tahlil: 'Moliyaviy tahlil',
  boshqaruv_hisobot: 'Boshqaruv hisoboti', f2_portfel: 'F-2 portfeli', studio_hujjat: 'Studio hujjati', oferta: 'Oferta',
  texnadzor_solishtir: 'Texnadzor solishtirmasi', esf: 'ESF (Forma 3)', qarzdorlik: 'Qarzdorlik asosnomasi', tender_bayonnoma: 'Tender bayonnomasi', sub_akt: 'Subpudratchi akti', rahbar_panel: 'Rahbar paneli', zakazchik_hisobot: 'Buyurtmachi hisoboti',
  akt_sverki: 'Akt-sverka', bux_hisobot: 'Buxgalteriya hisoboti', kassa_order: 'Kassa orderi', oborot_saldo: 'Oborot-saldo vedomosti', sverka_tomon: 'Tomonlar sverkasi',
  ish_haqi: 'Ish haqi vedomosti', tekshiruv_jurnal: 'Tekshiruvlar jurnali', ombor_qoralama: 'Ombor kirim qoralamasi', hujjat_aylanish: 'Hujjat aylanishi', shartnoma_svod: 'Shartnomalar svodi',
};
export type DiskTur = 'f2_hujjat' | 'f3' | 'nakopitelniy' | 'slichitelniy' | 'ostatka' | 'm29' | 'aosr' | 'sverka' | 'sverka_lrv_res' | 'smeta_lrv' | 'smeta_res' | 'f2_portfel' | 'shartnoma_oylik_paket'
  | keyof typeof JOY_NOMI | `${typeof KOMPANIYA_TUR_PREFIKS}${string}`;

const slug = (s: string | number | null | undefined) => String(s ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Tur kompaniya darajasidami (obyektsiz): registry turi `kompaniya_<asos>`. */
export const kompaniyaTuri = (asos: string): string => KOMPANIYA_TUR_PREFIKS + asos;
export const asosTur = (tur: string): string => (tur.startsWith(KOMPANIYA_TUR_PREFIKS) ? tur.slice(KOMPANIYA_TUR_PREFIKS.length) : tur);

export function kalitQism(tur: string, joy: { obyektId?: number | null; kompaniyaId: number }, oy: string | null, qism?: string | number | null): string {
  const q = qism != null && String(qism).trim() !== '' ? ':' + slug(qism) : '';
  return `${tur}:${joy.obyektId != null ? joy.obyektId : 'k' + joy.kompaniyaId}:${oy ?? '-'}${q}`;
}

/**
 * Har qanday obyekt/kompaniya darajasidagi hujjat: kalit (yuqoridagi format) + aniq nom «<Tur> — <Obyekt> — <Qism> — <Oy>».
 * `tur` - registry turi (obyektli: JOY_NOMI kaliti; obyektsiz: `kompaniya_<kalit>` - `kompaniyaTuri`).
 */
export function hujjatJoyManba(p: { tur: string; kompaniyaId: number; obyektId?: number | null; obyekt?: string | null; oy?: string | null; qism?: string | number | null; qismNom?: string | null }): DiskManba {
  const oy = oyMatni(p.oy);
  const obyektId = p.obyektId != null && Number.isFinite(Number(p.obyektId)) && Number(p.obyektId) > 0 ? Number(p.obyektId) : null;
  const turi = obyektId == null && !p.tur.startsWith(KOMPANIYA_TUR_PREFIKS) ? kompaniyaTuri(p.tur) : p.tur;
  const asos = asosTur(turi);
  return {
    turi: turi.slice(0, 40), id: obyektId, kalit: kalitQism(turi, { obyektId, kompaniyaId: p.kompaniyaId }, oy, p.qism),
    nom: qism(JOY_NOMI[asos] ?? asos, obyektId != null ? p.obyekt : null, p.qismNom, oy),
  };
}