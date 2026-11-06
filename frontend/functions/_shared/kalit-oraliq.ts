/**
 * Kalit oralig'i bo'yicha parallel sahifalash (egasi 2026-10-20: «tezlik»).
 *
 * OFFSET sahifalari moliyaviy view'larda (t2_qator_holat, t2_daraxt) har sahifada o'tkazib yuborilgan barcha
 * qatorlarni ham hisoblaydi: 25 000 qatorlik obyektda 20-sahifa 20 000 qatorni hisoblab, 1000 tasini beradi.
 * Kalit (id / qator_id) o'sish tartibida bo'lsa, qolgan qismni kalit ORALIQLARIGA bo'lamiz: har so'rov faqat o'z
 * qatorlarini indeks bo'yicha o'qiydi. Natija — o'sish tartibidagi uzluksiz PREFIKS: biror oraliq to'liq
 * olinmasa, undan keyingilar tashlanadi va `toliq:false` qaytadi (chaqiruvchi `kalit=gt.oxirgi` bilan davom etadi).
 *
 * 2026-11-06 (egasi: «katta obyekt sekin ochiladi») — MOSLASHUVCHAN BO'LISH. Avvalgi reja kalit oralig'ini bir tekis
 * zichlik bilan bo'lardi. Real obyektda (Sun'iy ko'l, 26 475 qator) id lar ~25 000 lik zich blok + 38 000 va 19 000
 * lik bo'shliqlar: o'rtacha zichlik 0.3, blok ichida 1.0 — har oraliqqa ~3000 qator tushib, 1000 lik sahifa to'lmasdi,
 * byudjet (20 so'rov) tugab, chaqiruv ~5000 qatorlik prefiks qaytarardi (6 ta ketma-ket /api/sb). Endi:
 *   1) boshlang'ich bo'laklar BIRINCHI SAHIFANING mahalliy zichligi bilan kesiladi, soni — server jami sonidan;
 *      oxirgi bo'lak `maks` gacha ochiq (razvedka: dum qayerda ekanini o'zi topadi);
 *   2) to'lib qolgan oraliq qolgan qismi O'ZI KO'RSATGAN zichlik bo'yicha yangi bo'laklarga bo'linadi (keyingi raund);
 *   3) byudjet prefiks tartibida taqsimlanadi — natija har doim uzluksiz prefiks, `toliq` faqat hammasi tugaganda.
 */
export type Oraliq = {
  /** Shu kalitdan KATTA qatorlar so'raladi (keyingi so'rovda oxirgi olingan kalit). */
  kursor: number;
  /** Shu kalitgacha (shu jumladan). */
  yuqori: number;
  qatorlar: unknown[];
  tugadi: boolean;
};

export type OraliqReja = { oraliqlar: Oraliq[]; /** Byudjet yetmay qolgan dum bor — natija prefiks bo'ladi. */ dumQoldi: boolean };

/** Bir bo'lakka mo'ljallangan qator ulushi: sahifa to'lib qolmasligi uchun zaxira. */
const ULUSH = 0.9;

/**
 * (kursor, yuqori] ni `zichlik` (qator / kalit birligi) bo'yicha ~`sahifa`·0.9 qatorlik bo'laklarga bo'ladi, ko'pi bilan
 * `maksBolak` ta. OXIRGI bo'lak doim `yuqori` gacha yetadi — oraliq hech qachon qoplanmay qolmaydi.
 */
export function bolaklarga(kursor: number, yuqori: number, zichlik: number, sahifa: number, maksBolak: number): Oraliq[] {
  const span = yuqori - kursor;
  if (!(span > 0) || !(sahifa > 0) || !(maksBolak >= 1)) return [];
  const z = Math.min(1, Math.max(zichlik > 0 ? zichlik : 1 / span, 1 / span));
  const kenglik = Math.max(1, Math.floor((sahifa * ULUSH) / z));
  const n = Math.max(1, Math.min(Math.floor(maksBolak), Math.ceil(span / kenglik)));
  const out: Oraliq[] = [];
  for (let i = 0; i < n; i++) {
    const quyi = kursor + i * kenglik;
    out.push({ kursor: quyi, yuqori: i === n - 1 ? yuqori : Math.min(quyi + kenglik, yuqori), qatorlar: [], tugadi: false });
  }
  return out;
}

/** `qolgan` qatorni sig'dirish uchun kamida nechta bo'lak kerak (server jami sonidan — zichlikdan qat'i nazar). */
const sonBoyichaKerak = (qolgan: number, sahifa: number) => Math.max(1, Math.ceil(qolgan / (sahifa * ULUSH)));

/** Keyingi raundlar uchun zaxira: razvedka bo'lagi to'lib qolsa, uni bo'lishga byudjet qolsin. */
const ZAXIRA = 4;

