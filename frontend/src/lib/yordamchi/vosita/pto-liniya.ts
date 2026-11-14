/**
 * PTO LINIYASI vositalari (2026-11-14): obyekt holati (SERVER summa paketi), F-2 ni tasdiqlashga yuborish, hujjat yasash yo'li (F-3, nakopitelniy,
 * slichitelniy), AI ishchilar (ko'rish + topshirish), Moslash qutisi (kunlik avtomat tekshiruvlar, FAQAT o'qish).
 * Pul qoidasi: birlik narxi QQS siz; jami avval QQS bilan, keyin ustamali, keyin ustamasiz. NULL ≠ 0 (noma'lum — «—»). Hisob YO'Q: faqat server paketini ko'rsatish.
 * Yozuvchi vositalar taklif kartasi qaytaradi (tasdiq — foydalanuvchida); operation_id taklif tuzilganda bir marta yaratiladi.
 */
import { sozlar } from '../matn';
import { sahifaUrl } from '../sahifa-qidiruv';
import { borMi, nomMosmi, pulMatn, tanlovTop } from './yordam';
import type { IshchiQisqa, ObyektHolatMalumot, PaketUchlik, QatorQisqa, Slot, Variant, Vosita, VositaJavob, VositaKont } from './tur';
import type { MoslashBand } from '../../../api/t2-moslash';
import { oyAjrat } from '../kontekst-ajrat';

const javob = (matn: string, xato = false): VositaJavob => ({ tur: 'javob', matn, xato: xato || undefined });
const YUBOR = ['yubor', 'yuborib', 'jonat', 'topshir', 'отправь', 'отправить', 'send', 'submit'];
const sum = (n: number | null | undefined) => (n == null ? '—' : pulMatn(n));

/** Server paketi uchligi bir qatorda: QQS bilan (asosiy) · ustamali (QQS siz) · ustamasiz. */
export function uchlikMatni(p: PaketUchlik | null): string {
  if (!p) return '—';
  return `${pulMatn(p.qqs_bilan)} (QQS bilan) · ${pulMatn(p.ustamali)} (ustamali, QQS siz) · ${pulMatn(p.ustamasiz)} (ustamasiz)${p.narxsiz_soni ? ` · ⚠ ${p.narxsiz_soni} narxsiz qator` : ''}`;
}

const DIQQAT_NOMI: Record<string, string> = {
  fakt_topshirilmagan: 'fakt F-2 dan ko‘p (topshirilmagan ish)', f2_faktdan_oshgan: 'F-2 faktdan ko‘p', smetadan_oshgan: 'hajm smetadan oshgan',
  f3_chiqarilmagan: 'tasdiqlangan F-2 bor, F-3 chiqarilmagan', narxsiz: 'narxsiz qatorlar', sklad_manfiy: 'sklad qoldig‘i manfiy',
};

/** Obyekt holati: SERVER paketidan (svod/yaxlit hisobga olingan — mijozda qayta hisoblanmaydi). */
export function obyektHolatMatni(h: ObyektHolatMalumot): string {
  const q = [
    `**Server hisobi** (yagona summa paketi — svod/yaxlit hisobga olingan)`,
    h.shartnoma ? `- Shartnoma${h.shartnoma.raqam ? ` № ${h.shartnoma.raqam}` : ''}: ${sum(h.shartnoma.qqs_bilan)} (QQS bilan)${h.shartnoma.umumiy ? ' — umumiy, bir necha obyekt' : ''}` : '',
    `- Smeta: ${uchlikMatni(h.smeta)}`,
    `- Fakt: ${uchlikMatni(h.fakt)}`,
    `- F-2 (tasdiqlangan): ${uchlikMatni(h.f2)}`,
    `- F-2 qoralamalari: ${h.f2Qoralama.soni} ta${h.f2Qoralama.qqs_bilan != null ? ` · ${pulMatn(h.f2Qoralama.qqs_bilan)} (QQS bilan)` : ''}`,
    `- F-3: ${h.f3 ? `${h.f3.soni} ta · ${sum(h.f3.sotuv)}` : '—'}`,
    `- To‘langan: ${sum(h.tolangan)} · qarz: ${sum(h.qarz)}`,
    `- Bajarilish: fakt ${h.bajarilish.fakt ?? '—'}% · F-2 ${h.bajarilish.f2 ?? '—'}% · F-3 ${h.bajarilish.f3 ?? '—'}%`,
    h.signal.soni ? `- Signal: ${h.signal.soni} ta${h.signal.kritik ? ` (kritik ${h.signal.kritik})` : ''}` : '',
    ...h.diqqat.map((d) => `- ⚠ ${DIQQAT_NOMI[d.kod] ?? d.kod}${d.soni ? ` (${d.soni})` : ''}`),
  ];
  return q.filter(Boolean).join('\n');
}

