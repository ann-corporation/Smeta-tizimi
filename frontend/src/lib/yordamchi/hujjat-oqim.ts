/**
 * Yagona yordamchi (Jarvis): hujjat o'qishlari (qarz, F2 ro'yxati, АОСР «nima yetishmayapti») va QORALAMA yaratish
 * (F2 oylik qoralama, АОСР qoralama). Yangi hisob/RPC yo'q — sahifalar ishlatadigan MAVJUD yo'llar:
 *   F2:   f2Qur -> f2MumkinHajmlarniOl -> f2Qatorlar -> f2ZamenaQolla -> f2Yuk -> sbT2AktYaratV2 (tokenBilan 'f2_qoralama', operation_id)
 *   АОСР: yetishmayotganlar -> qoralamaGuruhdan -> sbAosrYozV2 (holat 'yangi') + sbAosrBogSaqla
 *   Qarz: qarzSvodOl (qarz_svod_v1) -> debitorJami
 * Hech qachon tasdiqlamaydi: faqat QORALAMA (F2 «qoralama», АОСР «yangi»); tasdiqlash — sahifada, qo'lda. Yozish `bajar()` ichida,
 * UI esa faqat foydalanuvchi «Bajarish»/«Tasdiqlayman» bosgach chaqiradi.
 * TODO(stream A, hisob yadrosi): pul o'qishlari (qarz, F2 jami) yagona yadro funksiyalari merge bo'lgach shularga almashtirilsin.
 */
import { sbT2AktReestrOl, sbT2AktYaratV2, sbT2DaraxtOl, yangiOperationId, type T2Qator } from '../../api/supabase';
import { T2_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbF2QoralamaHajmlar, sbQatorHolatOl, type QatorHolat } from '../../api/t2-fakt';
import { paketdanF2DaraxtHolatOl, paketTezYoliYoqilgan } from '../../api/t2-paket-oqish';
import { amaldagiProtokolNarxlari, narxProtokolQatorlariOl } from '../../api/t2-narx-protokol';
import { bajarilmadiRoyxatOl } from '../../api/t2-bajarilmadi';
import { zamenaToliqOqi } from '../fakt-zamena-boglanish';
import { bajarilmadiHajmlar } from '../fakt-studio';
import { chiqarilganmi } from '../resurs-amal';
import { tokenBilan } from '../../api/t2-token';
import { f2YozishXatoMatni } from '../f2-tayyor-sabab';
import { qarzSvodOl } from '../../api/t2-qarzdorlik';
import { debitorJami, debitorOgoh, debitorQatorlar } from '../qarzdorlik/debitor';
import { sbAosrBogSaqla, sbAosrCoverageOl, sbFaktSanalarOl, sbQatorMetaOl } from '../../api/t2-aosr';
import { sbAosrV2Ol, sbAosrYozV2, type AosrV2 } from '../../api/t2-ijro';
import { obyektImzochilarOl } from '../../api/obyekt-imzochi';
import { qoralamaGuruhdan, sanaOraligi, yetishmayotganlar, type YetishmaydiGuruh } from '../ijro-tayyorla';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import {
  bosKiritma, f2Jami, f2MumkinHajmlarniOl, f2Qatorlar, f2Qur, f2Yacheykalar, f2Yuk, f2ZamenaQolla, type F2Manba, type F2ZamenaKontekst,
} from '../f2-tayyor';
import type { ZamenaBoglanish } from '../fakt-jurnal';

export type HujjatDeps = {
  kompaniyaId: number;
  aktReestr: typeof sbT2AktReestrOl;
  daraxtHolat: (obyektId: number) => Promise<{ ok: true; rows: T2Qator[]; holat: QatorHolat[] } | { ok: false }>;
  protokol: typeof narxProtokolQatorlariOl;
  qoralamaHajm: typeof sbF2QoralamaHajmlar;
  bajarilmadi: typeof bajarilmadiRoyxatOl;
  zamena: typeof zamenaToliqOqi;
  aktYarat: typeof sbT2AktYaratV2;
  token: typeof tokenBilan;
  qarz: typeof qarzSvodOl;
  aosrCoverage: typeof sbAosrCoverageOl;
  qatorMeta: typeof sbQatorMetaOl;
  aosrReestr: typeof sbAosrV2Ol;
  faktSanalar: typeof sbFaktSanalarOl;
  imzochilar: typeof obyektImzochilarOl;
  aosrYoz: typeof sbAosrYozV2;
  aosrBog: typeof sbAosrBogSaqla;
  opId: () => string;
};

