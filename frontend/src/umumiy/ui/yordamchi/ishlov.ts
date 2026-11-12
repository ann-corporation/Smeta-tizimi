/**
 * Yagona yordamchi (Jarvis): niyat -> javob/amal. Bu yerda HECH NARSA YOZILMAYDI:
 *  - navigatsiya va o'qish bepul (model yo'q, token yechilmaydi; o'qish sahifalar ishlatadigan hisob yadrosi orqali);
 *  - yozuv niyati — mavjud agent sikli (`agentSikli`, token: /api/smeta-ai aiHisobli, avvalgidek) TAKLIF kartasi qaytaradi;
 *    bajarish alohida, foydalanuvchining «Tasdiqlash» bosishidan keyin (YordamchiTaklif);
 *  - hech qachon rad etmaydi: noma'lum so'rovda eng yaqin sahifa/amallar taklif qilinadi.
 */
import { t } from '../../../i18n/til';
import type { Niyat, SahifaAmalQisqa } from '../../../lib/yordamchi/niyat';
import { yordamMatni } from '../../../lib/yordamchi/vositalar-reestr';
import type { SahifaHavola, YordamchiSahifa } from '../../../lib/yordamchi/sahifa-qidiruv';
import type { ObyektQisqa } from '../../../lib/yordamchi/kontekst-ajrat';
import { agentSikli, type SiklQadam, type SahifaVositalar } from '../../../lib/ai-yordamchi/sikl';
import type { SahifaAmal, SahifaXabar } from '../../../lib/ai-yordamchi/protokol';
import type { Motor } from './useObyektMotor';
import { aosrQoralamaReja, aosrYetishmaydi, aosrYetishmaydiMatni, f2QoralamaReja, f2RoyxatMatni, qarzMatni, type HujjatDeps } from '../../../lib/yordamchi/hujjat-oqim';
import { sahifaUrl } from '../../../lib/yordamchi/sahifa-qidiruv';

/** AiChat ga beriladigan yagona yordamchi ulanishi (AiHelper yig'adi). */
export type YordamchiUlanish = { /** Amal reestri (Jarvis ijrosi): foydalanuvchi ruxsatlari (kompaniyadagi). */ amalRuxsat?: { permissions: readonly string[] | null; superadmin: boolean }; sahifalar: readonly YordamchiSahifa[]; obyektlar: readonly ObyektQisqa[]; joriyObyekt: ObyektQisqa | null; obyektTanla: (id: number) => void; motor: Motor; hujjat: HujjatDeps | null; sahifaAmallar: readonly SahifaAmalQisqa[]; sahifaAmalBajar: (id: string) => void };

export type IshlovHavola = { yol: string; nom: string };
export type IshlovTaklif = { amallar: Array<SahifaAmal & { ogoh: string | null }>; vositalar: NonNullable<Motor['vositalar']>; qoshimcha: Motor['qoshimcha'] };

export type IshlovNatija =
  | { tur: 'javob'; matn: string; havolalar?: IshlovHavola[]; ochish?: string; xato?: boolean; yop?: boolean }
  | { tur: 'taklif'; matn: string; taklif: IshlovTaklif; havolalar?: IshlovHavola[] }
  | { tur: 'obyektTanla'; matn: string; nomzodlar: ObyektQisqa[] }
  /** Obyekt ma'lumoti hali yuklanmoqda — UI tayyor bo'lgach qayta ishlaydi. */
  | { tur: 'kut'; obyektId: number }
  /** Qatlam hal qilmadi — mavjud oqim (server yordamchisi) davom etadi; `havolalar` javobga qo'shiladi. */
  | { tur: 'otkaz'; havolalar: IshlovHavola[] };

export type IshlovDeps = {
  kompaniyaId: number | null;
  sahifalar: readonly YordamchiSahifa[];
  motor: Pick<Motor, 'holat' | 'obyektId' | 'vositalar' | 'qoshimcha' | 'xato'>;
  tarix?: readonly SahifaXabar[];
  qadam?: (q: SiklQadam) => void;
  tirikmi?: () => boolean;
  agent?: typeof agentSikli;
  /** Hujjat o'qish/qoralama yo'llari (haqiqiy yoki test). */
  hujjat?: HujjatDeps;
  /** Hozirgi sahifa amalini bajaradi (registry hook); 	asdiq bo'lsa — avval taklif kartasi. */
  sahifaAmalBajar?: (id: string) => void;
};