/* ───────────── F-2 ni TASDIQLASHGA YUBORISH (lifecycle draft -> submitted) ───────────── */

const f2YuborVosita: Vosita = {
  id: 'f2_yubor', tur: 'yozish', pul: false, hujjat: true, ruxsat: 'f2.approve',
  parametrlar: { oy: { tur: 'sana', izoh: 'F2 oyi' } },
  tavsif: 'F-2 qoralamasini tasdiqlashga yuborish (draft → submitted). Tasdiqlash alohida qadam; yuborilgach qoralama tahriri cheklanadi.',
  mos: (t) => borMi(t, ['f2', 'ф2']) && borMi(t, ['tasdiqga', 'tasdiqlashga', 'утверждение', 'согласование', 'approval']) && borMi(t, YUBOR),
  ishla: async (c, slot, xom) => {
    if (!c.api.f2TasdiqgaYubor) return javob('F-2 ni tasdiqlashga yuborish bu yerda hali ulanmagan — F2 tarixi sahifasida yuboring.', true);
    const ob = slot.obyektId != null ? c.obyektlar.find((o) => o.id === slot.obyektId) ?? c.obyekt : c.obyekt;
    if (!ob) return { tur: 'savol', matn: 'Qaysi obyekt bo‘yicha?', variantlar: c.obyektlar.slice(0, 6).map((x) => ({ nom: x.nom, matn: x.nom })), davom: { id: 'f2_yubor', slotlar: { __asl: xom }, kutilgan: 'obyekt' } };
    const aktlar = (await c.api.aktlar(ob.id)) ?? [];
    const oyK = oyAjrat(xom, sozlar(xom), c.bugun)?.oy ?? null;
    const nomzod = aktlar.filter((a) => a.holat === 'qoralama' && (a.lifecycle_status ?? 'draft') === 'draft' && (!oyK || a.oy.slice(0, 7) === oyK));
    if (!nomzod.length) return javob(`**${ob.nom}**: tasdiqlashga yuboriladigan F-2 qoralamasi topilmadi${oyK ? ` (${oyK})` : ''}.`);
    if (nomzod.length > 1 && !(slot.__kutilgan === 'akt')) {
      const v: Variant[] = nomzod.slice(0, 6).map((a) => ({ nom: `F2 № ${a.raqam ?? a.id} · ${a.oy.slice(0, 7)}`, matn: `${a.raqam ?? a.id} ${a.oy.slice(0, 7)}` }));
      return { tur: 'savol', matn: `Qaysi F2?\n${v.map((x, i) => `${i + 1}. ${x.nom}`).join('\n')}`, variantlar: v, davom: { id: 'f2_yubor', slotlar: { obyektId: ob.id, __asl: xom }, kutilgan: 'akt' } };
    }
    const tanl = slot.__kutilgan === 'akt' && slot.__javob ? tanlovTop(slot.__javob, nomzod.map((a) => ({ nom: `${a.raqam ?? a.id} ${a.oy.slice(0, 7)}`, a })))?.a : nomzod[0];
    if (!tanl) return javob('Qaysi F2 ekanini aniqlay olmadim — raqam bilan yozing.');
    const yorlik = `F2 № ${tanl.raqam ?? tanl.id} (${ob.nom}, ${tanl.oy.slice(0, 7)})`; const op = c.opId();
    return { tur: 'taklif', nom: `F2 tasdiqlashga yuborish · ${yorlik}`, izoh: 'Holat: qoralama → yuborilgan. Tasdiqlash alohida (f2.approve).', pul: false,
      matn: `${yorlik} ni tasdiqlashga yuborishni taklif qilaman. Hali yuborilmagan.`,
      bajar: async () => { const r = await c.api.f2TasdiqgaYubor!(tanl.id, tanl.versiya, op); return [r.ok ? `✓ ${yorlik} tasdiqlashga yuborildi` : `✗ ${r.error ?? 'Amal bajarilmadi'}`]; } };
  },
};

/* ───────────── HUJJAT YASASH: F-3 / nakopitelniy / slichitelniy ───────────── */

