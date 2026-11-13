/**
 * Jarvis vositalar reestri: bitta ta'rif naqshi (tur.ts), har vosita mavjud shlyuz amalini chaqiradi.
 * O'qish: bugun, solishtiruv. Yozish (taklif + tasdiq): F2 tasdiqlash/bekor, xarajat, to'lov, murojaat, taqdim (texnadzorga yuborish).
 * Pul/hujjat vositalari — ikkinchi «Tasdiqlayman». Parametr yetishmasa — BITTA aniqlashtiruvchi savol (variantlar bilan), rad emas.
 */
import { oyAjrat } from '../kontekst-ajrat';
import { jarvisKalitmi, xotiraBuyrugi, xotiraKalit, xotiraTekshir } from '../xotira';
import { sozlar } from '../matn';
import { borMi, katOl, nomMosmi, pulMatn, sanaOl, summaOl, tanlovTop } from './yordam';
import type { Slot, Variant, Vosita, VositaJavob, VositaKont } from './tur';
import { AMALLAR, type Amal } from '../../reestr/amal';
import { amalVositasi } from './amal-vosita';

const ALOQA_FAOL = (x: { faol: boolean }) => x.faol;
const YOZ = ['yoz', 'yozib', 'kirit', 'kiritib', 'qosh', 'qoshib', 'qoy', 'внеси', 'запиши', 'добавь', 'add', 'enter', 'record'];
const YUBOR = ['yubor', 'yuborib', 'jonat', 'topshir', 'taqdim', 'отправь', 'отправить', 'передай', 'send', 'submit'];
const obyektId = (c: VositaKont): number | null => c.obyekt?.id ?? null;
const nomlar = (v: readonly Variant[]) => v.map((x, i) => `${i + 1}. ${x.nom}`).join('\n');
const oy = (xom: string, t: readonly string[], bugun?: Date) => oyAjrat(xom, t, bugun)?.oy ?? null;
const soz = (xom: string, ...q: string[]) => { const m = new RegExp(`(?:${q.join('|')})\\s*[:\\-–]\\s*(.+)$`, 'isu').exec(xom); return m ? m[1].trim() : null; };

function savol(id: string, slot: Slot, kutilgan: string, matn: string, variantlar?: Variant[]): VositaJavob {
  const { __javob: _j, __kutilgan: _k, ...toza } = slot;
  return { tur: 'savol', matn: variantlar?.length ? `${matn}\n${nomlar(variantlar)}` : matn, variantlar, davom: { id, slotlar: toza, kutilgan } };
}
const javob = (matn: string, xato = false): VositaJavob => ({ tur: 'javob', matn, xato: xato || undefined });
const nat = (r: { ok: boolean; error?: string }, yaxshi: string): string[] => [r.ok ? `✓ ${yaxshi}` : `✗ ${r.error ?? 'Amal bajarilmadi'}`];

/** Obyekt: joriy, aks holda savol (variantlar bilan). */
function obyektKerak(c: VositaKont, id: string, slot: Slot): { id: number; nom: string } | VositaJavob {
  const sl = slot.obyektId != null ? c.obyektlar.find((o) => o.id === slot.obyektId) : null;
  const o = sl ?? c.obyekt;
  if (o) return { id: o.id, nom: o.nom };
  if (slot.__kutilgan === 'obyekt' && slot.__javob) {
    const t = tanlovTop(slot.__javob, c.obyektlar);
    if (t) return { id: t.id, nom: t.nom };
  }
  if (!c.obyektlar.length) return javob('Obyekt tanlanmagan. Yuqoridan obyektni tanlang.');
  return savol(id, slot, 'obyekt', 'Qaysi obyekt bo‘yicha?', c.obyektlar.slice(0, 6).map((x) => ({ nom: x.nom, matn: x.nom })));
}
const javobmi = (x: unknown): x is VositaJavob => typeof x === 'object' && x !== null && 'tur' in x;