const XATO_KODLARI: Record<string, string> = {
  BYUDJET_YOQ: 'AI hali sozlanmagan: oylik limit belgilanmagan. Administratorga murojaat qiling.',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi.', TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring.',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya administratori AI ni o‘chirgan.', FORBIDDEN: 'Bu kompaniyaga ruxsat yo‘q.', AUTH_REQUIRED: 'Sessiya tugagan — qayta kiring.',
};

const h = (s: SahifaHavola): IshlovHavola => ({ yol: s.url, nom: s.nom });
const OY_NOMI = ['', 'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const oyMatni = (oy: string | null) => (oy ? `, ${t(OY_NOMI[Number(oy.slice(5, 7))] ?? oy)} ${oy.slice(0, 4)}` : '');

export async function yordamchiIshla(n: Niyat, matn: string, d: IshlovDeps): Promise<IshlovNatija> {
  switch (n.tur) {
    case 'yordam': return { tur: 'javob', matn: yordamMatni(d.sahifalar) };

    case 'navigatsiya': {
      if (!n.aniqOchish) return { tur: 'otkaz', havolalar: [h(n.sahifa)] };
      const ctx = n.obyekt ? ` (${n.obyekt.nom}${oyMatni(n.oy)})` : n.oy ? ` (${oyMatni(n.oy).slice(2)})` : '';
      const qo = n.qoralama ? `\n${t('Qoralamani shu sahifada o‘zingiz tekshirib tasdiqlaysiz — men hujjatni o‘zim tasdiqlamayman.')}` : '';
      /* «zayavka yarat»: zayavka sahifasi yangi zayavka formasi ochiq holda keladi (yarat=1); yuborishni foydalanuvchi o'zi bosadi (tasdiq kartasi vazifasi). */
      const url = n.qoralama && n.sahifa.yol === '/admin/zayavka' ? n.sahifa.url + (n.sahifa.url.includes('?') ? '&' : '?') + 'yarat=1' : n.sahifa.url;
      return { tur: 'javob', matn: `${t('Ochaman')}: **${n.sahifa.nom}**${ctx}.${qo}`, havolalar: [h(n.sahifa)], ochish: url };
    }

    case 'sahifaTanla':
      return { tur: 'javob', matn: t('Qaysi birini ochay?'), havolalar: n.nomzodlar.map(h) };

    case 'ruxsatYoq':
      return { tur: 'javob', matn: `**${n.nom}** ${t('bo‘limi sizning rolingizga ochiq emas. Kerak bo‘lsa kompaniya administratoridan ruxsat so‘rang.')}` };

    case 'obyektTanla':
      return { tur: 'obyektTanla', matn: t('Qaysi obyekt bo‘yicha? Tanlang — buyruqni shu obyektda bajaraman.'), nomzodlar: n.nomzodlar };

    case 'oqish': {
      if (d.motor.obyektId !== n.obyekt.id || d.motor.holat === 'yuklanmoqda') return { tur: 'kut', obyektId: n.obyekt.id };
      if (!d.motor.vositalar) return { tur: 'javob', xato: true, matn: d.motor.xato || t('Obyekt ma’lumotini o‘qib bo‘lmadi.') };
      const natija = String(await d.motor.vositalar.oqi({ vosita: n.vosita, arg: n.arg }));
      return { tur: 'javob', matn: `**${n.obyekt.nom}**\n\n${natija}`, havolalar: n.sahifa ? [h(n.sahifa)] : undefined };
    }

    case 'yozuv': {
      if (d.kompaniyaId == null) return { tur: 'otkaz', havolalar: [] };
      if (d.motor.obyektId !== n.obyekt.id || d.motor.holat === 'yuklanmoqda') return { tur: 'kut', obyektId: n.obyekt.id };
      if (!d.motor.vositalar) return { tur: 'javob', xato: true, matn: d.motor.xato || t('Obyekt ma’lumotini o‘qib bo‘lmadi.') };
      const v: SahifaVositalar = d.motor.vositalar;
      const r = await (d.agent ?? agentSikli)({ kompaniyaId: d.kompaniyaId, xabarlar: [...(d.tarix ?? []).slice(-6), { rol: 'user', matn }], vositalar: v, qadam: d.qadam, tirikmi: d.tirikmi });
      if (!r.ok) return { tur: 'javob', xato: true, matn: t(XATO_KODLARI[r.code] ?? r.message ?? 'AI hozir javob bermadi. Keyinroq qayta urinib ko‘ring.') };
      const javob = [r.javob, ...r.savollar.map((s) => `• ${s}`)].filter(Boolean).join('\n') || t('Tushunarli.');
      const nav = r.amallar.filter((a) => a.tur === 'och' && !a.ogoh);
      const yozish = r.amallar.filter((a) => a.tur !== 'och');
      if (!yozish.length && !nav.length) return { tur: 'javob', matn: `${javob}\n\n${t('Aniqroq ayting yoki quyidagi sahifalardan birini oching.')}`, havolalar: yaqin(d.sahifalar) };
      return { tur: 'taklif', matn: javob, taklif: { amallar: r.amallar, vositalar: d.motor.vositalar, qoshimcha: d.motor.qoshimcha } };
    }

    case 'qarz': {
      if (!d.hujjat) return { tur: 'otkaz', havolalar: [] };
      const q = d.sahifalar.find((s) => s.yol === '/admin/qarzdorlik');
      return { tur: 'javob', matn: await qarzMatni(d.hujjat), havolalar: q ? [{ yol: q.yol, nom: q.nom }] : undefined };
    }

    case 'f2Royxat': {
      if (!d.hujjat) return { tur: 'otkaz', havolalar: [] };
      const s = d.sahifalar.find((x) => x.yol === '/admin/f2-tarix');
      return { tur: 'javob', matn: `**${n.obyekt.nom}**\n\n${await f2RoyxatMatni(d.hujjat, n.obyekt.id, n.oy)}`, havolalar: s ? [{ yol: sahifaUrl(s.yol, { obyektId: n.obyekt.id, oy: n.oy }), nom: s.nom }] : undefined };
    }

    case 'aosrYetishmaydi': {
      if (!d.hujjat) return { tur: 'otkaz', havolalar: [] };
      const s = d.sahifalar.find((x) => x.yol === '/admin/aosr');
      return { tur: 'javob', matn: `**${n.obyekt.nom}**\n\n${aosrYetishmaydiMatni(await aosrYetishmaydi(d.hujjat, n.obyekt.id))}`, havolalar: s ? [{ yol: s.yol, nom: s.nom }] : undefined };
    }

    case 'f2Qoralama': {
      if (!d.hujjat) return { tur: 'otkaz', havolalar: [] };
      d.qadam?.({ matn: t('Smeta, fakt va narxlarni o‘qiyapman…'), holat: 'ishda' });
      const reja = await f2QoralamaReja(d.hujjat, n.obyekt.id, n.oy);
      const sah = d.sahifalar.find((x) => x.yol === '/admin/f2-tayyorlash');
      const havola = sah ? [{ yol: sahifaUrl(sah.yol, { obyektId: n.obyekt.id, oy: n.oy }), nom: sah.nom }] : undefined;
      if (!reja.ok) return { tur: 'javob', xato: true, matn: `${reja.sabab}\n\n${t('F2 tayyorlash sahifasida davom eting.')}`, havolalar: havola };
      const izoh = `${reja.qatorSoni} ${t('qator')} · ${t('jami')} ${pulMatn(reja.summa)} (${t('ustamasiz, NDS siz')})${reja.narxsiz ? ` · ⚠ ${reja.narxsiz} ${t('qatorda narx yo‘q (qoralamada narxsiz)')}` : ''}`;
      const amal = { tur: 'f2_qoralama', qator: null, qiymat: reja.oy, izoh, ogoh: null };
      return { tur: 'taklif', havolalar: havola, matn: `${t('F2 qoralamasi tayyor, hali yozilmagan')}: **${n.obyekt.nom}**, ${reja.oy}. ${t('Hajm manbai')}: ${reja.manba === 'fakt' ? t('fakt qoldig‘i') : t('smeta')}. ${t('Tasdiqlash F2 tarixida qo‘lda qoladi.')}`,
        taklif: { amallar: [amal], qoshimcha: () => null, vositalar: hujjatVositalari(() => `${t('F2 qoralama yaratish')} · ${n.obyekt.nom} · ${reja.oy}`, () => true, async () => reja.bajar()) } };
    }

    case 'aosrQoralama': {
      if (!d.hujjat) return { tur: 'otkaz', havolalar: [] };
      d.qadam?.({ matn: t('АОСР qamrovini o‘qiyapman…'), holat: 'ishda' });
      const reja = await aosrQoralamaReja(d.hujjat, n.obyekt.id, n.filtr);
      const sah = d.sahifalar.find((x) => x.yol === '/admin/aosr');
      const havola = sah ? [{ yol: sah.yol, nom: sah.nom }] : undefined;
      if ('xato' in reja) return { tur: 'javob', matn: reja.xato, havolalar: havola };
      const amallar = reja.guruhlar.map((g) => ({ tur: 'aosr_qoralama', qator: g.razdelId, qiymat: g.nom || t('Bo‘limsiz'), izoh: `${g.ishlar.length} ${t('ta ish')}`, ogoh: null as string | null }));
      return { tur: 'taklif', havolalar: havola, matn: `${t('АОСР qoralamalari tayyor, hali yozilmagan')}: **${n.obyekt.nom}**. ${t('Holat «yangi»; tasdiqlashni АОСР sahifasida o‘zingiz qilasiz.')}`,
        taklif: { amallar, qoshimcha: () => null, vositalar: hujjatVositalari((a) => `${t('АОСР qoralama')} · ${a.qiymat ?? ''}`, () => false, async (list) => reja.bajar(new Set(list.map((a) => a.qator)))) } };
    }

    case 'sahifaAmal': {
      if (!d.sahifaAmalBajar) return { tur: 'otkaz', havolalar: [] };
      if (!n.amal.tasdiq) { d.sahifaAmalBajar(n.amal.id); return { tur: 'javob', yop: true, matn: `${t('Bajardim')}: **${n.amal.nom}**` }; }
      const amal = { tur: 'sahifa_amal', qator: null, qiymat: n.amal.id, izoh: '', ogoh: null };
      return { tur: 'taklif', matn: `${n.amal.nom} — ${t('tasdiqlaysizmi?')}`,
        taklif: { amallar: [amal], qoshimcha: () => null, vositalar: hujjatVositalari(() => n.amal.nom, () => false, async () => { d.sahifaAmalBajar?.(n.amal.id); return [`✓ ${n.amal.nom}`]; }) } };
    }

    case 'nomalum':
      return { tur: 'otkaz', havolalar: n.yaqin.map(h) };
  }
}

const SUKUT = ['/admin/obyektlar', '/admin/fakt', '/admin/f2-tayyorlash', '/admin/documents'];
const yaqin = (s: readonly YordamchiSahifa[]): IshlovHavola[] => SUKUT.flatMap((y) => { const x = s.find((q) => q.yol === y); return x ? [{ yol: x.yol, nom: x.nom }] : []; });

const pulMatn = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} so‘m`;

/** Hujjat/sahifa amallari uchun taklif kartasi vositalari: faqat nom/pul/bajar (o'qish va tekshirish kerak emas). */
function hujjatVositalari(nomi: (a: SahifaAmal) => string, pul: (a: SahifaAmal) => boolean, bajar: (a: SahifaAmal[]) => Promise<string[]>): IshlovTaklif['vositalar'] {
  return { sahifa: 'buyruq', kontekst: () => '', oqi: () => '', tekshir: () => null, nomi, pul, bajar };
}