const F2_HOLAT_USTUNLAR = 'qator_id,smeta_hajm,smeta_narx,fakt_hajm,f2_hajm,f2_mumkin_hajm,f2_narx,almashtirilgan_hajm,fakt_manbasi';
/** F2 tayyorlash sahifasidagi bilan bir xil o'qish: obyekt paketi, bo'lmasa daraxt + holat. */
async function daraxtHolatOl(obyektId: number) {
  if (paketTezYoliYoqilgan()) {
    const p = await paketdanF2DaraxtHolatOl(obyektId);
    if (p) return { ok: true as const, rows: p.rows, holat: p.f2Holat as unknown as QatorHolat[] };
  }
  const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbQatorHolatOl(obyektId, F2_HOLAT_USTUNLAR)]);
  if (!d.ok || !h.ok) return { ok: false as const };
  return { ok: true as const, rows: (d.qatorlar || []) as T2Qator[], holat: (h.qatorlar || []) as QatorHolat[] };
}

export const haqiqiyHujjatDeps = (kompaniyaId: number): HujjatDeps => ({
  kompaniyaId, aktReestr: sbT2AktReestrOl, daraxtHolat: daraxtHolatOl, protokol: narxProtokolQatorlariOl, qoralamaHajm: sbF2QoralamaHajmlar,
  bajarilmadi: bajarilmadiRoyxatOl, zamena: zamenaToliqOqi, aktYarat: sbT2AktYaratV2, token: tokenBilan, qarz: qarzSvodOl,
  aosrCoverage: sbAosrCoverageOl, qatorMeta: sbQatorMetaOl, aosrReestr: sbAosrV2Ol, faktSanalar: sbFaktSanalarOl, imzochilar: obyektImzochilarOl,
  aosrYoz: sbAosrYozV2, aosrBog: sbAosrBogSaqla, opId: yangiOperationId,
});

const pul = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? 'noma’lum' : `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} so‘m`);
export const oyNomi = (oy: string) => `${oy.slice(0, 4)}-${oy.slice(5, 7)}`;

/* ───────────────────────────── O'QISH ───────────────────────────── */

/** Buyurtmachi qarzi (qarz = F3 QQS bilan − to'lov; F2 ustamasiz yonida). NULL != 0. */
export async function qarzMatni(d: Pick<HujjatDeps, 'kompaniyaId' | 'qarz'>): Promise<string> {
  const r = await d.qarz(d.kompaniyaId);
  if (!r.ok) return `Qarzdorlik o‘qilmadi: ${r.error}`;
  const q = debitorQatorlar(r.qatorlar);
  if (!q.length) return 'Buyurtmachi qarzi bo‘yicha shartnoma topilmadi.';
  const j = debitorJami(q);
  const satrlar = [...q].sort((a, b) => (b.qarz ?? -Infinity) - (a.qarz ?? -Infinity)).slice(0, 12).map((x) => {
    const og = debitorOgoh(x).map((o) => (o === 'f3_yoq' ? 'F3 yo‘q' : o === 'avans' ? 'avans' : 'to‘lov yo‘q'));
    return `- ${x.raqam ?? '—'} ${x.kontragent ?? x.nom ?? ''}: qarz **${pul(x.qarz)}** (F2 ustamasiz ${pul(x.f2_nakrutkasiz)})${og.length ? ` ⚠ ${og.join(', ')}` : ''}`;
  });
  return [`**Buyurtmachi bizga qarzi** (F3 QQS bilan − to‘lov): **${pul(j.qarz)}**${j.qarzNomalum ? ` (${j.qarzNomalum} ta shartnomada noma’lum — jamiga kirmaydi)` : ''}`,
    `F3: ${pul(j.f3)} · to‘langan: ${pul(j.tolangan)} · F2 (ustamasiz): ${pul(j.f2)} · ${j.soni} ta shartnoma`, ...satrlar].join('\n');
}

