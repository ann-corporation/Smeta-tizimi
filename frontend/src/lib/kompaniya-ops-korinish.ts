/**
 * KOMPANIYA OPERATSIYALARI KO'RINISHI — logistika (zayavka, sklad), moliya (to'lov) va ERP (kadr, texnika, sifat,
 * ta'minot) sahifalari uchun sof hisoblar (egasi 2026-10-25: «har ekran bir qarashda tushunarli bo'lsin»).
 * Yangi biznes formula YO'Q: faqat yuklangan qatorlarni holat bo'yicha sanash, yig'ish va chizish ulushlari.
 * NULL ≠ 0: noma'lum qiymat null bo'lib qoladi (masalan so'ralgan miqdor 0 bo'lsa ulush — null).
 */

/** Holat taqsimoti — segmentli chiziq uchun. `tartib` dagi har kalit bo'yicha son (0 ham), keyin noma'lumlar. */
export type Taqsimot<K extends string> = { kalit: K; soni: number; ulush: number }[];

export function taqsimot<T, K extends string>(qatorlar: readonly T[], kalit: (x: T) => K, tartib: readonly K[]): Taqsimot<K> {
  const sanoq = new Map<K, number>();
  for (const q of qatorlar) { const k = kalit(q); sanoq.set(k, (sanoq.get(k) ?? 0) + 1); }
  const jami = qatorlar.length;
  const kalitlar = [...tartib, ...[...sanoq.keys()].filter((k) => !tartib.includes(k))];
  return kalitlar.map((k) => ({ kalit: k, soni: sanoq.get(k) ?? 0, ulush: jami > 0 ? (sanoq.get(k) ?? 0) / jami : 0 }));
}

/* ---------- Zayavka (t2_zayavka) ---------- */
export type ZayavkaBosqich = 'draft' | 'submitted' | 'approved' | 'procurement' | 'ordered' | 'partially_delivered' | 'delivered' | 'closed' | 'cancelled';
export const ZAYAVKA_TARTIB: readonly ZayavkaBosqich[] = ['draft', 'submitted', 'approved', 'procurement', 'ordered', 'partially_delivered', 'delivered', 'closed', 'cancelled'];
/** Ochiq (hali yetkazilmagan va bekor qilinmagan) holatlar. */
export const ZAYAVKA_OCHIQ: ReadonlySet<ZayavkaBosqich> = new Set(['draft', 'submitted', 'approved', 'procurement', 'ordered', 'partially_delivered']);

/** Yetkazish ulushi 0..1 (so'ralgan 0 yoki noma'lum — null). Qolgan — server qiymati, bo'lmasa so'ralgan − yetkazilgan. */
export function zayavkaYetkazish(z: { requestedQty: number | null; deliveredQty: number | null; remainingQty: number | null }): { ulush: number | null; qolgan: number | null } {
  const sor = z.requestedQty;
  const yet = z.deliveredQty ?? 0;
  const qolgan = z.remainingQty ?? (sor == null ? null : Math.max(sor - yet, 0));
  if (sor == null || !(sor > 0)) return { ulush: null, qolgan };
  return { ulush: Math.min(1, Math.max(0, yet / sor)), qolgan };
}

/** Kun bo'yicha yoshi (yaratilgandan beri); sana noma'lum — null. */
export function kunYoshi(sana: string | null | undefined, hozir: number = Date.now()): number | null {
  if (!sana) return null;
  const t = new Date(sana).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((hozir - t) / 86_400_000));
}

export function zayavkaXulosa<T extends { status: ZayavkaBosqich; requiredDate: string | null }>(qatorlar: readonly T[], bugun: string): { jami: number; ochiq: number; muddatiOtgan: number; yetkazilgan: number } {
  let ochiq = 0, muddatiOtgan = 0, yetkazilgan = 0;
  for (const z of qatorlar) {
    if (ZAYAVKA_OCHIQ.has(z.status)) {
      ochiq++;
      if (z.requiredDate && z.requiredDate.slice(0, 10) < bugun) muddatiOtgan++;
    }
    if (z.status === 'delivered' || z.status === 'closed') yetkazilgan++;
  }
  return { jami: qatorlar.length, ochiq, muddatiOtgan, yetkazilgan };
}