/** Aloqa (qarshi tomon) tanlash: nom bo'yicha, bo'lmasa savol. */
async function aloqaKerak(c: VositaKont, id: string, slot: Slot, xom: string): Promise<{ id: number; nom: string } | VositaJavob> {
  const royxat = ((await c.api.aloqalar()) ?? []).filter(ALOQA_FAOL);
  if (!royxat.length) return javob('Faol hamkor (aloqa) yo‘q. Avval «Hamkorlar» sahifasida aloqa o‘rnating.', true);
  if (slot.aloqaId != null) { const a = royxat.find((x) => x.id === slot.aloqaId); if (a) return a; }
  if (slot.__kutilgan === 'aloqa' && slot.__javob) { const t = tanlovTop(slot.__javob, royxat); if (t) return t; }
  const t = sozlar(xom);
  const mos = royxat.filter((a) => nomMosmi(t, a.nom));
  if (mos.length === 1) return mos[0];
  if (royxat.length === 1) return royxat[0];
  const v = (mos.length ? mos : royxat).slice(0, 6);
  return savol(id, slot, 'aloqa', 'Qaysi tomonga?', v.map((x) => ({ nom: `${x.nom} (${x.rol})`, matn: x.nom })));
}

/* ───────────────────────────── O'QISH ───────────────────────────── */

const bugunVosita: Vosita = {
  id: 'bugun', tur: 'oqish', pul: false, ruxsat: null, parametrlar: {},
  tavsif: 'Bugun menga nima kutyapti: kelgan taqdimlar, ochiq murojaatlar, to‘lov xabarlari, kechikkanlar.',
  mos: (t) => borMi(t, ['kutyapti', 'kutmoqda', 'kutayotgan', 'kutilayotgan', 'ждет', 'ждёт', 'ожидает', 'waiting']) || (borMi(t, ['bugun', 'bugungi', 'сегодня']) && borMi(t, ['topshiriq', 'vazifa', 'ishlar', 'ish', 'задач', 'дела', 'tasks'])),
  ishla: async (c) => {
    const q = await c.api.bugun();
    const bor = q.filter((x) => x.soni > 0);
    if (!q.length) return javob('Hozircha ma’lumot olinmadi. Birozdan keyin qayta so‘rang.', true);
    if (!bor.length) return javob('Bugun sizni kutayotgan narsa yo‘q — hammasi joyida.');
    return { tur: 'javob', matn: `**Sizni kutayotganlar**\n\n${bor.map((x) => `- ${x.nom}: **${x.soni}**`).join('\n')}`, havolalar: bor.filter((x) => x.yol).map((x) => ({ yol: x.yol!, nom: x.nom })) };
  },
};

const solishtiruvVosita: Vosita = {
  id: 'solishtiruv', tur: 'oqish', pul: false, ruxsat: 'financial.read', parametrlar: { obyekt: { tur: 'tanlov', izoh: 'ixtiyoriy: faqat shu obyekt' } },
  tavsif: 'Solishtiruv: F2, fakt, to‘lov va hujjatlar orasidagi tafovutlar (yuqori jiddiylik oldin).',
  /* Faqat sahifa nomi («Solishtiruv (qayerda farq bor)») navigatsiya bo'lib qoladi; o'qish so'zi bo'lsa vosita. */
  mos: (t) => borMi(t, ['solishtiruv', 'solishtir', 'tafovut', 'nomuvofiq', 'sverka', 'сверк', 'расхожд', 'reconcile']) && borMi(t, ['korsat', 'ayt', 'qancha', 'nechta', 'nima', 'bormi', 'tekshir', 'ochiq', 'покажи', 'сколько', 'есть', 'show', 'list']) && !borMi(t, ['qayerda', 'где']),
  ishla: async (c) => {
    const r = await c.api.solishtiruv(obyektId(c));
    if (!r.ok) return javob(r.error, true);
    const { yuqori_ochiq: y, ochiq: o, tushuntirildi: tu } = r.hisob;
    if (!r.royxat.length && !o) return { tur: 'javob', matn: 'Solishtiruvda ochiq tafovut yo‘q.', havolalar: [{ yol: '/admin/solishtiruv', nom: 'Solishtiruv' }] };
    const top = r.royxat.filter((x) => x.jiddiylik === 'high').concat(r.royxat.filter((x) => x.jiddiylik !== 'high')).slice(0, 5);
    return { tur: 'javob', matn: `**Solishtiruv**: ochiq ${o} (yuqori jiddiylik ${y}), tushuntirilgan ${tu}.\n\n${top.map((x) => `- ${x.obyekt_nom ? `**${x.obyekt_nom}** · ` : ''}${x.nom}: ${x.tavsif}`).join('\n')}`, havolalar: [{ yol: '/admin/solishtiruv', nom: 'Solishtiruv' }] };
  },
};

/* ───────────────────────────── YOZISH ───────────────────────────── */

