/**
 * Ish oqimlari (workflow) toollari uchun SOF yuk quruvchilar — bazasiz, testlanadi.
 * Pul: NDS (QQS) siz; ustamasiz + ustamali (ИТОГО-4) + QQS bilan. null — noma'lum (0 EMAS).
 * F2 qatori shakli frontend `lib/f2-tayyor.ts → f2Yuk` va `lib/f2-native-preparation.ts` bilan bir xil
 * (raw_snapshot.source = 'native_f2_preparation', narxi topilmagan resurs — narxsizSabab = 'avto_qoralama').
 */
import { createHash } from 'node:crypto';

/** Hajm «changi» — bundan kichik qoldiq F2 ga yozilmaydi (server CHECK hajm ≠ 0). */
export const CHANG_HAJM = 1e-6;
export const y6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const y2 = (x: number) => Math.round(x * 100) / 100;

/** Asos UUID + qo'shimcha → barqaror UUID (ko'p obyektli chaqiruvda idempotentlik: takroriy chaqiruv o'sha operation_id). */
export function uuidHosila(asos: string, qoshimcha: string): string {
  const h = createHash('md5').update(`${asos}:${qoshimcha}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ───────────────────────────── F2 qoralama ─────────────────────────────

export type MumkinQator = {
  qator_id: number; ota_id: number | null; tur: string; kod: string | null; nom: string | null; birlik: string | null; kat: string | null;
  /** t2_qator_holat.f2_mumkin_hajm (fakt − olingan F2). */
  mumkin: number;
  smeta_narx: number | null;
};

export type NarxOverride = Record<string, { narx: number; manba?: string }>;

export type F2YukQator = {
  qator_id: number; certified_quantity: number; certified_unit_price: number | null; certified_amount: number | null;
  price_intentionally_absent: boolean; certified_source_hash: string | null;
  raw_snapshot: Record<string, unknown>; izoh: string | null;
};

/** Hujjat manbasi (Основание): raqam bo'lsa «Ф-2 № …», aks holda tizimda shakllangan. */
export const f2HujjatManba = (raqam?: string | null) => (raqam && raqam.trim() ? `Ф-2 № ${raqam.trim()}` : 'Ф-2 (сформирована в системе)');

export const NARX_SMETA = 'цена по смете';

/** Bitta F2 qatori (ish — narxsiz; resurs — narx/override; narx topilmasa — avto narxsiz). */
export function f2Qator(r: Pick<MumkinQator, 'qator_id' | 'tur' | 'smeta_narx'>, hajm: number, manba: string, ov?: { narx: number; manba?: string }): F2YukQator {
  const q = y6(hajm);
  if (r.tur === 'bl') {
    return { qator_id: r.qator_id, certified_quantity: q, certified_unit_price: null, certified_amount: null, price_intentionally_absent: true, certified_source_hash: null,
      raw_snapshot: { source: 'native_f2_preparation', sourceReference: manba, enteredQuantity: q, hajmManba: 'fakt' }, izoh: null };
  }
  const narx = ov ? ov.narx : r.smeta_narx;
  const nm = ov ? (ov.manba?.trim() || 'цена по документу') : NARX_SMETA;
  if (narx == null || !Number.isFinite(narx)) {
    return { qator_id: r.qator_id, certified_quantity: q, certified_unit_price: null, certified_amount: null, price_intentionally_absent: true, certified_source_hash: null,
      raw_snapshot: { source: 'native_f2_preparation', sourceReference: `${manba}; без цены`, enteredQuantity: q, narxsizSabab: 'avto_qoralama', hajmManba: 'fakt' }, izoh: null };
  }
  const summa = y2(q * narx);
  return { qator_id: r.qator_id, certified_quantity: q, certified_unit_price: narx, certified_amount: summa, price_intentionally_absent: false, certified_source_hash: null,
    raw_snapshot: { source: 'native_f2_preparation', sourceReference: `${manba}; ${nm}`, enteredQuantity: q, enteredUnitPrice: narx, enteredAmount: summa, hajmManba: 'fakt' }, izoh: null };
}

export type ChangGuruh = { ish_id: number | null; nom: string | null; qatorlar: number; qiymat: number };

/**
 * Fakt qoldig'idan (f2_mumkin) F2 qoralama yuki. `changPul` > 0 — ish (ota bl) va uning resurslari guruhi ma'lum
 * qiymati shundan kichik bo'lsa tashlanadi; narxi noma'lum resursi bor guruh hech qachon «chang» hisoblanmaydi (null ≠ 0).
 */
export function f2QoralamaYuki(rows: readonly MumkinQator[], o: { raqam?: string | null; override?: NarxOverride; changPul?: number } = {}) {
  const manba = f2HujjatManba(o.raqam);
  const ov = o.override ?? {};
  const toza = rows.filter((r) => Number.isFinite(r.mumkin) && r.mumkin > CHANG_HAJM && ['bl', 'rs', 'mat', 'ob'].includes(r.tur));
  const yuk = toza.map((r) => ({ r, q: f2Qator(r, r.mumkin, manba, ov[String(r.qator_id)]) }));
  const tashlandi: ChangGuruh[] = [];
  let natija = yuk;
  const chang = o.changPul ?? 0;
  if (chang > 0) {
    const kalit = (r: MumkinQator) => (r.tur === 'bl' ? r.qator_id : r.ota_id ?? -r.qator_id);
    const guruh = new Map<number, { qiymat: number; nomalum: boolean; resurs: number; n: number; nom: string | null; ishId: number | null }>();
    for (const { r, q } of yuk) {
      const k = kalit(r);
      const g = guruh.get(k) ?? { qiymat: 0, nomalum: false, resurs: 0, n: 0, nom: null, ishId: r.tur === 'bl' ? r.qator_id : r.ota_id };
      g.n++;
      if (r.tur === 'bl') g.nom = r.nom;
      else { g.resurs++; if (q.certified_amount == null) g.nomalum = true; else g.qiymat += q.certified_amount; }
      guruh.set(k, g);
    }
    const tashla = new Set<number>();
    for (const [k, g] of guruh) {
      if (g.resurs > 0 && !g.nomalum && g.qiymat < chang) { tashla.add(k); tashlandi.push({ ish_id: g.ishId, nom: g.nom, qatorlar: g.n, qiymat: y2(g.qiymat) }); }
    }
    natija = yuk.filter(({ r }) => !tashla.has(kalit(r)));
  }
  return { qatorlar: natija.map((x) => x.q), manbaQatorlar: natija.map((x) => x.r), tashlandi };
}

// ───────────────────────────── Ustama (kf_* bo'yicha) ─────────────────────────────

export type Kf = { kf_chel: number | null; kf_mash: number | null; kf_mat: number | null; kf_ob: number | null; kf_mk: number | null; kf_kab: number | null; kf_bezsklad: number | null };

const KAT_KF: Record<string, keyof Kf> = { 'ЧЕЛ': 'kf_chel', 'МАШ': 'kf_mash', 'МАТ': 'kf_mat', 'ОБ': 'kf_ob', 'М/К': 'kf_mk', 'КАБ': 'kf_kab', 'БЕЗСКЛАД': 'kf_bezsklad', 'БЕЗ СКЛАД': 'kf_bezsklad' };
export const katKf = (kat: string | null | undefined): keyof Kf | null => KAT_KF[(kat ?? '').trim().toUpperCase().replace(/\s+/g, ' ')] ?? null;

/** Pul yig'uvchi: kat bo'yicha ma'lum summa, kat noma'lum summa va summasi noma'lum qatorlar soni. */
export class Kesim {
  kat = new Map<keyof Kf, number>();
  katsiz = 0;
  narxsiz = 0;
  bor = false;
  qosh(kat: string | null | undefined, summa: number | null | undefined): void {
    this.bor = true;
    if (summa == null || !Number.isFinite(Number(summa))) { this.narxsiz++; return; }
    const k = katKf(kat);
    if (k) this.kat.set(k, (this.kat.get(k) ?? 0) + Number(summa)); else this.katsiz += Number(summa);
  }
  ustamasiz(): number | null { return this.bor ? y2([...this.kat.values()].reduce((a, b) => a + b, 0) + this.katsiz) : null; }
}

export type Uch = { ustamasiz: number | null; ustamali: number | null; qqs_bilan: number | null; narxsiz_soni: number; izoh?: string };

/**
 * kf_* (t2_obyekt_nakrutka: 1 so'm to'g'ri xarajat → ВСЕГО, QQS bilan) bo'yicha: QQS bilan = Σ summa_kat × kf_kat;
 * ustamali (ИТОГО-4, QQS siz) = QQS bilan / (1 + QQS%). Kat noma'lum summa — ИТОГО-4 ga ustamasiz, QQS undan keyin (yadro bilan bir xil).
 * kf noma'lum bo'lgan kat summasi bor bo'lsa — ustamali null (taxmin yo'q).
 */
export function kfUch(k: Kesim, kf: Kf | null | undefined, ndsFoiz: number | null | undefined): Uch {
  const ustamasiz = k.ustamasiz();
  const n = { narxsiz_soni: k.narxsiz };
  if (ustamasiz == null) return { ustamasiz: null, ustamali: null, qqs_bilan: null, ...n };
  if (!kf) return { ustamasiz, ustamali: null, qqs_bilan: null, ...n, izoh: 'ustama koeffitsienti (t2_obyekt_nakrutka) yo\'q' };
  const nds = ndsFoiz == null || !Number.isFinite(Number(ndsFoiz)) ? null : Number(ndsFoiz);
  let qqs = 0;
  for (const [kat, s] of k.kat) {
    const f = kf[kat];
    if (s === 0) continue;
    if (f == null) return { ustamasiz, ustamali: null, qqs_bilan: null, ...n, izoh: `${kat} koeffitsienti noma'lum` };
    qqs += s * Number(f);
  }
  if (nds == null) return { ustamasiz, ustamali: null, qqs_bilan: y2(qqs + k.katsiz), ...n, izoh: 'QQS foizi noma\'lum — ustamali ajratilmadi' };
  const ustamali = y2(qqs / (1 + nds / 100) + k.katsiz);
  return { ustamasiz, ustamali, qqs_bilan: y2(qqs + k.katsiz * (1 + nds / 100)), ...n, ...(k.katsiz ? { izoh: `kat noma'lum ${y2(k.katsiz)} ustamasiz qo'shildi` } : {}) };
}

