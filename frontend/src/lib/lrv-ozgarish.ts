/**
 * LRV — qo'shimcha ish (ADDITIONAL) va zamena (REPLACEMENT) qatorlarini ajratib ko'rsatish (faqat o'qish).
 *
 * Egasi (2026-10-29): «LRV hujjatini yuklab ko'rdim — zamena yoki qo'shimcha ishlar umuman farq qilmayapti,
 * hech qayeridan bilib bo'lmaydi bu smetadan emas u qo'shimcha yoki zamena ekanligini».
 *
 * Manba — `t2_qator.change_type` (NULL — asl smeta, 'ADDITIONAL', 'REPLACEMENT') va `replaces_line_id`
 * (zamena → u almashtirgan asl qator). `t2_daraxt` view'ida bu ustunlar yo'q, shuning uchun alohida yengil
 * o'qish bilan qo'shiladi (`ozgarishMalumotOl` + `ozgarishniQosh`). Hech narsa yozilmaydi, formula o'zgarmaydi.
 *
 * Guruh (ko'rsatish va jamlar uchun) ota-zanjir bo'yicha meros: zamena ishining bola resurslari bazada
 * ADDITIONAL bo'lib yoziladi, lekin ular zamena tarkibi — «zamena» guruhida. Qo'shimcha bo'lim/ish ichidagi
 * hamma narsa — «qo'shimcha». Qolgani — «asl smeta».
 */
import type { T2Qator } from '../api/supabase';

export type OzgarishTur = 'ADDITIONAL' | 'REPLACEMENT';
export type OzgarishGuruh = 'asl' | 'qoshimcha' | 'zamena';

export type QatorOzgarish = {
  /** Ko'rsatish/jam guruhi (ota-zanjirdan meros). */
  guruh: OzgarishGuruh;
  /** Qatorning O'Z `change_type` qiymati. */
  ozi: OzgarishTur | null;
  /** Zamena qatori bo'lsa — u almashtirgan asl qator id (shu obyektda mavjud bo'lsa). */
  almashtiradi: number | null;
  /** Shu (asl) qatorni almashtirgan zamena qatorlari id lari. */
  almashtirilgan: number[];
};

type OzgarishKirish = Pick<T2Qator, 'id' | 'ota_id'> & { change_type?: string | null; replaces_line_id?: number | null };

export function ozgarishTuri(v: unknown): OzgarishTur | null {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ADDITIONAL' || s === 'REPLACEMENT' ? s : null;
}

/** Har qator uchun o'zgarish tasnifi. O(n): har qator ota-zanjiri bir marta (memo) yuriladi. */
export function ozgarishXaritasi(rows: readonly OzgarishKirish[]): Map<number, QatorOzgarish> {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const guruh = new Map<number, OzgarishGuruh>();
  const top = (id: number): OzgarishGuruh => {
    const zanjir: number[] = [];
    let natija: OzgarishGuruh | null = null;
    let joriy: number | null = id;
    const korilgan = new Set<number>();
    while (joriy != null && !korilgan.has(joriy)) {
      korilgan.add(joriy);
      const tayyor = guruh.get(joriy);
      if (tayyor) { natija = tayyor; break; }
      const r = byId.get(joriy);
      if (!r) break;
      zanjir.push(joriy);
      joriy = r.ota_id ?? null;
    }
    // Yuqoridan pastga: zamena ichidagi hamma narsa — zamena; qo'shimcha ichida — qo'shimcha (zamena bo'lmasa).
    let g: OzgarishGuruh = natija ?? 'asl';
    for (let i = zanjir.length - 1; i >= 0; i--) {
      const t = ozgarishTuri(byId.get(zanjir[i])?.change_type);
      if (g !== 'zamena') g = t === 'REPLACEMENT' ? 'zamena' : t === 'ADDITIONAL' ? 'qoshimcha' : g;
      guruh.set(zanjir[i], g);
    }
    return guruh.get(id) ?? g;
  };
  const almashtirilgan = new Map<number, number[]>();
  for (const r of rows) {
    if (ozgarishTuri(r.change_type) !== 'REPLACEMENT' || r.replaces_line_id == null || !byId.has(r.replaces_line_id)) continue;
    const a = almashtirilgan.get(r.replaces_line_id) ?? [];
    a.push(r.id);
    almashtirilgan.set(r.replaces_line_id, a);
  }
  const out = new Map<number, QatorOzgarish>();
  for (const r of rows) {
    const ozi = ozgarishTuri(r.change_type);
    out.set(r.id, {
      guruh: top(r.id),
      ozi,
      almashtiradi: ozi === 'REPLACEMENT' && r.replaces_line_id != null && byId.has(r.replaces_line_id) ? r.replaces_line_id : null,
      almashtirilgan: almashtirilgan.get(r.id) ?? [],
    });
  }
  return out;
}