/**
 * Boshlang'ich reja: (oxirgi, maks]. Zichlik = birinchi sahifaning MAHALLIY zichligi (bo'lmasa o'rtacha). Bo'laklar soni
 * qolgan qatorlar SONI bo'yicha (server `count=exact`): ma'lumot shu zichlikda davom etsa, aynan shu bo'laklar uni
 * qoplaydi; davom etmasa — oxirgi bo'lak (`maks` gacha ochiq) qolganini topadi va keyingi raundda bo'linadi.
 */
export function boshlangichReja(oxirgi: number, maks: number, qolgan: number, sahifa: number, byudjet: number,
  mahalliyZichlik: number | null): OraliqReja {
  const span = maks - oxirgi;
  if (!(span > 0) || !(qolgan > 0) || !(sahifa > 0) || !(byudjet > 0)) return { oraliqlar: [], dumQoldi: false };
  const ortacha = Math.min(1, qolgan / span);
  const z = mahalliyZichlik != null && mahalliyZichlik > 0 ? Math.min(1, mahalliyZichlik) : ortacha;
  const ruxsat = byudjet > 2 * ZAXIRA ? byudjet - ZAXIRA : byudjet;
  return { oraliqlar: bolaklarga(oxirgi, maks, z, sahifa, Math.min(ruxsat, sonBoyichaKerak(qolgan, sahifa))), dumQoldi: false };
}

/** Avvalgi (bir tekis zichlik) reja — moslik uchun saqlangan; oxirgi bo'lak endi doim `maks` gacha. */
export function oraliqlarniRejala(oxirgi: number, maks: number, qolgan: number, sahifa: number, byudjet: number): OraliqReja {
  return boshlangichReja(oxirgi, maks, qolgan, sahifa, byudjet, null);
}

/** Bitta oraliq javobini qo'shadi. Kalit tartibi buzilgan yoki oraliqdan tashqari qator — xato (null). */
export function oraliqgaQosh(o: Oraliq, bolak: unknown[], kalit: string, sahifa: number): true | null {
  let oldingi = o.kursor;
  for (const r of bolak) {
    const k = Number((r as Record<string, unknown>)?.[kalit]);
    if (!Number.isSafeInteger(k) || k <= oldingi || k > o.yuqori) return null;
    oldingi = k;
  }
  o.qatorlar.push(...bolak);
  o.kursor = oldingi;
  o.tugadi = bolak.length < sahifa || oldingi >= o.yuqori;
  return true;
}

/**
 * Raunddan keyin: tugamagan oraliqlar qolgan qismini o'zlari ko'rsatgan zichlik bo'yicha bo'laklarga ajratadi.
 * `oldingiKursor` — shu raund boshidagi kursor (oraliq → kursor). Byudjet prefiks tartibida: oldingi oraliqqa avval.
 * Olingan qism o'z joyida «tugagan» bo'lib qoladi — tartib va uzluksizlik saqlanadi.
 */
export function qaytaBol(reja: OraliqReja, oldingiKursor: Map<Oraliq, number>, sahifa: number, byudjet: number,
  /** Server jami sonidan hali olinmagan qatorlar (noma'lum bo'lsa null) — bo'laklar sonini yuqoridan cheklaydi. */
  qolganJami: number | null = null): void {
  let qoldi = Math.floor(byudjet);
  const sonCheki = qolganJami != null && qolganJami > 0 ? sonBoyichaKerak(qolganJami, sahifa) : Infinity;
  const yangi: Oraliq[] = [];
  for (const o of reja.oraliqlar) {
    if (o.tugadi || qoldi <= 0) { yangi.push(o); continue; }
    const boshi = oldingiKursor.get(o);
    if (boshi == null) { yangi.push(o); qoldi--; continue; } // shu raundda so'ralmagan — o'zi keyingi raundda
    const olindi = o.kursor - boshi;
    const zichlik = olindi > 0 ? Math.min(1, sahifa / olindi) : 1;
    const kerak = Math.min(sonCheki, Math.ceil(((o.yuqori - o.kursor) * zichlik) / (sahifa * ULUSH)));
    const bolaklar = bolaklarga(o.kursor, o.yuqori, zichlik, sahifa, Math.min(qoldi, Math.max(1, kerak)));
    if (!bolaklar.length) { yangi.push(o); continue; }
    yangi.push({ kursor: boshi, yuqori: o.kursor, qatorlar: o.qatorlar, tugadi: true }, ...bolaklar);
    qoldi -= bolaklar.length;
  }
  reja.oraliqlar = yangi;
}

/** Oraliqlarni tartib bilan birlashtiradi; birinchi tugamagan oraliqda to'xtaydi (uzluksiz prefiks). */
export function prefiksYigi(reja: OraliqReja): { qatorlar: unknown[]; toliq: boolean } {
  const qatorlar: unknown[] = [];
  for (const o of reja.oraliqlar) {
    qatorlar.push(...o.qatorlar);
    if (!o.tugadi) return { qatorlar, toliq: false };
  }
  return { qatorlar, toliq: !reja.dumQoldi };
}