/** F2 tasdiqlash / bekor: shu obyektdagi F2 aktlardan tanlanadi. Holatga qarab yo'l: qoralama -> eski yo'l, tasdiqlangan -> lifecycle. */
function f2Amal(kind: 'tasdiq' | 'bekor'): Vosita {
  const id = kind === 'tasdiq' ? 'f2_tasdiqla' : 'f2_bekor';
  return {
    id, tur: 'yozish', pul: true, hujjat: true, ruxsat: kind === 'tasdiq' ? 'f2.approve' : 'f2.cancel',
    parametrlar: { obyekt: { tur: 'tanlov', majburiy: true, izoh: 'obyekt' }, oy: { tur: 'sana', izoh: 'F2 oyi' }, ...(kind === 'bekor' ? { sabab: { tur: 'matn', majburiy: true, izoh: 'bekor sababi' } } : {}) },
    tavsif: kind === 'tasdiq' ? 'F2 qoralamasini tasdiqlash (pul ta’sirli: ikkinchi tasdiq).' : 'F2 ni bekor qilish: qoralama — oddiy yo‘l, tasdiqlangan — holat o‘tkazish (sabab majburiy).',
    mos: (t) => (borMi(t, ['f2', 'ф2', 'akt', 'акт']) && !borMi(t, ['tarix', 'тарих', 'история']) && borMi(t, kind === 'tasdiq' ? ['tasdiqla', 'tasdiqlab', 'tasdiqlash', 'утверд', 'approve'] : ['bekor', 'otmena', 'отмен', 'аннул', 'cancel'])),
    ishla: async (c, slot, xom) => {
      const ob = obyektKerak(c, id, slot); if (javobmi(ob)) return ob;
      const sl = { ...slot, obyektId: ob.id };
      const aktlar = await c.api.aktlar(ob.id);
      if (!aktlar) return javob('F2 ro‘yxatini o‘qib bo‘lmadi.', true);
      const t = sozlar(xom);
      const oyK = (slot.oy as string | undefined) ?? oy(xom, t, c.bugun);
      let nomzod = aktlar.filter((a) => a.holat !== 'bekor' && (kind === 'bekor' || a.holat === 'qoralama') && (!oyK || a.oy.slice(0, 7) === oyK));
      if (slot.__kutilgan === 'akt' && slot.__javob) { const tt = tanlovTop(slot.__javob, nomzod.map((a) => ({ nom: `${a.raqam ?? a.id} ${a.oy.slice(0, 7)}`, a }))); if (tt) nomzod = [tt.a]; }
      if (!nomzod.length) return javob(kind === 'tasdiq' ? `**${ob.nom}**: tasdiqlanadigan F2 qoralamasi topilmadi${oyK ? ` (${oyK})` : ''}.` : `**${ob.nom}**: bekor qilinadigan F2 topilmadi${oyK ? ` (${oyK})` : ''}.`);
      if (nomzod.length > 1) return savol(id, { ...sl, oy: oyK }, 'akt', 'Qaysi F2?', nomzod.slice(0, 6).map((a) => ({ nom: `F2 № ${a.raqam ?? a.id} · ${a.oy.slice(0, 7)} · ${a.holat}`, matn: `${a.raqam ?? a.id} ${a.oy.slice(0, 7)}` })));
      const a = nomzod[0];
      const yorlik = `F2 № ${a.raqam ?? a.id} (${ob.nom}, ${a.oy.slice(0, 7)})`;
      const op = c.opId();
      if (kind === 'tasdiq') {
        return { tur: 'taklif', nom: `F2 tasdiqlash · ${yorlik}`, izoh: 'Tasdiqlangach F2 muzlaydi (nakopitelniy/F3 shundan hisoblanadi).', pul: true, matn: `${yorlik} ni tasdiqlashni taklif qilaman. Hali tasdiqlanmagan.`,
          bajar: async () => nat(await c.api.aktTasdiqla(a.id, a.versiya, op), `${yorlik} tasdiqlandi`) };
      }
      const sabab = (slot.sabab as string | undefined) ?? (slot.__kutilgan === 'sabab' ? slot.__javob?.trim() : undefined) ?? soz(xom, 'sabab', 'причина');
      if (!sabab || sabab.length < 5) return savol(id, { ...sl, oy: oyK, aktId: a.id }, 'sabab', `${yorlik} — bekor qilish sababini yozing (kamida 5 belgi).`);
      const qoralama = a.holat === 'qoralama';
      return { tur: 'taklif', nom: `F2 bekor · ${yorlik}`, izoh: `Sabab: ${sabab}. ${qoralama ? 'Qoralama bekor qilinadi.' : 'Tasdiqlangan F2 holat o‘tkazish orqali bekor qilinadi.'}`, pul: true, matn: `${yorlik} ni bekor qilishni taklif qilaman. Hali bekor qilinmagan.`,
        bajar: async () => nat(qoralama ? await c.api.aktBekorQoralama(a.id, sabab, a.versiya) : await c.api.aktBekorLifecycle(a.id, a.versiya, sabab, op), `${yorlik} bekor qilindi`) };
    },
  };
}