/** Obyektda kamida bitta qo'shimcha yoki zamena qatori bormi (bo'lmasa hujjat shakli o'zgarmaydi). */
export function ozgarishBor(rows: readonly { change_type?: string | null }[]): boolean {
  return rows.some((r) => ozgarishTuri(r.change_type) != null);
}

/**
 * LRV (lib/lrv-hujjat) «№ п/п» raqamlari — AYNAN shu hujjat tartibida: daraxt (ota_id, tartib, id), bo'lim (rz)
 * raqamlanmaydi, ish va resurslar ketma-ket. Ekrandagi «poz. N» Excel'dagi № bilan bir xil bo'lishi uchun.
 */
export function lrvPozitsiyaRaqamlari(rows: readonly Pick<T2Qator, 'id' | 'ota_id' | 'tartib' | 'tur'>[]): Map<number, number> {
  const bor = new Set(rows.map((r) => r.id));
  const bolalar = new Map<number | null, Pick<T2Qator, 'id' | 'ota_id' | 'tartib' | 'tur'>[]>();
  for (const r of rows) {
    const k = r.ota_id != null && bor.has(r.ota_id) ? r.ota_id : null;
    const a = bolalar.get(k) ?? [];
    a.push(r);
    bolalar.set(k, a);
  }
  for (const a of bolalar.values()) a.sort((p, q) => (p.tartib ?? 0) - (q.tartib ?? 0) || p.id - q.id);
  const out = new Map<number, number>();
  let n = 0;
  const stack: Pick<T2Qator, 'id' | 'ota_id' | 'tartib' | 'tur'>[] = [...(bolalar.get(null) ?? [])].reverse();
  const korilgan = new Set<number>();
  while (stack.length) {
    const q = stack.pop()!;
    if (korilgan.has(q.id)) continue;
    korilgan.add(q.id);
    if (q.tur !== 'rz') out.set(q.id, ++n);
    const b = bolalar.get(q.id) ?? [];
    for (let i = b.length - 1; i >= 0; i--) stack.push(b[i]);
  }
  return out;
}