const HUJJATLAR: Array<{ nom: string; kalit: string[]; sahifa: string[] }> = [
  { nom: 'F-3 (Forma 3)', kalit: ['f3', 'ф3', 'forma3', 'forma', 'форма'], sahifa: ['forma3', 'nakopitelniy'] },
  { nom: 'Nakopitelniy vedomost', kalit: ['nakopitelniy', 'накопительн'], sahifa: ['nakopitelniy'] },
  { nom: 'Slichitelniy vedomost', kalit: ['slichitelniy', 'сличительн'], sahifa: ['slichitelniy', 'aosr'] },
  /* АОСР pechat kitobi: kitob Excel (aosrKitobExcel, «sanasiz» opsiya bilan) АОСР sahifasida yasaladi — akt ma'lumotini yig'ish (logo, tartib) shu sahifaning ichida. */
  { nom: 'АОСР pechat kitobi (Excel; «sanasiz» tanlovi sahifada)', kalit: ['kitob', 'kitobi', 'kitobini', 'книга', 'книгу'], sahifa: ['aosr'] },
];
const hujjatYasaVosita: Vosita = {
  id: 'hujjat_yasa', tur: 'oqish', pul: false, ruxsat: null, parametrlar: { hujjat: { tur: 'tanlov', majburiy: true, izoh: 'F-3 | nakopitelniy | slichitelniy' } },
  tavsif: 'F-3 / nakopitelniy / slichitelniy hujjatini yasash: aniq sahifani obyekt va oy bilan ochadi; yuklab olishda token yechiladi (mavjud mexanizm, qayta yuklash — bepul).',
  mos: (t) => HUJJATLAR.some((h) => borMi(t, h.kalit)) && borMi(t, ['eksport', 'export', 'excel', 'yuklab', 'yuklash', 'yasa', 'chiqar', 'pechat', 'chop', 'печать', 'скачай', 'выгруз', 'создай', 'pdf']) && !borMi(t, ['f2', 'ф2', 'qoralama']),
  ishla: async (c, _slot, xom) => {
    const t = sozlar(xom);
    const h = HUJJATLAR.find((x) => borMi(t, x.kalit)) ?? HUJJATLAR[0];
    const oy = oyAjrat(xom, t, c.bugun)?.oy ?? null;
    const sah = h.sahifa.map((p) => c.sahifalar.find((s) => s.yol.includes(p))).find(Boolean) ?? null;
    if (!sah) { c.api.friksiya(`${h.nom} yasash`); return javob(`**${h.nom}** sahifasi sizning rolingizda ochiq emas yoki topilmadi.`); }
    return { tur: 'javob', matn: `**${h.nom}** sahifada yasaladi${c.obyekt ? ` (${c.obyekt.nom}${oy ? `, ${oy}` : ''})` : ''}: sahifani ochaman, «Yuklab olish» tugmasini o‘zingiz bosasiz. Yuklashda token yechiladi (hujjat hajmiga qarab), shu hujjatni qayta yuklash bepul.`,
      havolalar: [{ yol: sahifaUrl(sah.yol, { obyektId: c.obyekt?.id ?? null, oy }), nom: sah.nom }] };
  },
};

/* ───────────── AI ISHCHILAR: ko'rish va topshirish (Jarvis — orkestrator) ───────────── */

const IShCHI_SO = ['ishchi', 'ishchilar', 'ishchiga', 'ишчи', 'агент', 'worker', 'workers'];
const holatMatni = (i: IshchiQisqa) => `${i.nom}: ${i.yoqilgan ? 'yoqilgan' : 'o‘chiq'}${i.jadval !== 'qolda' ? ` (${i.jadval})` : ''}${i.oxirgiHolat ? ` · oxirgi ish: ${i.oxirgiHolat}` : ''}${i.yangiNatija ? ` · yangi natija: **${i.yangiNatija}**` : ''}`;

const ishchiHolatVosita: Vosita = {
  id: 'ishchi_holat', tur: 'oqish', pul: false, ruxsat: null, parametrlar: {},
  tavsif: 'AI ishchilar holati va natijalari (inbox): kim yoqilgan, oxirgi ish, yangi natijalar.',
  mos: (t) => borMi(t, IShCHI_SO) && borMi(t, ['holat', 'holati', 'natija', 'natijasi', 'inbox', 'korsat', 'qanday', 'ayt', 'статус']) && !borMi(t, ['topshir', 'ishga', 'tushir', 'yurgiz']),
  ishla: async (c) => {
    if (!c.api.ishchilar) return javob('AI ishchilar ro‘yxati bu yerda hali ulanmagan.', true);
    const [ish, nat] = await Promise.all([c.api.ishchilar(), c.api.ishchiNatijalari?.() ?? Promise.resolve(null)]);
    if (!ish) return javob('AI ishchilar holatini o‘qib bo‘lmadi (ruxsat yoki tarmoq).', true);
    const yangi = (nat ?? []).filter((x) => x.holat === 'yangi').slice(0, 5);
    return { tur: 'javob', matn: [`**AI ishchilar**`, ...ish.map((i) => `- ${holatMatni(i)}`), yangi.length ? `\n**Yangi natijalar**\n${yangi.map((x) => `- ${x.sarlavha}: ${x.xulosa.slice(0, 160)}`).join('\n')}` : '', '\nIshchini yoqish — sahifada (boss); topshirish: «kunlik nazoratchiga topshir».'].filter(Boolean).join('\n'),
      havolalar: c.sahifalar.filter((s) => s.yol.includes('ai-agentlar')).slice(0, 1).map((s) => ({ yol: s.yol, nom: s.nom })) };
  },
};