// ───────────────────────────── F2 lifecycle ─────────────────────────────

export const LIFECYCLE = ['draft', 'submitted', 'checked', 'approved', 'rejected', 'cancelled'] as const;
export type Lifecycle = typeof LIFECYCLE[number];

/** Joriy holatdan maqsadgacha o'tishlar. `toliq` — draft/rejected → submitted → checked → approved zanjiri. */
export function lifecycleYol(joriy: string | null | undefined, maqsad: Lifecycle, toliq = false): string[] {
  const j = joriy ?? 'draft';
  if (!toliq || maqsad !== 'approved') return [maqsad];
  const zanjir = ['submitted', 'checked', 'approved'];
  if (j === 'draft' || j === 'rejected') return zanjir;
  if (j === 'submitted') return zanjir.slice(1);
  if (j === 'checked') return ['approved'];
  return [maqsad];
}

const XATO_IZOH: Record<string, string> = {
  NARXSIZ_QATOR_BOR: 'qoralamada avtomatik narxsiz qatorlar bor — `f2_qoralama_tahrir` bilan narx kiriting yoki ongli `narxsiz:true` qiling, so\'ng qayta urining',
  DEPENDENTS_EXIST: 'bu aktga bog\'liq hujjatlar (tuzatish/storno/keyingi akt) bor — avval ularni hal qiling',
  STALE_VERSION: 'akt versiyasi o\'zgargan (boshqa joyda tahrirlangan) — `f2` bilan qayta o\'qib, yangi versiya bilan urining',
  INVALID_LIFECYCLE_TRANSITION: 'bu holatdan bunday o\'tish mumkin emas (draft→submitted→checked→approved; rad — faqat checked dan)',
  REASON_REQUIRED: 'rad etish / bekor qilish uchun `sabab` majburiy',
  AKT_QORALAMA_EMAS: 'faqat qoralama yoki rad etilgan F2 tahrirlanadi — tasdiqlangan F2 tuzatish (storno) tartibida o\'zgaradi',
  SOD_TEKSHIRUVCHI_YUBORUVCHI: 'korporativ rejim: tekshiruvchi yuboruvchidan boshqa odam bo\'lishi shart',
  SOD_TASDIQLOVCHI_TAKRORLANDI: 'korporativ rejim: tasdiqlovchi yuboruvchi/tekshiruvchidan boshqa odam bo\'lishi shart',
  OPERATION_REPLAY_CONFLICT: 'operation_id boshqa amal uchun ishlatilgan',
  OPERATION_SCOPE_MISMATCH: 'operation_id boshqa so\'rov bilan ishlatilgan',
  AKT_NOT_FOUND: 'akt topilmadi (yoki boshqa kompaniyada)',
  MISSING_CERTIFIED_PRICE: 'narxli qatorda narx yoki summa yo\'q',
  CERTIFIED_QTY_INVALID: 'qator hajmi yo\'q',
  DUPLICATE_F2_SOURCE_LINE: 'bir qator ikki marta berilgan',
  QATOR_SCOPE_INVALID: 'qator bu obyektga tegishli emas',
  QATOR_ALMASHTIRILGAN: 'qator yangi smeta versiyasi bilan almashtirilgan — unga faqat storno yoziladi',
  F2_LINES_REQUIRED: 'F2 qatorlari bo\'sh',
  SABAB_KOD_INVALID: 'sabab_kod ro\'yxatda yo\'q',
  SABAB_IZOH_MAJBURIY: 'sabab_kod=boshqa uchun sabab_izoh majburiy',
  QATOR_SCOPE_MISMATCH: 'qatorlar bu obyektga tegishli emas yoki turi bl/rs/mat/ob emas',
  TOPILMADI_YOKI_BEKOR: 'faol belgi topilmadi (allaqachon bekor qilingan bo\'lishi mumkin)',
  SABAB_REQUIRED: '`sabab` majburiy',
  ISH_NOM_BIRLIK_REQUIRED: 'ish nomi va birligi majburiy',
  ISH_HAJM_REQUIRED: 'ish hajmi > 0 bo\'lishi shart',
  WRITE_ROLE_REQUIRED: 'aktorda smeta.write ruxsati yo\'q',
  PERMISSION_DENIED: 'aktorda bu amal uchun ruxsat yo\'q',
};