/** Izoh uchun qisqa nom (bir qatorga sig'adi). */
export function qisqaNom(nom: string | null | undefined, max = 60): string {
  const s = String(nom ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const hajmMatn = (x: number) => (Math.round(x * 1e6) / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 6 });

/**
 * Excel «Примечание» matni (rus, hujjat tili):
 *  - qo'shimcha ish — «ДОПОЛНИТЕЛЬНАЯ РАБОТА»;
 *  - zamena (o'zi) — «ЗАМЕНА поз. N (<eski nom>)»; zamena tarkibidagi resurs — «ЗАМЕНА (в составе поз. M)»;
 *  - almashtirilgan asl — «ЗАМЕНЕНО → поз. M, остаток X <birlik>» (qoldiq noma'lum bo'lsa qoldiq yozilmaydi: NULL ≠ 0).
 */
export function ozgarishIzohi(
  id: number,
  xarita: ReadonlyMap<number, QatorOzgarish>,
  o: { poz: (id: number) => number | null | undefined; nom: (id: number) => string | null | undefined; ota?: (id: number) => number | null | undefined; qoldiq?: (id: number) => number | null | undefined; birlik?: (id: number) => string | null | undefined },
): string | null {
  const x = xarita.get(id);
  if (!x) return null;
  const qismlar: string[] = [];
  if (x.ozi === 'REPLACEMENT') {
    const a = x.almashtiradi;
    const p = a != null ? o.poz(a) : null;
    qismlar.push(a != null ? `ЗАМЕНА${p != null ? ` поз. ${p}` : ''} (${qisqaNom(o.nom(a))})` : 'ЗАМЕНА');
  } else if (x.guruh === 'zamena') {
    let ota = o.ota?.(id) ?? null;
    let otaPoz: number | null = null;
    while (ota != null) {
      const ox = xarita.get(ota);
      if (ox?.ozi === 'REPLACEMENT') { otaPoz = o.poz(ota) ?? null; break; }
      ota = o.ota?.(ota) ?? null;
    }
    qismlar.push(otaPoz != null ? `ЗАМЕНА (в составе поз. ${otaPoz})` : 'ЗАМЕНА');
  } else if (x.guruh === 'qoshimcha') {
    qismlar.push('ДОПОЛНИТЕЛЬНАЯ РАБОТА');
  }
  if (x.almashtirilgan.length) {
    const pozlar = x.almashtirilgan.map((z) => o.poz(z)).filter((p): p is number => p != null);
    const q = o.qoldiq?.(id);
    const b = (o.birlik?.(id) ?? '').trim();
    qismlar.push(`ЗАМЕНЕНО${pozlar.length ? ` → поз. ${pozlar.join(', ')}` : ''}${q != null && Number.isFinite(q) ? `, остаток ${hajmMatn(q)}${b ? ` ${b}` : ''}` : ''}`);
  }
  return qismlar.length ? qismlar.join('; ') : null;
}

/** Hujjatdagi guruh kodi (yashirin ustun — SUMIFS jamlari uchun). */
export const OZGARISH_KOD: Record<OzgarishGuruh, string> = { asl: 'АСЛ', qoshimcha: 'ДОП', zamena: 'ЗАМ' };
export const OZGARISH_NOMI_RU: Record<OzgarishGuruh, string> = {
  asl: 'АСЛ СМЕТА (основная смета)',
  qoshimcha: 'ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ',
  zamena: 'ЗАМЕНЫ',
};
/** Qator fon ranglari (Excel, ARGB siz): qo'shimcha — och sariq, zamena — och ko'k, almashtirilgan asl — kulrang (kursiv). */
export const OZGARISH_HEX = { qoshimcha: 'FFF59D', zamena: 'BDD7EE', almashtirilgan: 'E0E0E0' } as const;
export const OZGARISH_LEGENDA: ReadonlyArray<readonly [keyof typeof OZGARISH_HEX, string]> = [
  ['qoshimcha', 'Жёлтый фон — дополнительная работа (не входит в основную смету)'],
  ['zamena', 'Голубой фон — замена (позиция, заменяющая позицию основной сметы)'],
  ['almashtirilgan', 'Серый курсив — позиция основной сметы, замененная другой позицией (указан остаток)'],
];

/** Qator rangi: almashtirilgan asl > zamena > qo'shimcha; asl — null. */
export function ozgarishRangi(x: QatorOzgarish | undefined): keyof typeof OZGARISH_HEX | null {
  if (!x) return null;
  if (x.almashtirilgan.length && x.guruh === 'asl') return 'almashtirilgan';
  if (x.guruh === 'zamena') return 'zamena';
  if (x.guruh === 'qoshimcha') return 'qoshimcha';
  return null;
}

export type OzgarishMalumot = Map<number, { change_type: OzgarishTur; replaces_line_id: number | null }>;

/** `t2_daraxt` qatorlariga `change_type`/`replaces_line_id` ni qo'shadi (yangi massiv; asl qatorlar o'zgarmaydi). */
export function ozgarishniQosh<T extends { id: number }>(rows: readonly T[], m: OzgarishMalumot | null | undefined): Array<T & { change_type: string | null; replaces_line_id: number | null }> {
  return rows.map((r) => {
    const x = m?.get(r.id);
    return { ...r, change_type: x?.change_type ?? null, replaces_line_id: x?.replaces_line_id ?? null };
  });
}