const ishchiTopshirVosita: Vosita = {
  id: 'ishchi_topshir', tur: 'yozish', pul: false, ruxsat: null, parametrlar: { ishchi: { tur: 'tanlov', majburiy: true, izoh: 'qaysi AI ishchi' } },
  tavsif: 'Vazifani AI ishchiga topshirish (hozir ishga tushirish). Ishchi faqat natija/taklif yozadi — pul va hujjatni o‘zi o‘zgartirmaydi; token hisobi serverda.',
  mos: (t) => borMi(t, ['topshir', 'ishga', 'tushir', 'yurgiz', 'ishlat', 'запусти', 'run']) && borMi(t, ['nazoratchi', 'nazoratchiga', 'tekshiruvchi', 'tekshiruvchiga', 'kuzatuvchi', 'kuzatuvchiga', 'sogligi', ...IShCHI_SO]),
  ishla: async (c, slot, xom) => {
    if (!c.api.ishchilar || !c.api.ishchiTopshir) return javob('AI ishchiga topshirish bu yerda hali ulanmagan.', true);
    const royxat = ((await c.api.ishchilar()) ?? []).filter((i) => i.yoqilgan);
    if (!royxat.length) return javob('Yoqilgan AI ishchi yo‘q. Avval AI ishchilar sahifasida (boss) kerakli ishchini yoqing.');
    const t = sozlar(xom);
    let mos = royxat.filter((i) => nomMosmi(t, i.nom));
    if (slot.__kutilgan === 'ishchi' && slot.__javob) { const x = tanlovTop(slot.__javob, royxat); if (x) mos = [x]; }
    if (mos.length !== 1) {
      const v: Variant[] = (mos.length ? mos : royxat).slice(0, 6).map((i) => ({ nom: i.nom, matn: i.nom }));
      return { tur: 'savol', matn: `Qaysi ishchiga?\n${v.map((x, i) => `${i + 1}. ${x.nom}`).join('\n')}`, variantlar: v, davom: { id: 'ishchi_topshir', slotlar: { __asl: xom }, kutilgan: 'ishchi' } };
    }
    const i = mos[0]; const op = c.opId();
    return { tur: 'taklif', nom: `AI ishchiga topshirish · ${i.nom}`, izoh: 'Ishchi hozir ishga tushadi; natija inboxda. Token hisobi serverda.', pul: false, matn: `**${i.nom}** ishchisini hozir ishga tushirishni taklif qilaman. Hali ishga tushmagan.`,
      bajar: async () => { const r = await c.api.ishchiTopshir!(i.kod, op); return [r.ok ? `✓ ${i.nom} ishga tushdi — natija «AI ishchilar» inboxida (Jarvis: «ishchilar natijasi»)` : `✗ ${r.error ?? 'Amal bajarilmadi'}`]; } };
  },
};

/* ───────────── MOSLASH QUTISI (istisnolar): FAQAT aniqlaydi va ko'rsatadi ───────────── */