/** Server xato kodini o'qiladigan matnga: «KOD — izoh». Kod matn ichida bo'lsa ham (raise exception 'KOD: …') topiladi. */
export function xatoIzoh(javobYokiMatn: unknown): string {
  const o = javobYokiMatn && typeof javobYokiMatn === 'object' ? javobYokiMatn as Record<string, unknown> : null;
  const matn = o ? String(o.code ?? o.error ?? o.sabab ?? JSON.stringify(o)) : String(javobYokiMatn ?? '');
  const kod = Object.keys(XATO_IZOH).find((k) => matn.includes(k)) ?? (o?.code ? String(o.code) : null);
  const qoshimcha = o ? Object.entries(o).filter(([k]) => !['ok', 'code', 'contract'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v)}`).join(', ') : '';
  const asos = kod && XATO_IZOH[kod] ? `${kod} — ${XATO_IZOH[kod]}` : matn.slice(0, 500);
  return qoshimcha ? `${asos} (${qoshimcha.slice(0, 600)})` : asos;
}

// ───────────────────────────── F2 qoralama tahriri ─────────────────────────────

export type MavjudAktQator = {
  qator_id: number; certified_quantity: number | null; hajm?: number | null; certified_unit_price: number | null; certified_amount: number | null;
  provenance_status: string | null; certified_source_hash: string | null; raw_snapshot: Record<string, unknown> | null; izoh: string | null;
  manba_akt_qator_id?: number | null;
};

export const stornomi = (q: Pick<MavjudAktQator, 'raw_snapshot' | 'manba_akt_qator_id'>) =>
  q.raw_snapshot?.source === 'storno' || q.manba_akt_qator_id != null || q.raw_snapshot?.manba_akt_qator_id != null;

/** Saqlangan qator → server yuki (o'zgartirilmasa aynan o'zi; storno ham). */
export function mavjudYuk(q: MavjudAktQator): F2YukQator & { manba_akt_qator_id?: number } {
  const absent = q.provenance_status === 'price_intentionally_absent' || q.certified_unit_price == null;
  const mak = q.manba_akt_qator_id ?? (q.raw_snapshot?.manba_akt_qator_id != null ? Number(q.raw_snapshot.manba_akt_qator_id) : null);
  return {
    qator_id: q.qator_id, certified_quantity: Number(q.certified_quantity ?? q.hajm), certified_unit_price: absent ? null : q.certified_unit_price,
    certified_amount: absent ? null : q.certified_amount, price_intentionally_absent: absent, certified_source_hash: q.certified_source_hash ?? null,
    raw_snapshot: q.raw_snapshot ?? {}, izoh: q.izoh ?? null, ...(mak != null ? { manba_akt_qator_id: mak } : {}),
  };
}

export type QatorOzgarish = { qator_id: number; hajm?: number; narx?: number; narxsiz?: boolean };

/** Qoralama qatorlarini o'zgartirish: ozgartir / olib_tashla / qo'shish (mumkin qatorlardan). Storno qatorlar tegilmaydi. */
export function qoralamaTahrirYuki(mavjud: readonly MavjudAktQator[], o: { ozgartir?: readonly QatorOzgarish[]; olibTashla?: readonly number[]; qosh?: readonly F2YukQator[] }) {
  const xato: string[] = [];
  const oddiy = new Map<number, MavjudAktQator>();
  for (const q of mavjud) if (!stornomi(q)) oddiy.set(q.qator_id, q);
  const olib = new Set(o.olibTashla ?? []);
  for (const id of olib) if (!oddiy.has(id)) xato.push(`#${id}: qoralamada oddiy qator sifatida yo'q (storno qatori o'chirilmaydi)`);
  const oz = new Map<number, QatorOzgarish>();
  for (const z of o.ozgartir ?? []) {
    if (!oddiy.has(z.qator_id)) { xato.push(`#${z.qator_id}: qoralamada oddiy qator sifatida yo'q (storno tegilmaydi)`); continue; }
    if (z.hajm != null && (!Number.isFinite(z.hajm) || Math.abs(z.hajm) < CHANG_HAJM)) { xato.push(`#${z.qator_id}: hajm 0 bo'lmasin (qatorni olib tashlang)`); continue; }
    if (z.narx != null && (!Number.isFinite(z.narx) || z.narx < 0)) { xato.push(`#${z.qator_id}: narx manfiy/yaroqsiz`); continue; }
    oz.set(z.qator_id, z);
  }
  const yuk: Array<F2YukQator & { manba_akt_qator_id?: number }> = [];
  let ozgardi = 0;
  for (const q of mavjud) {
    if (!stornomi(q) && olib.has(q.qator_id)) continue;
    const y = mavjudYuk(q);
    const z = stornomi(q) ? undefined : oz.get(q.qator_id);
    if (z) {
      ozgardi++;
      const hajm = z.hajm != null ? y6(z.hajm) : y.certified_quantity;
      const snap: Record<string, unknown> = { ...y.raw_snapshot, enteredQuantity: hajm };
      if (z.narxsiz) {
        // Ongli «narxsiz» — avto belgisi olib tashlanadi (server tasdiqni to'smaydi).
        delete snap.narxsizSabab; delete snap.enteredUnitPrice; delete snap.enteredAmount;
        yuk.push({ ...y, certified_quantity: hajm, certified_unit_price: null, certified_amount: null, price_intentionally_absent: true, raw_snapshot: snap });
        continue;
      }
      const narx = z.narx ?? y.certified_unit_price;
      if (narx == null) {
        yuk.push({ ...y, certified_quantity: hajm, raw_snapshot: snap });
        continue;
      }
      const summa = y2(hajm * narx);
      delete snap.narxsizSabab;
      Object.assign(snap, { enteredUnitPrice: narx, enteredAmount: summa });
      if (z.narx != null && typeof snap.sourceReference === 'string') snap.sourceReference = snap.sourceReference.replace(/; (без цены|цена по смете)$/, '; цена по документу');
      yuk.push({ ...y, certified_quantity: hajm, certified_unit_price: narx, certified_amount: summa, price_intentionally_absent: false, raw_snapshot: snap });
      continue;
    }
    yuk.push(y);
  }
  for (const q of o.qosh ?? []) {
    if (oddiy.has(q.qator_id) && !olib.has(q.qator_id)) { xato.push(`#${q.qator_id}: qoralamada allaqachon bor — ozgartir bilan tahrirlang`); continue; }
    yuk.push(q);
  }
  if (!yuk.length) xato.push('qoralamada birorta qator qolmaydi — F2 ni bekor qiling (f2_holat cancelled)');
  return { yuk, xato, ozgardi, olindi: [...olib].filter((id) => oddiy.has(id)).length, qoshildi: (o.qosh ?? []).length };
}