const xarajatVosita: Vosita = {
  id: 'xarajat_yoz', tur: 'yozish', pul: true, ruxsat: 'financial.write',
  parametrlar: { summa: { tur: 'son', majburiy: true, izoh: 'so‘m, QQS siz' }, sana: { tur: 'sana', izoh: 'sukut: bugun' }, kat: { tur: 'tanlov', izoh: 'material | mehnat | texnika | boshqa' }, obyekt: { tur: 'tanlov', izoh: 'ixtiyoriy' } },
  tavsif: 'Xarajat yozish (pul: ikkinchi tasdiq, operation_id bilan takrorsiz).',
  mos: (t) => borMi(t, ['xarajat', 'расход', 'expense']) && borMi(t, YOZ),
  ishla: async (c, slot, xom) => {
    let summa = typeof slot.summa === 'number' ? slot.summa : null;
    if (summa == null && slot.__kutilgan === 'summa' && slot.__javob) summa = summaOl(slot.__javob);
    if (summa == null) summa = summaOl(xom);
    if (summa == null || summa <= 0) return savol('xarajat_yoz', slot, 'summa', 'Xarajat summasi qancha? (masalan «12 mln» yoki «250 000»)');
    const t = sozlar(xom);
    const kat = (slot.kat as string | undefined) ?? katOl(t); const sana = (slot.sana as string | undefined) ?? sanaOl(xom, c.bugun);
    const op = c.opId(); const ob = c.obyekt;
    return { tur: 'taklif', nom: `Xarajat · ${pulMatn(summa)}`, izoh: `${sana} · toifa ${kat}${ob ? ` · ${ob.nom}` : ''} · QQS siz`, pul: true, matn: `Xarajat yozishni taklif qilaman: **${pulMatn(summa)}** (${sana}, ${kat}${ob ? `, ${ob.nom}` : ''}). Hali yozilmagan.`,
      bajar: async () => nat(await c.api.xarajatYoz({ obyektId: ob?.id ?? null, sana, kat, summa, izoh: 'Jarvis orqali (tasdiqlangan)', operationId: op }), `Xarajat yozildi: ${pulMatn(summa)}`) };
  },
};