export const MOSLASH_NOMI: Record<string, string> = {
  f2_podval_farq: 'F-2: tizim jami ≠ podval hujjat jami', f2_podval_yoq: 'F-2: podvali yo‘q akt', kesh_eskirgan: 'Obyekt keshi eskirgan',
  fakt_kam_f2: 'Fakt < F-2 («к снятию» nomzodi)', narxsiz: 'Narxsiz qatorlar', f3_f2_farq: 'F-3 jami ≠ F-2 lar yig‘indisi',
};
export function moslashMatni(bandlar: readonly MoslashBand[], jami: number): { matn: string; havolalar: Array<{ yol: string; nom: string }> } {
  if (!jami) return { matn: '**Moslash qutisi** — tizim topgan tafovut yo‘q.', havolalar: [] };
  const turlar = [...new Set(bandlar.map((b) => b.tur))];
  const qismlar = turlar.map((tur) => {
    const l = bandlar.filter((b) => b.tur === tur);
    return `**${MOSLASH_NOMI[tur] ?? tur}** — ${l.length}\n${l.slice(0, 4).map((b) => `- ${b.obyekt_nom ?? 'Obyekt'}${b.akt_raqam ? ` · ${b.tur === 'f3_f2_farq' ? 'shartnoma' : 'akt'} № ${b.akt_raqam}` : ''}${b.farq != null ? ` · farq ${pulMatn(b.farq)}` : b.summa != null ? ` · ${pulMatn(b.summa)}` : ''}${b.tur === 'narxsiz' ? ` · ${b.izoh}` : ''}`).join('\n')}`;
  });
  const havolalar = bandlar.slice(0, 5).map((b) => ({ yol: b.havola, nom: `${MOSLASH_NOMI[b.tur] ?? b.tur}${b.obyekt_nom ? `: ${b.obyekt_nom}` : ''}`.slice(0, 70) }));
  return { matn: `**Moslash qutisi** — ${jami} ta band (tizim faqat aniqlaydi; tuzatishni siz qilasiz)\n\n${qismlar.join('\n\n')}`, havolalar };
}
const moslashVosita: Vosita = {
  id: 'moslash', tur: 'oqish', pul: false, ruxsat: 'financial.read', parametrlar: {},
  tavsif: 'Moslash qutisi: kunlik avtomat tekshiruvlar (F-2 podval/hujjat jami, kesh, fakt<F-2, narxsiz, F-3). Faqat o‘qiydi.',
  mos: (t) => borMi(t, ['moslash', 'istisno', 'istisnolar', 'исключени', 'несоответстви']) && borMi(t, ['quti', 'qutisi', 'qutu', 'korsat', 'nima', 'bormi', 'ayt', 'tekshiruv', 'покажи', 'ящик', 'show']),
  ishla: async (c) => {
    if (!c.api.moslash) return javob('Moslash qutisi bu yerda hali ulanmagan.', true);
    const r = await c.api.moslash();
    if (!r) return javob('Moslash qutisini o‘qib bo‘lmadi (ruxsat, tarmoq yoki hisob hali yoqilmagan). «0 ta tafovut» deb o‘ylamang — ma’lumot olinmadi.', true);
    if (r.hisoblanmagan) return javob('**Moslash qutisi** hali hisoblanmagan — kunlik hisob navbatda (yoki migratsiya yangi qo‘llangan). «Tafovut yo‘q» degani EMAS.');
    const m = moslashMatni(r.bandlar, r.jami);
    const eski = r.eskirgan ? '\n\n⚠ Hisob 30 soatdan eski — kunlik yangilanish kechikdi.' : r.hisoblandi ? `\n\nHisoblangan: ${r.hisoblandi.slice(0, 16).replace('T', ' ')} (kunlik)` : '';
    return { tur: 'javob', matn: m.matn + eski, havolalar: m.havolalar };
  },
};

/* ───────────── SLICHITELNIY SIKLI: к доплате → F-2 qoralama, к снятию → tuzatuvchi (minus) qoralama ───────────── */

function obyektOl(c: VositaKont, id: string, slot: Slot, xom: string): { id: number; nom: string } | VositaJavob {
  const o = slot.obyektId != null ? c.obyektlar.find((x) => x.id === slot.obyektId) ?? c.obyekt : c.obyekt;
  if (o) return { id: o.id, nom: o.nom };
  if (slot.__kutilgan === 'obyekt' && slot.__javob) { const t = tanlovTop(slot.__javob, c.obyektlar); if (t) return { id: t.id, nom: t.nom }; }
  if (!c.obyektlar.length) return javob('Obyekt tanlanmagan. Yuqoridan obyektni tanlang.');
  const v: Variant[] = c.obyektlar.slice(0, 6).map((x) => ({ nom: x.nom, matn: x.nom }));
  return { tur: 'savol', matn: `Qaysi obyekt bo‘yicha?\n${v.map((x, i) => `${i + 1}. ${x.nom}`).join('\n')}`, variantlar: v, davom: { id, slotlar: { ...slot, __asl: xom }, kutilgan: 'obyekt' } };
}
const javobmi = (x: unknown): x is VositaJavob => typeof x === 'object' && x !== null && 'tur' in x;
const savolQil = (id: string, slot: Record<string, unknown>, xom: string, kutilgan: string, matn: string, variantlar?: Variant[]): VositaJavob =>
  ({ tur: 'savol', matn: variantlar?.length ? `${matn}\n${variantlar.map((x, i) => `${i + 1}. ${x.nom}`).join('\n')}` : matn, variantlar, davom: { id, slotlar: { ...slot, __asl: xom }, kutilgan } });