/** Akt yuki jami: ma'lum summa, narxsiz soni. */
export function yukJami(yuk: readonly Pick<F2YukQator, 'certified_amount' | 'price_intentionally_absent' | 'raw_snapshot'>[]) {
  let summa = 0; let narxsiz = 0; let avto = 0;
  for (const q of yuk) {
    if (q.certified_amount != null) summa += q.certified_amount;
    else if (q.price_intentionally_absent) { narxsiz++; if (q.raw_snapshot?.narxsizSabab === 'avto_qoralama') avto++; }
  }
  return { qatorlar: yuk.length, summa: y2(summa), narxsiz, narxsiz_avto: avto };
}

// ───────────────────────────── Podval ─────────────────────────────

/** Podval foiz kodlari (standart kaskad, `lib/hisob-yadro/podval.ts → standartPodval`). */
export const PODVAL_KODLAR = ['tr_mat', 'skl_mat', 'skl_mk', 'tr_kab', 'prochie', 'tr_ob', 'zag_ob', 'strax', 'risk', 'nds'] as const;
export type PodvalKod = typeof PODVAL_KODLAR[number];

export type PodvalQatorX = { kod: string; nom: string; tur: 'foiz' | 'summa' | 'jami'; foiz?: number | null; baza?: Array<{ kat?: string; qator?: string; k?: number }>; manba?: 'smeta' | 'meros'; dalil?: string; katak?: string; [k: string]: unknown };