const tolovVosita: Vosita = {
  id: 'tolov_yoz', tur: 'yozish', pul: true, ruxsat: 'financial.write',
  parametrlar: { summa: { tur: 'son', majburiy: true, izoh: 'so‘m' }, shartnoma: { tur: 'tanlov', majburiy: true, izoh: 'shartnoma raqami' }, tur: { tur: 'tanlov', izoh: 'avans | tolov | qaytarim' }, sana: { tur: 'sana', izoh: 'sukut: bugun' } },
  tavsif: 'Shartnoma bo‘yicha to‘lov yozish (pul: ikkinchi tasdiq, operation_id).',
  mos: (t) => borMi(t, ['tolov', 'tulov', 'оплата', 'платеж', 'платёж', 'avans', 'аванс', 'payment']) && borMi(t, YOZ),
  ishla: async (c, slot, xom) => {
    let summa = typeof slot.summa === 'number' ? slot.summa : null;
    if (summa == null && slot.__kutilgan === 'summa' && slot.__javob) summa = summaOl(slot.__javob);
    if (summa == null) summa = summaOl(xom);
    if (summa == null || summa <= 0) return savol('tolov_yoz', slot, 'summa', 'To‘lov summasi qancha? (masalan «50 mln»)');
    const sl: Slot = { ...slot, summa };
    const royxat = await c.api.shartnomalar();
    if (!royxat?.length) return javob('Faol shartnoma topilmadi. Avval shartnomani kiriting.', true);
    let sh = slot.shartnomaId != null ? royxat.find((x) => x.id === slot.shartnomaId) : undefined;
    if (!sh && slot.__kutilgan === 'shartnoma' && slot.__javob) sh = tanlovTop(slot.__javob, royxat.map((x) => ({ nom: `${x.raqam} ${x.nom ?? ''}`, x })))?.x;
    if (!sh) {
      const q = xom.toLowerCase();
      const mos = royxat.filter((x) => x.raqam && new RegExp(`(^|[^\\p{L}\\p{N}])${x.raqam.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(q));
      if (mos.length === 1) sh = mos[0]; else if (royxat.length === 1) sh = royxat[0];
    }
    if (!sh) return savol('tolov_yoz', sl, 'shartnoma', 'Qaysi shartnoma bo‘yicha?', royxat.slice(0, 6).map((x) => ({ nom: `№ ${x.raqam}${x.nom ? ` — ${x.nom}` : ''}`, matn: `${x.raqam} ${x.nom ?? ''}`.trim() })));
    const t = sozlar(xom);
    const tur: 'avans' | 'tolov' | 'qaytarim' = borMi(t, ['avans', 'аванс']) ? 'avans' : borMi(t, ['qaytarim', 'qaytar', 'возврат']) ? 'qaytarim' : 'tolov';
    const sana = (slot.sana as string | undefined) ?? sanaOl(xom, c.bugun); const op = c.opId(); const ob = c.obyekt;
    return { tur: 'taklif', nom: `To‘lov (${tur}) · ${pulMatn(summa)}`, izoh: `Shartnoma № ${sh.raqam} · ${sana}`, pul: true, matn: `To‘lov yozishni taklif qilaman: **${pulMatn(summa)}** (${tur}), shartnoma № ${sh.raqam}, ${sana}. Hali yozilmagan.`,
      bajar: async () => nat(await c.api.tolovYoz({ shartnomaId: sh!.id, summa, tur, sana, obyektId: ob?.id, izoh: 'Jarvis orqali (tasdiqlangan)', operationId: op }), `To‘lov yozildi: ${pulMatn(summa)}`) };
  },
};

const murojaatVosita: Vosita = {
  id: 'murojaat_yubor', tur: 'yozish', pul: false, ruxsat: null,
  parametrlar: { aloqa: { tur: 'tanlov', majburiy: true, izoh: 'qarshi tomon' }, matn: { tur: 'matn', majburiy: true, izoh: 'murojaat matni' } },
  tavsif: 'Tomonga murojaat (remark / predpisaniya / so‘rov) yuborish.',
  mos: (t) => borMi(t, ['murojaat', 'remark', 'predpisaniya', 'обращение', 'замечание', 'предписание']) && borMi(t, [...YUBOR, 'yoz', 'yarat', 'tuz', 'создай', 'napisat', 'send']),
  ishla: async (c, slot, xom) => {
    const a = await aloqaKerak(c, 'murojaat_yubor', slot, xom); if (javobmi(a)) return a;
    const sl: Slot = { ...slot, aloqaId: a.id };
    let matn = (slot.matn as string | undefined) ?? soz(xom, 'murojaat', 'matn', 'remark', 'текст') ?? undefined;
    if (!matn && slot.__kutilgan === 'matn') matn = slot.__javob?.trim();
    if (!matn || matn.length < 5) return savol('murojaat_yubor', sl, 'matn', `**${a.nom}** ga murojaat matnini yozing.`);
    const turlar = (await c.api.murojaatTurlari()) ?? [];
    const t = sozlar(xom);
    const tur = turlar.find((x) => nomMosmi(t, x.nom) || t.includes(x.kalit)) ?? turlar.find((x) => x.kalit === 'remark') ?? turlar[0];
    if (!tur) return javob('Murojaat turlari topilmadi.', true);
    const ob = c.obyekt;
    return { tur: 'taklif', nom: `Murojaat · ${a.nom}`, izoh: `${tur.nom}: ${matn.slice(0, 160)}`, pul: false, matn: `**${a.nom}** ga murojaat yuborishni taklif qilaman (${tur.nom}). Hali yuborilmagan.`,
      bajar: async () => nat(await c.api.murojaatYarat({ aloqaId: a.id, turi: tur.kalit, sarlavha: matn!.slice(0, 120), matn: matn!, obyektId: ob?.id ?? null }), `Murojaat ${a.nom} ga yuborildi`) };
  },
};

const taqdimVosita: Vosita = {
  id: 'taqdim_yubor', tur: 'yozish', pul: true, hujjat: true, ruxsat: null,
  parametrlar: { obyekt: { tur: 'tanlov', majburiy: true, izoh: 'obyekt' }, oy: { tur: 'sana', izoh: 'F2 oyi' }, aloqa: { tur: 'tanlov', majburiy: true, izoh: 'texnadzor / buyurtmachi' } },
  tavsif: 'Tasdiqlangan F2 ni texnadzor/buyurtmachiga taqdim qilish (hujjat: ikkinchi tasdiq).',
  mos: (t) => borMi(t, ['f2', 'ф2']) && borMi(t, [...YUBOR, 'texnadzor', 'технадзор']) && !borMi(t, ['tasdiqla', 'bekor', 'qoralama', 'tayyorla']),
  ishla: async (c, slot, xom) => {
    const ob = obyektKerak(c, 'taqdim_yubor', slot); if (javobmi(ob)) return ob;
    const sl: Slot = { ...slot, obyektId: ob.id };
    const a = await aloqaKerak(c, 'taqdim_yubor', sl, xom); if (javobmi(a)) return a;
    const sl2: Slot = { ...sl, aloqaId: a.id };
    const aktlar = (await c.api.aktlar(ob.id)) ?? [];
    const t = sozlar(xom); const oyK = oy(xom, t, c.bugun);
    const nomzod = aktlar.filter((x) => x.holat === 'tasdiqlangan' && (!oyK || x.oy.slice(0, 7) === oyK));
    if (!nomzod.length) return javob(`**${ob.nom}**: taqdim qilinadigan tasdiqlangan F2 topilmadi${oyK ? ` (${oyK})` : ''}. Avval F2 ni tasdiqlang.`);
    const ak = nomzod[0];
    if (nomzod.length > 1 && !(slot.__kutilgan === 'akt')) return savol('taqdim_yubor', sl2, 'akt', 'Qaysi F2 ni yuboray?', nomzod.slice(0, 6).map((x) => ({ nom: `F2 № ${x.raqam ?? x.id} · ${x.oy.slice(0, 7)}`, matn: `${x.raqam ?? x.id} ${x.oy.slice(0, 7)}` })));
    const tanl = slot.__kutilgan === 'akt' && slot.__javob ? tanlovTop(slot.__javob, nomzod.map((x) => ({ nom: `${x.raqam ?? x.id} ${x.oy.slice(0, 7)}`, x })))?.x : ak;
    if (!tanl) return savol('taqdim_yubor', sl2, 'akt', 'Qaysi F2 ni yuboray?', nomzod.slice(0, 6).map((x) => ({ nom: `F2 № ${x.raqam ?? x.id} · ${x.oy.slice(0, 7)}`, matn: `${x.raqam ?? x.id} ${x.oy.slice(0, 7)}` })));
    const res = ((await c.api.taqdimResurslari()) ?? []).find((r) => /f2/i.test(r.kalit) || /f2|ф2/i.test(r.nom));
    if (!res) return javob('Taqdim turi (F2) topilmadi — sahifada yuboring.', true);
    const yorlik = `F2 № ${tanl.raqam ?? tanl.id} (${ob.nom}, ${tanl.oy.slice(0, 7)})`; const op = c.opId();
    return { tur: 'taklif', nom: `Taqdim · ${yorlik} → ${a.nom}`, izoh: 'Tomonga yuborilgach qaror ular tomonda.', pul: true, matn: `${yorlik} ni **${a.nom}** ga taqdim qilishni taklif qilaman. Hali yuborilmagan.`,
      bajar: async () => nat(await c.api.taqdimYubor({ aloqaId: a.id, resurs: res.kalit, manbaId: tanl.id, operationId: op }), `${yorlik} ${a.nom} ga yuborildi`) };
  },
};

/* ───────────────────────────── XOTIRA ───────────────────────────── */

const DARAJA_NOMI = { foydalanuvchi: 'Shaxsiy', kompaniya: 'Kompaniya', tizim: 'Tizim' } as const;
type XotiraQator = { daraja: 'foydalanuvchi' | 'kompaniya' | 'tizim'; kalit: string; mazmun: string };
const tahrirlanadi = (royxat: readonly XotiraQator[]) => [...royxat.filter((x) => x.daraja === 'foydalanuvchi'), ...royxat.filter((x) => x.daraja === 'kompaniya')];

const xotiraKorsatVosita: Vosita = {
  id: 'xotira_korsat', tur: 'oqish', pul: false, ruxsat: null, parametrlar: {},
  tavsif: 'Jarvis men haqimda nimani biladi: shaxsiy, kompaniya va tizim xotirasi ro‘yxati (unutish uchun raqam bilan).',
  mos: (_t, xom) => xotiraBuyrugi(xom)?.tur === 'korsat',
  ishla: async (c) => {
    const x = await c.api.xotiraOl();
    if (!x) return javob('Xotirani o‘qib bo‘lmadi.', true);
    const t = tahrirlanadi(x); const tizim = x.filter((q) => q.daraja === 'tizim');
    if (!t.length && !tizim.length) return javob('Hozircha men haqingizda hech narsa eslab qolmaganman. «Eslab qol: men doim QQS bilan ko‘raman» deb yozing.');
    const qator = (q: XotiraQator, i: number | null) => `${i != null ? `${i + 1}. ` : '- '}${q.mazmun}`;
    return javob([`**Men sizning haqingizda bilganlarim**`, t.length ? t.map((q, i) => `${DARAJA_NOMI[q.daraja]}: ${qator(q, i)}`).join('\n') : '', tizim.length ? `\n**Tizim qoidalari (hammaga umumiy)**\n${tizim.map((q) => qator(q, null)).join('\n')}` : '', '\nUnutish: «unut 2». Qo‘shish: «eslab qol: …» (kompaniya uchun: «eslab qol: kompaniya: …»).'].filter(Boolean).join('\n'));
  },
};

const xotiraYozVosita: Vosita = {
  id: 'xotira_yoz', tur: 'yozish', pul: false, ruxsat: null,
  parametrlar: { mazmun: { tur: 'matn', majburiy: true, izoh: 'nimani eslab qolish' }, daraja: { tur: 'tanlov', izoh: 'shaxsiy (sukut) | kompaniya (faqat boss/admin)' } },
  tavsif: 'Xotiraga yozish (pul summalari, parol, shaxsiy raqamlar yozilmaydi; ruxsatni kengaytirmaydi).',
  mos: (_t, xom) => xotiraBuyrugi(xom)?.tur === 'yoz',
  ishla: async (c, _slot, xom) => {
    const b = xotiraBuyrugi(xom); if (!b || b.tur !== 'yoz') return javob('Nimani eslab qolay? «Eslab qol: …» deb yozing.');
    const v = xotiraTekshir(b.mazmun);
    if (!v.ok) return javob(`Buni xotiraga yozmayman (${v.sabab}). Pul summalari, parollar va shaxsiy raqamlar saqlanmaydi.`, true);
    const kalit = xotiraKalit(v.mazmun);
    return { tur: 'taklif', nom: `Xotira (${DARAJA_NOMI[b.daraja]})`, izoh: v.mazmun, pul: false, matn: `Eslab qolishni taklif qilaman (${b.daraja === 'kompaniya' ? 'butun kompaniya uchun' : 'faqat siz uchun'}): «${v.mazmun}». Hali saqlanmagan.`,
      bajar: async () => nat(await c.api.xotiraYoz(b.daraja, kalit, v.mazmun), 'Eslab qoldim') };
  },
};

const xotiraUnutVosita: Vosita = {
  id: 'xotira_unut', tur: 'yozish', pul: false, ruxsat: null,
  parametrlar: { raqam: { tur: 'son', majburiy: true, izoh: 'ro‘yxatdagi tartib raqami' } },
  tavsif: 'Xotiradan bitta yozuvni o‘chirish (ro‘yxatdagi raqam bo‘yicha).',
  mos: (_t, xom) => xotiraBuyrugi(xom)?.tur === 'unut',
  ishla: async (c, slot, xom) => {
    const x = await c.api.xotiraOl(); if (!x) return javob('Xotirani o‘qib bo‘lmadi.', true);
    const t = tahrirlanadi(x);
    if (!t.length) return javob('Unutiladigan yozuv yo‘q.');
    const b = xotiraBuyrugi(xom); const belgi = (slot.__kutilgan === 'raqam' ? slot.__javob : b?.tur === 'unut' ? b.belgi : '') ?? '';
    const n = /^\s*(\d{1,3})\s*$/.exec(belgi);
    const tanlangan = n ? t[Number(n[1]) - 1] : belgi.length >= 3 ? t.filter((q) => q.mazmun.toLowerCase().includes(belgi.toLowerCase())) : [];
    const q = Array.isArray(tanlangan) ? (tanlangan.length === 1 ? tanlangan[0] : undefined) : tanlangan;
    if (!q) return savol('xotira_unut', slot, 'raqam', 'Qaysi birini unutay?', t.slice(0, 8).map((y, i) => ({ nom: `${DARAJA_NOMI[y.daraja]}: ${y.mazmun.slice(0, 80)}`, matn: String(i + 1) })));
    if (q.daraja === 'tizim') return javob('Tizim qoidalarini faqat platforma administratori o‘zgartiradi.');
    const daraja = q.daraja;
    return { tur: 'taklif', nom: 'Xotiradan o‘chirish', izoh: q.mazmun, pul: false, matn: `Unutishni taklif qilaman: «${q.mazmun}». Hali o‘chirilmagan.`, bajar: async () => nat(await c.api.xotiraYoz(daraja, q.kalit, '-'), 'Unutdim') };
  },
};
void jarvisKalitmi;

/** Vosita yo'q ishlar: halol javob + sahifa + o'suvchi tizim friksiyasi. */
const YOQ: Array<{ nom: string; kalit: string[]; sahifa: string[] }> = [
  { nom: 'hujjat eksporti', kalit: ['eksport', 'export', 'excel', 'yuklab', 'yuklash', 'скачай', 'выгруз', 'pdf'], sahifa: ['f2-tarix', 'forma3', 'nakopitelniy'] },
  { nom: 'zamena / qo‘shimcha ish', kalit: ['zamena', 'замена', 'qoshimcha', 'дополнительн'], sahifa: ['fakt'] },
  { nom: 'slichitelniy', kalit: ['slichitelniy', 'сличительн'], sahifa: ['slichitelniy'] },
];
const yoqVosita: Vosita = {
  id: 'yoq', tur: 'oqish', pul: false, ruxsat: null, parametrlar: {}, tavsif: 'Hali vositasi yo‘q ishlar: sahifani ochadi va bo‘shliqni yozib qo‘yadi.',
  mos: (t, xom) => YOQ.some((y) => borMi(t, y.kalit) || y.kalit.some((k) => xom.toLowerCase().includes(k))) && borMi(t, [...YOZ, 'yarat', 'tuz', 'qil', 'ber', 'ol', 'yubor', 'chiqar', 'tayyorla', 'сделай', 'создай', 'export']),
  ishla: async (c, _slot, xom) => {
    const t = sozlar(xom);
    const y = YOQ.find((x) => borMi(t, x.kalit) || x.kalit.some((k) => xom.toLowerCase().includes(k))) ?? YOQ[0];
    c.api.friksiya(y.nom);
    const sah = c.sahifalar.filter((s) => y.sahifa.some((p) => s.yol.includes(p))).slice(0, 3);
    return { tur: 'javob', matn: `**${y.nom}** — buni hozircha Jarvis orqali oxirigacha bajara olmayman, sahifada qilasiz. So‘rovingiz yozib qo‘yildi: tizim bu bo‘shliqni to‘ldirish navbatiga oldi.`, havolalar: sah.map((s) => ({ yol: s.yol, nom: s.nom })) };
  },
};

/** Qo'lda yozilgan vositalar (aniq nuqta: dialog, maxsus qoidalar). `yoq` — oxirgi zaxira, shuning uchun alohida. */
const QOLDA: readonly Vosita[] = [xotiraKorsatVosita, xotiraYozVosita, xotiraUnutVosita, bugunVosita, solishtiruvVosita, f2Amal('tasdiq'), f2Amal('bekor'), xarajatVosita, tolovVosita, murojaatVosita, taqdimVosita];

/** Amal reestri (lib/reestr/amal.ts) yozuvidan vosita: parallel ta'rif yo'q. */
export function reestrdanVosita(yozuv: Amal): Vosita | null { return amalVositasi(yozuv); }

/** Reestrdan hosila vositalar; nomi QO'LDA vosita bilan bir xil bo'lsa — qo'lda ustun (bu yerdan tushib qoladi). */
const QOLDA_NOMLAR = new Set([...QOLDA.map((v) => v.id), yoqVosita.id]);
export const AMAL_VOSITALARI: readonly Vosita[] = AMALLAR.map(reestrdanVosita).filter((v): v is Vosita => !!v && !QOLDA_NOMLAR.has(v.id));

export const VOSITALAR: readonly Vosita[] = [...QOLDA, ...AMAL_VOSITALARI, yoqVosita];
export const vositaOl = (id: string) => VOSITALAR.find((v) => v.id === id) ?? null;
/** Mahalliy moslik: tuzilgan vositalardan birinchisi (maxsusdan umumiyga tartibda). */
export function vositaTop(xom: string): Vosita | null {
  const t = sozlar(xom);
  return VOSITALAR.find((v) => v.mos(t, xom)) ?? null;
}