/** Obyektning F2 ro'yxati (ixtiyoriy oy bo'yicha). Summa — hujjat jami, ustamasiz, NDS siz. */
export async function f2RoyxatMatni(d: Pick<HujjatDeps, 'aktReestr'>, obyektId: number, oy: string | null): Promise<string> {
  const r = await d.aktReestr(obyektId, 'f2');
  if (!r.ok) return `F2 reestri o‘qilmadi: ${r.error ?? ''}`;
  const l = (r.qatorlar || []).filter((a) => a.holat !== 'bekor' && (!oy || String(a.oy).slice(0, 7) === oy));
  if (!l.length) return oy ? `${oyNomi(oy)} oyi uchun F2 yo‘q.` : 'Bu obyektda F2 yo‘q.';
  return [`F2 hujjatlari: ${l.length} ta${oy ? ` (${oyNomi(oy)})` : ''}`, ...l.slice(0, 20).map((a) =>
    `- №${a.raqam ?? a.id} · ${String(a.oy).slice(0, 7)} · ${a.holat}${a.lifecycle_status ? `/${a.lifecycle_status}` : ''} · ${a.qator_soni ?? '—'} qator · ${pul(a.hujjat_jami ?? a.yozilgan_jami)} (ustamasiz)${a.narxsiz_qator ? ` · ⚠ ${a.narxsiz_qator} narxsiz` : ''}`)].join('\n');
}

export type AosrHolati = { guruhlar: YetishmaydiGuruh[]; jami: number };
export async function aosrYetishmaydi(d: Pick<HujjatDeps, 'aosrCoverage' | 'qatorMeta'>, obyektId: number): Promise<AosrHolati | { xato: string }> {
  const [c, meta] = await Promise.all([d.aosrCoverage(obyektId), d.qatorMeta(obyektId)]);
  if (!c.ok) return { xato: c.error ?? 'АОСР qamrovi o‘qilmadi' };
  const guruhlar = yetishmayotganlar(c.qatorlar || [], meta);
  return { guruhlar, jami: guruhlar.reduce((s, g) => s + g.ishlar.length, 0) };
}

export function aosrYetishmaydiMatni(h: AosrHolati | { xato: string }): string {
  if ('xato' in h) return h.xato;
  if (!h.jami) return 'Nima yetishmayapti: hech narsa — yashirin ishlarning hammasiga АОСР bor.';
  return [`**Nima yetishmayapti:** ${h.jami} ta yashirin ishga АОСР yo‘q (${h.guruhlar.length} ta bo‘limda).`,
    ...h.guruhlar.slice(0, 15).map((g) => `- ${g.nom || 'Bo‘limsiz'}: ${g.ishlar.length} ta ish`)].join('\n');
}

/* ───────────────────────────── QORALAMA: АОСР ───────────────────────────── */

export type AosrReja = { guruhlar: YetishmaydiGuruh[]; bajar: (tanlangan: ReadonlySet<number | null>) => Promise<string[]> };