/**
 * Podval qatorlarida foizlarni o'rnatish. O'rnatilgan qator `manba='smeta'` (server faqat shularni koeffitsient deb oladi —
 * «foizlar smeta podvalidan»). `foiz: null` — noma'lum (meros). Baza kats berilsa — qator bazasi shu kategoriyalar.
 */
export function podvalFoizQoy(qatorlar: readonly PodvalQatorX[], foizlar: Partial<Record<string, number | null>>, o: { baza?: Partial<Record<string, string[]>>; dalil?: string; katak?: Partial<Record<string, string>> } = {}) {
  const xato: string[] = [];
  const yangi = qatorlar.map((q) => ({ ...q }));
  const ozgardi: Array<{ kod: string; oldin: number | null; keyin: number | null }> = [];
  for (const [kod, f] of Object.entries(foizlar)) {
    const q = yangi.find((x) => x.kod === kod);
    if (!q) { xato.push(`${kod}: podvalda bunday qator yo'q (bor: ${yangi.filter((x) => x.tur === 'foiz').map((x) => x.kod).join(', ')})`); continue; }
    if (q.tur !== 'foiz') { xato.push(`${kod}: foiz qatori emas (${q.tur})`); continue; }
    if (f != null && (!Number.isFinite(f) || f < 0 || f > 100)) { xato.push(`${kod}: foiz 0…100 oralig'ida bo'lsin`); continue; }
    ozgardi.push({ kod, oldin: q.foiz ?? null, keyin: f ?? null });
    q.foiz = f ?? null;
    if (f == null) { q.manba = 'meros'; } else { q.manba = 'smeta'; delete q.merosIzoh; }
    if (o.dalil) q.dalil = o.dalil;
    if (o.katak?.[kod]) q.katak = o.katak[kod];
  }
  for (const [kod, katlar] of Object.entries(o.baza ?? {})) {
    const q = yangi.find((x) => x.kod === kod);
    if (!q) { xato.push(`${kod}: baza uchun qator yo'q`); continue; }
    if (!katlar?.length) { xato.push(`${kod}: baza bo'sh`); continue; }
    q.baza = katlar.map((kat) => ({ kat, k: 1 }));
  }
  return { qatorlar: yangi, ozgardi, xato };
}