const etiket = (xom: string, ...nomlar: string[]): string | null => {
  const m = new RegExp(`(?:^|[\\s,;|])(?:${nomlar.join('|')})\\s*[:=]\\s*(.+?)(?=\\s*(?:[,;|]\\s*)?(?:asl|yangi|nom|birlik|hajm|sabab|raqam|oy)\\s*[:=]|$)`, 'isu').exec(xom);
  return m ? m[1].trim().replace(/[,;|]$/, '').trim() : null;
};

const slichitelniyTsiklVosita: Vosita = {
  id: 'slichitelniy_tsikl', tur: 'yozish', pul: true, hujjat: true, ruxsat: 'f2.prepare',
  parametrlar: { obyekt: { tur: 'tanlov', majburiy: true, izoh: 'obyekt' }, tur: { tur: 'tanlov', majburiy: true, izoh: 'к доплате | к снятию' }, raqam: { tur: 'matn', majburiy: true, izoh: 'qoralama raqami (masalan 12-П)' } },
  tavsif: 'Slichitelniy sikli: «к доплате» qatorlaridan F-2 qoralama, «к снятию» qatorlaridan tuzatuvchi (minus) F-2 qoralama. Hisob hujjat bilan bir xil; qoralama yaratiladi, TASDIQLANMAYDI.',
  mos: (t) => borMi(t, ['slichitelniy', 'сличительн', 'pereraschet', 'перерасчет', 'перерасчёт']) && borMi(t, ['sikl', 'tsikl', 'doplata', 'доплат', 'snyatie', 'снят', 'qoralama', 'qoralamasi', 'черновик']),
  ishla: async (c, slot, xom) => {
    if (!c.api.slichitelniyHisob || !c.api.slichitelniyYarat) return javob('Slichitelniy sikli bu yerda hali ulanmagan — Slichitelniy sahifasida «Hisoblash» tugmasini ishlating.', true);
    const ob = obyektOl(c, 'slichitelniy_tsikl', slot, xom); if (javobmi(ob)) return ob;
    const h = await c.api.slichitelniyHisob(ob.id);
    if (!h) return javob(`**${ob.nom}**: slichitelniy hisoblanmadi (ma’lumot yoki ruxsat). Qayta urinib ko‘ring.`, true);
    const bor = { doplata: h.doplata.soni > 0, snyatie: h.snyatie.soni > 0 };
    const hisobMatni = `**${ob.nom}** — slichitelniy sikli (fakt − ilgari olingan Ф-2)\n- К доплате (+): ${h.doplata.soni} qator · ${pulMatn(h.doplata.jami)} (ustamasiz)\n- К снятию (−): ${h.snyatie.soni} qator · ${pulMatn(h.snyatie.jami)} (ustamasiz)${h.sigmadi ? `\n- ⚠ ${h.sigmadi} qator qoralamaga sig‘madi (hajm farqi 0)` : ''}${h.nomalum ? `\n- ⚠ ${h.nomalum} pozitsiya noma’lum (fakt/narx/Ф-2 yo‘q) — yukka kirmaydi` : ''}`;
    if (!bor.doplata && !bor.snyatie) return javob(`${hisobMatni}\n\nQoralama yaratiladigan qator yo‘q.`);
    const t = sozlar(xom);
    let tur: 'doplata' | 'snyatie' | null = (slot.tur as 'doplata' | 'snyatie' | undefined) ?? (borMi(t, ['snyatie', 'снят', 'tuzatuvchi', 'minus']) ? 'snyatie' : borMi(t, ['doplata', 'доплат']) ? 'doplata' : null);
    if (slot.__kutilgan === 'tur' && slot.__javob) tur = borMi(sozlar(slot.__javob), ['snyatie', 'снят', 'tuzatuvchi', 'minus']) || /^2/.test(slot.__javob.trim()) ? 'snyatie' : 'doplata';
    if (!tur) tur = bor.doplata && !bor.snyatie ? 'doplata' : bor.snyatie && !bor.doplata ? 'snyatie' : null;
    const sl = { ...slot, obyektId: ob.id };
    if (!tur) return savolQil('slichitelniy_tsikl', sl, xom, 'tur', `${hisobMatni}\n\nQaysi qoralama?`, [{ nom: 'К доплате → F-2 qoralama', matn: 'doplata' }, { nom: 'К снятию → tuzatuvchi (minus) qoralama', matn: 'snyatie' }]);
    if (!bor[tur]) return javob(`${hisobMatni}\n\nBu tur bo‘yicha yoziladigan qator yo‘q.`);
    const raqam = (slot.raqam as string | undefined) ?? etiket(xom, 'raqam') ?? (slot.__kutilgan === 'raqam' ? slot.__javob?.trim() : undefined);
    if (!raqam || raqam.length > 30) return savolQil('slichitelniy_tsikl', { ...sl, tur }, xom, 'raqam', `${hisobMatni}\n\nQoralama raqamini yozing (masalan 12-П; oxiriga ${tur === 'doplata' ? '«-Д»' : '«-К»'} qo‘shiladi).`);
    const aktRaqam = `${raqam}-${tur === 'doplata' ? 'Д' : 'К'}`;
    const bd = c.bugun ?? new Date();
    const oy = oyAjrat(xom, t, c.bugun)?.oy ?? `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}`;
    const aktlar = (await c.api.aktlar(ob.id)) ?? [];
    if (aktlar.some((a) => a.holat !== 'bekor' && a.raqam === aktRaqam && a.oy.slice(0, 7) === oy)) return javob(`**${ob.nom}**: «${aktRaqam}» raqamli F-2 ${oy} oyida allaqachon bor — boshqa raqam yozing.`, true);
    const op = c.opId(); const n = tur === 'doplata' ? h.doplata : h.snyatie;
    return { tur: 'taklif', nom: `Slichitelniy sikli · ${tur === 'doplata' ? 'к доплате' : 'к снятию'} · ${aktRaqam}`, pul: true,
      izoh: `${n.soni} qator · ${pulMatn(n.jami)} (ustamasiz). F-2 QORALAMA yaratiladi (${oy}); tasdiqlash — F2 tarixida, alohida. Token yechiladi (sahifadagi bilan bir xil).`,
      matn: `${hisobMatni}\n\n${aktRaqam} qoralamasini yaratishni taklif qilaman. Hali yaratilmagan.`,
      bajar: async () => { const r = await c.api.slichitelniyYarat!({ obyektId: ob.id, tur: tur!, oy, raqam, operationId: op }); return [r.ok ? `✓ F-2 qoralama «${aktRaqam}» yaratildi — tasdiqlash F2 tarixida` : `✗ ${r.error ?? 'Amal bajarilmadi'}`]; } };
  },
};

