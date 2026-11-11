/**
 * Yagona yordamchi (Jarvis): niyat -> javob/amal. Bu yerda HECH NARSA YOZILMAYDI:
 *  - navigatsiya va o'qish bepul (model yo'q, token yechilmaydi; o'qish sahifalar ishlatadigan hisob yadrosi orqali);
 *  - yozuv niyati — mavjud agent sikli (`agentSikli`, token: /api/smeta-ai aiHisobli, avvalgidek) TAKLIF kartasi qaytaradi;
 *    bajarish alohida, foydalanuvchining «Tasdiqlash» bosishidan keyin (YordamchiTaklif);
 *  - hech qachon rad etmaydi: noma'lum so'rovda eng yaqin sahifa/amallar taklif qilinadi.
 */
import { t } from '../../../i18n/til';
import type { Niyat } from '../../../lib/yordamchi/niyat';
import { yordamMatni } from '../../../lib/yordamchi/vositalar-reestr';
import type { SahifaHavola, YordamchiSahifa } from '../../../lib/yordamchi/sahifa-qidiruv';
import type { ObyektQisqa } from '../../../lib/yordamchi/kontekst-ajrat';
import { agentSikli, type SiklQadam, type SahifaVositalar } from '../../../lib/ai-yordamchi/sikl';
import type { SahifaAmal, SahifaXabar } from '../../../lib/ai-yordamchi/protokol';
import type { Motor } from './useObyektMotor';

/** AiChat ga beriladigan yagona yordamchi ulanishi (AiHelper yig'adi). */
export type YordamchiUlanish = { sahifalar: readonly YordamchiSahifa[]; obyektlar: readonly ObyektQisqa[]; joriyObyekt: ObyektQisqa | null; obyektTanla: (id: number) => void; motor: Motor };

export type IshlovHavola = { yol: string; nom: string };
export type IshlovTaklif = { amallar: Array<SahifaAmal & { ogoh: string | null }>; vositalar: NonNullable<Motor['vositalar']>; qoshimcha: Motor['qoshimcha'] };

export type IshlovNatija =
  | { tur: 'javob'; matn: string; havolalar?: IshlovHavola[]; ochish?: string; xato?: boolean }
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
      return { tur: 'javob', matn: `${t('Ochaman')}: **${n.sahifa.nom}**${ctx}.${qo}`, havolalar: [h(n.sahifa)], ochish: n.sahifa.url };
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

    case 'nomalum':
      return { tur: 'otkaz', havolalar: n.yaqin.map(h) };
  }
}

const SUKUT = ['/admin/obyektlar', '/admin/fakt', '/admin/f2-tayyorlash', '/admin/documents'];
const yaqin = (s: readonly YordamchiSahifa[]): IshlovHavola[] => SUKUT.flatMap((y) => { const x = s.find((q) => q.yol === y); return x ? [{ yol: x.yol, nom: x.nom }] : []; });