/* ---------- Sklad ---------- */
export function skladXulosa(qatorlar: readonly { qoldiq: number | null; oxirgi_harakat?: string | null }[]): { pozitsiya: number; manfiy: number; nol: number; oxirgi: string | null } {
  let manfiy = 0, nol = 0, oxirgi: string | null = null;
  for (const q of qatorlar) {
    if (q.qoldiq != null && q.qoldiq < 0) manfiy++;
    else if (q.qoldiq === 0) nol++;
    if (q.oxirgi_harakat && (oxirgi == null || q.oxirgi_harakat > oxirgi)) oxirgi = q.oxirgi_harakat;
  }
  return { pozitsiya: qatorlar.length, manfiy, nol, oxirgi };
}

/** Konsolidatsiya: material qoldig'ining obyektlar bo'yicha ulushi (manfiy qoldiq ulushga kirmaydi, alohida belgi). */
export function obyektUlushlari(obs: readonly { obyekt_id: number; obyekt_nom: string; qoldiq: number }[]): { obyekt_id: number; obyekt_nom: string; qoldiq: number; ulush: number; manfiy: boolean }[] {
  const jami = obs.reduce((s, o) => s + Math.max(0, o.qoldiq), 0);
  return obs.map((o) => ({ ...o, ulush: jami > 0 ? Math.max(0, o.qoldiq) / jami : 0, manfiy: o.qoldiq < 0 }))
    .sort((a, b) => b.qoldiq - a.qoldiq);
}

/** Minimal qoldiqqa nisbatan daraja: chiziq uchun ulush (min × 2 = to'la), past — min dan kam yoki teng. */
export function qoldiqDaraja(qoldiq: number | null, min: number | null): { ulush: number | null; minJoy: number | null; past: boolean } {
  if (qoldiq == null || min == null || !(min > 0)) return { ulush: null, minJoy: null, past: qoldiq != null && min != null && qoldiq <= min };
  const shkala = min * 2;
  return { ulush: Math.min(1, Math.max(0, qoldiq / shkala)), minJoy: 0.5, past: qoldiq <= min };
}

/* ---------- To'lovlar ---------- */
export function tolovOqimi(qatorlar: readonly { summa: number | null; sana: string | null; tur?: string | null }[]): {
  kirim: number; chiqim: number; soni: number;
  oylar: { oy: string; kirim: number; chiqim: number }[];
} {
  let kirim = 0, chiqim = 0;
  const oy = new Map<string, { kirim: number; chiqim: number }>();
  for (const t of qatorlar) {
    if (t.summa == null || !Number.isFinite(t.summa)) continue;
    const k = (t.sana ?? '').slice(0, 7) || '—';
    const b = oy.get(k) ?? { kirim: 0, chiqim: 0 };
    if (t.summa >= 0) { kirim += t.summa; b.kirim += t.summa; } else { chiqim += -t.summa; b.chiqim += -t.summa; }
    oy.set(k, b);
  }
  const oylar = [...oy.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([o, v]) => ({ oy: o, ...v }));
  return { kirim, chiqim, soni: qatorlar.length, oylar };
}

/** Bajarilgan (F2) dan qancha to'langan: ulush 0..1; bajarilgan 0 bo'lsa — null. */
export function tolovUlushi(bajarilgan: number | null, tolangan: number | null): number | null {
  if (bajarilgan == null || tolangan == null || !(bajarilgan > 0)) return null;
  return Math.min(1, Math.max(0, tolangan / bajarilgan));
}

/* ---------- ERP ---------- */
export type DavomatHolat = string | null;
/** Bugungi davomat: keldi / kelmadi / kasal (otgul ham) / belgilanmagan soni. */
export function davomatBugun(ishchilar: readonly { id: string }[], tabellar: readonly { ishchiId: string; kunlar: { sana: number; holat: DavomatHolat }[] }[], kun: number): Record<'keldi' | 'kelmadi' | 'kasal' | 'belgisiz', number> {
  const r = { keldi: 0, kelmadi: 0, kasal: 0, belgisiz: 0 };
  for (const i of ishchilar) {
    const h = tabellar.find((t) => t.ishchiId === i.id)?.kunlar.find((k) => k.sana === kun)?.holat ?? null;
    if (h === 'keldi' || h === 'kelmadi' || h === 'kasal') r[h]++; else if (h === 'otgul') r.kasal++; else r.belgisiz++;
  }
  return r;
}

/** Yoqilg'i qoldig'i chizig'i: bak hajmi noma'lum — shkala sifatida mavjud qatorlarning eng kattasi (kamida 1). */
export function yoqilgiUlush(qoldiq: number | null | undefined, maks: number): number | null {
  if (qoldiq == null || !Number.isFinite(qoldiq)) return null;
  return maks > 0 ? Math.min(1, Math.max(0, qoldiq / maks)) : 0;
}