/** АОСР qoralamalari rejasi: har razdel — bitta qoralama (holat 'yangi'). `filtr` — razdel/ish nomi bo'yicha qidiruv so'zi. */
export async function aosrQoralamaReja(d: HujjatDeps, obyektId: number, filtr: string | null): Promise<AosrReja | { xato: string }> {
  const h = await aosrYetishmaydi(d, obyektId);
  if ('xato' in h) return h;
  if (!h.jami) return { xato: 'Hamma yashirin ishga АОСР bor — yangi qoralama kerak emas.' };
  const f = filtr && filtr.trim().length >= 2 ? qidiruvTayyorla(filtr.trim()) : null;
  const mos = f ? h.guruhlar.filter((g) => f(g.nom) || g.ishlar.some((c) => f(`${c.kod ?? ''} ${c.nom ?? ''}`))) : [];
  const guruhlar = mos.length ? mos : h.guruhlar;
  const bajar = async (tanlangan: ReadonlySet<number | null>): Promise<string[]> => {
    const ishli = guruhlar.filter((g) => tanlangan.has(g.razdelId)).map((g) => ({ g, ishlar: g.ishlar })).filter((x) => x.ishlar.length);
    if (!ishli.length) return [];
    const aktlarR = await d.aosrReestr(d.kompaniyaId, obyektId);
    const aktlar: AosrV2[] = aktlarR.ok ? aktlarR.qatorlar || [] : [];
    if (!aktlarR.ok) return ['✗ АОСР reestri o‘qilmadi — raqam berib bo‘lmaydi'];
    const barchaIds = ishli.flatMap((x) => [...x.ishlar.map((c) => c.qator_id), ...x.g.resurslar.filter((r) => x.ishlar.some((c) => c.qator_id === r.ishId)).map((r) => r.c.qator_id)]);
    const fakt = await d.faktSanalar(obyektId, barchaIds);
    const oxirgi = aktlar.find((a) => a.holat !== 'bekor');
    const sukut = oxirgi ? { komissiya: Array.isArray(oxirgi.komissiya) ? oxirgi.komissiya.map((k) => ({ ...k })) : undefined, blank: oxirgi.blank_varianti, loyihaTashkiloti: oxirgi.loyiha_tashkiloti } : undefined;
    let raqam = Math.max(0, ...aktlar.map((a) => Number(String(a.raqam ?? '').replace(/\D+/g, ''))).filter((n) => Number.isFinite(n) && n > 0));
    const out: string[] = []; let tayyor = 0;
    for (const { g, ishlar } of ishli) {
      const resurslar = g.resurslar.filter((r) => ishlar.some((c) => c.qator_id === r.ishId));
      const imzo = await d.imzochilar(d.kompaniyaId, obyektId, g.razdelId).catch(() => null);
      const sanalar = sanaOraligi([...ishlar, ...resurslar.map((r) => r.c)].map((c) => c.qator_id), fakt.links, fakt.aktlar);
      const malumot = qoralamaGuruhdan(g, ishlar, { raqam: String(raqam + 1), sanalar, imzochilar: imzo && imzo.ok ? imzo.natija.imzochilar : null, sukut });
      const r = await d.aosrYoz({ kompaniyaId: d.kompaniyaId, obyektId, malumot, operationId: d.opId() });
      if (!r.ok || !r.id) { out.push(`✗ ${g.nom || 'Bo‘limsiz'}: ${r.error || 'АОСР yozilmadi'}`); break; }
      raqam++;
      const bog = await d.aosrBog([r.id], [...ishlar.map((c) => c.qator_id), ...resurslar.map((x) => x.c.qator_id)]);
      if (!bog.ok) { out.push(`✗ ${g.nom || 'Bo‘limsiz'}: bog‘lanmadi — ${bog.error || ''}`); break; }
      tayyor++;
    }
    if (tayyor) out.unshift(`✓ ${tayyor} ta АОСР qoralamasi tayyor (holat «yangi») — tekshirib, АОСР sahifasida o‘zingiz tasdiqlang`);
    return out;
  };
  return { guruhlar, bajar };
}

/* ───────────────────────────── QORALAMA: F2 ───────────────────────────── */

export type F2Reja = { ok: true; oy: string; manba: F2Manba; qatorSoni: number; summa: number; narxsiz: number; ogoh: number; bajar: () => Promise<string[]> } | { ok: false; sabab: string };

/**
 * Oy uchun F2 qoralamasi: F2 tayyorlash sahifasining «barcha mumkin hajmni olish» yo'li bilan bir xil quriladi (storno/ortiqcha chegirmasiz —
 * yangi qoralama). Bor F2 (oy bo'yicha) yoki o'qilmagan manba bo'lsa — YOZILMAYDI, sahifaga yo'naltiriladi.
 */