/* ───────────── ZAMENA / QO'SHIMCHA ISHNI SAQLASH (taklif kartasi + tasdiq) ───────────── */

const zamenaSaqlaVosita: Vosita = {
  id: 'zamena_saqla', tur: 'yozish', pul: true, ruxsat: 'smeta.write',
  parametrlar: { asl: { tur: 'matn', majburiy: true, izoh: 'smeta qatori (zamena: almashtiriladigan ish; qo‘shimcha: bog‘liq qator)' }, yangi: { tur: 'matn', majburiy: true, izoh: 'yangi ish nomi' }, birlik: { tur: 'matn', majburiy: true, izoh: 'birlik' }, hajm: { tur: 'son', majburiy: true, izoh: 'hajm' }, sabab: { tur: 'matn', majburiy: true, izoh: 'sabab (≥5 belgi)' } },
  tavsif: 'Zamena / qo‘shimcha ISH saqlash («smeta normasi avval» qoidasi: mavjud qator/norma topilmasa). Asl smeta qatori o‘zgarmaydi; alohida qatlam. Sintaksis: «zamena saqla asl: … yangi: … birlik: … hajm: … sabab: …».',
  mos: (t, xom) => borMi(t, ['zamena', 'замена', 'qoshimcha', 'дополнительн']) && borMi(t, ['saqla', 'saqlab', 'yarat', 'сохрани', 'создай']) && /(?:^|[\s,;|])(?:asl|yangi)\s*[:=]/iu.test(xom),
  ishla: async (c, slot, xom) => {
    if (!c.api.qatorTop || !c.api.zamenaSaqla) return javob('Zamena/qo‘shimcha saqlash bu yerda hali ulanmagan — Fakt sahifasida saqlang.', true);
    const ob = obyektOl(c, 'zamena_saqla', slot, xom); if (javobmi(ob)) return ob;
    const rejim = (slot.rejim as 'zamena' | 'qoshimcha' | undefined) ?? (borMi(sozlar(xom), ['zamena', 'замена']) ? 'zamena' : 'qoshimcha');
    const v: Record<string, unknown> = { ...slot, obyektId: ob.id, rejim };
    const kut = slot.__kutilgan as string | undefined; const jv = slot.__javob?.trim();
    v.asl = slot.asl ?? etiket(xom, 'asl'); v.nom = slot.nom ?? etiket(xom, 'yangi', 'nom'); v.birlik = slot.birlik ?? etiket(xom, 'birlik');
    v.hajm = slot.hajm ?? (etiket(xom, 'hajm') != null ? Number(String(etiket(xom, 'hajm')).replace(',', '.').replace(/\s/g, '')) : null); v.sabab = slot.sabab ?? etiket(xom, 'sabab');
    if (kut && jv && kut !== 'qator' && kut !== 'obyekt' && (v[kut] == null || v[kut] === '')) v[kut] = kut === 'hajm' ? Number(jv.replace(',', '.').replace(/\s/g, '')) : jv;
    if (!v.asl) return savolQil('zamena_saqla', v, xom, 'asl', rejim === 'zamena' ? 'Smetaning qaysi qatori (ishi) almashtiriladi? Kod yoki nom bo‘lagini yozing.' : 'Qaysi qatordan keyin qo‘shimcha ish qo‘shiladi? Kod yoki nom bo‘lagini yozing.');
    let qator = slot.qator as QatorQisqa | undefined;
    if (!qator) {
      const top = await c.api.qatorTop(ob.id, String(v.asl));
      if (!top) return javob('Smeta qatorlarini o‘qib bo‘lmadi.', true);
      let n = top;
      if (kut === 'qator' && jv) { const x = tanlovTop(jv, top.map((q) => ({ nom: `${q.kod ?? ''} ${q.nom}`, q }))); if (x) n = [x.q]; }
      if (!n.length) return javob(`**${ob.nom}**: «${String(v.asl)}» bo‘yicha smeta qatori topilmadi. Boshqa so‘z bilan urinib ko‘ring.`);
      if (n.length > 1) return savolQil('zamena_saqla', { ...v, asl: v.asl }, xom, 'qator', 'Qaysi qator?', n.slice(0, 6).map((q) => ({ nom: `${q.kod ?? ''} ${q.nom}`.trim().slice(0, 90), matn: `${q.kod ?? ''} ${q.nom}`.trim() })));
      qator = n[0];
    }
    v.qator = qator;
    if (rejim === 'zamena' && qator.tur !== 'bl') return javob(`«${qator.nom}» — ish (BL) qatori emas. Resurs zamenasi Fakt sahifasida (Zamena tugmasi) bajariladi.`);
    if (!v.nom) return savolQil('zamena_saqla', v, xom, 'nom', 'Yangi ishning nomi?');
    if (!v.birlik) return savolQil('zamena_saqla', v, xom, 'birlik', 'Birligi? (m3, m2, dona …)');
    if (typeof v.hajm !== 'number' || !Number.isFinite(v.hajm) || v.hajm === 0) return savolQil('zamena_saqla', v, xom, 'hajm', 'Hajmi? (0 dan farqli son)');
    if (!v.sabab || String(v.sabab).length < 5) return savolQil('zamena_saqla', v, xom, 'sabab', 'Sababini yozing (kamida 5 belgi) — masalan, loyihada yo‘q ish chiqdi.');
    const nom = String(v.nom); const birlik = String(v.birlik); const hajm = v.hajm; const sabab = String(v.sabab); const op = c.opId();
    const yorlik = rejim === 'zamena' ? 'Zamena' : 'Qo‘shimcha ish';
    return { tur: 'taklif', nom: `${yorlik} · ${nom}`, pul: true,
      izoh: `${rejim === 'zamena' ? `«${qator.nom}» o‘rniga` : `«${qator.nom}» dan keyin`}: ${nom}, ${hajm} ${birlik}. Sabab: ${sabab}. Asl smeta qatori o‘zgarmaydi; narx — keyin Fakt/narxlash sahifasida.`,
      matn: `**${ob.nom}**: ${yorlik.toLowerCase()} saqlashni taklif qilaman. Hali saqlanmagan. («Smeta normasi avval» qoidasi: mavjud qator/norma topilmaganini tekshirdingizmi?)`,
      bajar: async () => { const r = await c.api.zamenaSaqla!({ obyektId: ob.id, rejim, qator: qator!, nom, birlik, hajm, sabab, operationId: op }); return [r.ok ? `✓ ${yorlik} saqlandi: ${nom}` : `✗ ${r.error ?? 'Amal bajarilmadi'}`]; } };
  },
};

export const PTO_VOSITALARI: readonly Vosita[] = [moslashVosita, f2YuborVosita, ishchiTopshirVosita, ishchiHolatVosita, slichitelniyTsiklVosita, zamenaSaqlaVosita, hujjatYasaVosita];