// ───────────────────────────── Narx tuzatish ─────────────────────────────

export type NarxManbaQator = { tur: string | null; kod: string | null; nom: string | null; birlik: string | null; narx: number | null };
const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[\s.,;:"«»()-]+/g, ' ').trim();
export const narxKalit = (q: Pick<NarxManbaQator, 'tur' | 'kod' | 'nom' | 'birlik'>, usul: 'kod_nom' | 'kod' = 'kod_nom') =>
  usul === 'kod' ? `${q.tur}|${norm(q.kod)}|${norm(q.birlik)}` : `${q.tur}|${norm(q.kod)}|${norm(q.nom)}|${norm(q.birlik)}`;

/** Manba narxlari (boshqa smeta versiyasi) → maqsad qatorlariga narx × koef. Bir kalitda turli narx — noaniq, tashlanadi. */
export function narxNusxa<T extends NarxManbaQator & { id: number }>(maqsad: readonly T[], manba: readonly NarxManbaQator[], o: { koef?: number; usul?: 'kod_nom' | 'kod' } = {}) {
  const koef = o.koef ?? 1;
  const xarita = new Map<string, Set<number>>();
  for (const s of manba) {
    if (s.narx == null || !Number.isFinite(Number(s.narx))) continue;
    const k = narxKalit(s, o.usul);
    const set = xarita.get(k) ?? new Set<number>(); set.add(Number(s.narx)); xarita.set(k, set);
  }
  const narxlar: Array<{ qator_id: number; narx: number; manba_narx: number }> = [];
  const noaniq: number[] = []; const topilmadi: number[] = [];
  for (const q of maqsad) {
    const s = xarita.get(narxKalit(q, o.usul));
    if (!s) { topilmadi.push(q.id); continue; }
    if (s.size > 1) { noaniq.push(q.id); continue; }
    const mn = [...s][0];
    narxlar.push({ qator_id: q.id, narx: y2(mn * koef), manba_narx: mn });
  }
  return { narxlar, noaniq, topilmadi };
}

/** Ish (bl) summasi = bolalari (rs/mat/ob) summasi yig'indisi; birorta bola summasi null bo'lsa — null (noma'lum ≠ 0). */
export function blSumma(bolalar: ReadonlyArray<{ summa: number | null }>): number | null {
  if (!bolalar.length) return null;
  let s = 0;
  for (const b of bolalar) { if (b.summa == null) return null; s += Number(b.summa); }
  return y2(s);
}

// ───────────────────────────── Bajarilmadi ─────────────────────────────

export const SABAB_KODLAR = ['buyurtmachi_chiqardi', 'loyiha_ozgardi', 'boshqa_pudratchi', 'texnik_sabab', 'zamena', 'material_yoq', 'boshqa'] as const;

/** Faktni nolga keltirish yuki: har qatorga −(to'g'ridan fakt) delta. Fakt bl normasidan hosila bo'lsa — yozilmaydi (bl orqali). */
export function faktNolYuki(rows: ReadonlyArray<{ qator_id: number; fakt_hajm: number | null; fakt_manbasi?: string | null; direct_fakt_hajm?: number | null }>) {
  const qatorlar: Array<{ qator_id: number; hajm: number }> = [];
  const otkazildi: Array<{ qator_id: number; sabab: string }> = [];
  for (const r of rows) {
    const asos = r.direct_fakt_hajm !== undefined ? r.direct_fakt_hajm : r.fakt_hajm;
    if (asos == null || Math.abs(Number(asos)) < CHANG_HAJM) {
      if (r.fakt_hajm != null && Math.abs(Number(r.fakt_hajm)) >= CHANG_HAJM) otkazildi.push({ qator_id: r.qator_id, sabab: `fakt hosila (${r.fakt_manbasi ?? 'boshqa manba'}) — ish (bl) faktini nolga keltiring` });
      continue;
    }
    qatorlar.push({ qator_id: r.qator_id, hajm: y6(-Number(asos)) });
  }
  return { qatorlar, otkazildi };
}

/** Qo'shimcha ish resurslari taxminiy summasi (server bilan bir xil: hajm = norma × ish hajmi yoki aniq hajm). */
export function qoshimchaTaxmin(ishHajm: number, resurslar: ReadonlyArray<{ norma?: number | null; hajm?: number | null; narx?: number | null }>) {
  let summa = 0; let narxsiz = 0;
  const qatorlar = resurslar.map((r) => {
    const hajm = r.norma != null && r.norma > 0 ? y6(r.norma * ishHajm) : r.hajm ?? null;
    const s = r.narx == null || hajm == null ? null : y2(hajm * r.narx);
    if (s == null) narxsiz++; else summa += s;
    return { hajm, summa: s };
  });
  return { qatorlar, summa: y2(summa), narxsiz };
}