export async function f2QoralamaReja(d: HujjatDeps, obyektId: number, oy: string): Promise<F2Reja> {
  const ay = oy.slice(0, 7);
  const reestr = await d.aktReestr(obyektId, 'f2');
  if (!reestr.ok) return { ok: false, sabab: 'F2 reestri o‘qilmadi — qayta urinib ko‘ring.' };
  const bor = (reestr.qatorlar || []).find((a) => a.holat !== 'bekor' && String(a.oy).slice(0, 7) === ay);
  if (bor) return { ok: false, sabab: `${oyNomi(ay)} uchun F2 allaqachon bor (№${bor.raqam ?? bor.id}, ${bor.holat}). Uni F2 tarixida oching yoki tahrirlang — ikkinchisini yaratmayman.` };
  const [dh, prot, qh, baj, zam] = await Promise.all([d.daraxtHolat(obyektId), d.protokol(obyektId), d.qoralamaHajm(obyektId, null), d.bajarilmadi(d.kompaniyaId, obyektId), d.zamena(obyektId)]);
  if (!dh.ok || !dh.rows.length) return { ok: false, sabab: 'Obyekt smetasi o‘qilmadi yoki bo‘sh.' };
  if (!prot.ok || prot.toliq === false) return { ok: false, sabab: 'Narx protokollari o‘qilmadi — narx noto‘g‘ri tanlanib ketmasligi uchun to‘xtadim.' };
  if (!qh.ok) return { ok: false, sabab: 'Boshqa F2 qoralamalaridagi hajm o‘qilmadi — takror F2 bo‘lib ketmasligi uchun to‘xtadim.' };
  if (!baj.ok) return { ok: false, sabab: '«Bajarilmaydi» ro‘yxati o‘qilmadi.' };
  if (!zam.ok) return { ok: false, sabab: 'Zamena bog‘lanishi o‘qilmadi — asl va zamena ikkalasi F2 ga tushib ketmasligi uchun to‘xtadim.' };

  const { rows, holat } = dh;
  const zb: ZamenaBoglanish = zam.natija.boglanish; const miqdor = zam.natija.miqdor;
  const protokolNarx = amaldagiProtokolNarxlari((prot.qatorlar || []).filter((x) => x.holat === 'tasdiqlangan'), `${ay}-01`);
  const bajH = bajarilmadiHajmlar(baj.qatorlar);
  const sm = new Map(holat.map((h) => [h.qator_id, h.smeta_hajm]));
  const chiqarilgan = new Set<number>();
  for (const r of rows) if ((r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob') && chiqarilganmi(sm.get(r.id) ?? r.hajm, bajH.get(r.id))) chiqarilgan.add(r.id);
  const zamenaAsl = zb?.almashtiradi ?? new Map<number, number>();
  const faktBor = holat.some((h) => h.fakt_hajm != null && Number(h.fakt_hajm) !== 0) || holat.some((h) => Number(h.f2_mumkin_hajm) > 0);
  const manba: F2Manba = faktBor ? 'fakt' : 'smeta';
  const bolimlar = f2Qur(rows, holat, protokolNarx, manba, qh.hajm, { chiqarilgan, zamenaAsl, stornoQaytar: new Map(), ortiqchaChegir: false, smetaNarxda: false });
  const k = f2MumkinHajmlarniOl(bolimlar, bosKiritma());
  const xom = f2Qatorlar(bolimlar, k);
  let zk: F2ZamenaKontekst | null = null;
  if (zamenaAsl.size) {
    const oldingi = new Map<number, number>(); const serverAlm = new Map<number, number>();
    for (const h of holat) {
      const f2 = Number(h.f2_hajm ?? 0); if (Number.isFinite(f2) && f2 !== 0) oldingi.set(h.qator_id, f2);
      const a = Number((h as QatorHolat & { almashtirilgan_hajm?: number | null }).almashtirilgan_hajm ?? 0); if (Number.isFinite(a) && a > 0) serverAlm.set(h.qator_id, a);
    }
    zk = { rows: rows.map((r) => ({ id: r.id, ota_id: r.ota_id ?? null, tur: r.tur, birlik: r.birlik, hajm: r.hajm == null ? null : Number(r.hajm) })), zamenaAsl, miqdor, oldingi, serverAlm };
  }
  const qatorlar = f2ZamenaQolla(xom, bolimlar, k, zk).qatorlar;
  const jami = f2Jami(qatorlar);
  if (!qatorlar.length) return { ok: false, sabab: `${oyNomi(ay)} uchun F2 ga olinadigan hajm yo‘q (fakt qoldig‘i 0). Avval fakt kiriting.` };
  if (jami.xato > 0) return { ok: false, sabab: `${jami.xato} ta qatorda xato bor — F2 tayyorlash sahifasida tekshiring.` };
  const yuk = f2Yuk(qatorlar, '', manba);
  const yacheyka = f2Yacheykalar(yuk);
  const opId = d.opId();
  const bajar = async (): Promise<string[]> => {
    try {
      const tk = await d.token({ kompaniyaId: d.kompaniyaId, amal: 'f2_qoralama', birlikSoni: yacheyka, meta: { obyekt: obyektId, qator: qatorlar.length, yacheyka } }, async () => {
        const r = await d.aktYarat({ obyektId, oy: `${ay}-01`, operationId: opId, qatorlar: yuk });
        if (!r.ok) throw new Error(f2YozishXatoMatni(r as typeof r & { code?: string }, 'F2 qoralama yaratilmadi.'));
        return r;
      });
      if (!tk.ok) return [`✗ ${tk.xabar}`];
      return [`✓ F2 qoralama yaratildi (${qatorlar.length} qator, ${tk.sarflandi} token) — tasdiqlash faqat F2 tarixida, qo‘lda`];
    } catch (e) { return [`✗ ${e instanceof Error ? e.message : 'Javob olinmadi'}`]; }
  };
  return { ok: true, oy: ay, manba, qatorSoni: qatorlar.length, summa: jami.summa, narxsiz: jami.narxsiz, ogoh: jami.ogoh, bajar };
}
