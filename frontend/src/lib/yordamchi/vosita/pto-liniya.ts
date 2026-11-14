/**
 * PTO LINIYASI vositalari (2026-11-14): obyekt holati (SERVER summa paketi), F-2 ni tasdiqlashga yuborish, hujjat yasash yo'li (F-3, nakopitelniy,
 * slichitelniy), AI ishchilar (ko'rish + topshirish), Moslash qutisi (kunlik avtomat tekshiruvlar, FAQAT o'qish).
 * Pul qoidasi: birlik narxi QQS siz; jami avval QQS bilan, keyin ustamali, keyin ustamasiz. NULL ≠ 0 (noma'lum — «—»). Hisob YO'Q: faqat server paketini ko'rsatish.
 * Yozuvchi vositalar taklif kartasi qaytaradi (tasdiq — foydalanuvchida); operation_id taklif tuzilganda bir marta yaratiladi.
 */
import { sozlar } from '../matn';
import { sahifaUrl } from '../sahifa-qidiruv';
import { borMi, nomMosmi, pulMatn, tanlovTop } from './yordam';
import type { IshchiQisqa, ObyektHolatMalumot, PaketUchlik, Variant, Vosita, VositaJavob } from './tur';
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
];
/* Slichitelniy bu yerda YO'Q: uning sikli (к доплате / к снятию) alohida ish chizig'ida (slichitelniy-asos); hozircha «yoq» vositasi sahifaga yo'naltiradi. */
const hujjatYasaVosita: Vosita = {
  id: 'hujjat_yasa', tur: 'oqish', pul: false, ruxsat: null, parametrlar: { hujjat: { tur: 'tanlov', majburiy: true, izoh: 'F-3 | nakopitelniy | slichitelniy' } },
  tavsif: 'F-3 / nakopitelniy / slichitelniy hujjatini yasash: aniq sahifani obyekt va oy bilan ochadi; yuklab olishda token yechiladi (mavjud mexanizm, qayta yuklash — bepul).',
  mos: (t) => HUJJATLAR.some((h) => borMi(t, h.kalit)) && borMi(t, ['eksport', 'export', 'excel', 'yuklab', 'yuklash', 'yasa', 'chiqar', 'скачай', 'выгруз', 'создай', 'pdf']) && !borMi(t, ['f2', 'ф2', 'qoralama']),
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
    return `**${MOSLASH_NOMI[tur] ?? tur}** — ${l.length}\n${l.slice(0, 4).map((b) => `- ${b.obyekt_nom ?? 'Obyekt'}${b.akt_raqam ? ` · akt № ${b.akt_raqam}` : ''}${b.farq != null ? ` · farq ${pulMatn(b.farq)}` : b.summa != null ? ` · ${pulMatn(b.summa)}` : ''}${b.tur === 'narxsiz' ? ` · ${b.izoh}` : ''}`).join('\n')}`;
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
    const m = moslashMatni(r.bandlar, r.jami);
    return { tur: 'javob', matn: m.matn, havolalar: m.havolalar };
  },
};

export const PTO_VOSITALARI: readonly Vosita[] = [moslashVosita, f2YuborVosita, ishchiTopshirVosita, ishchiHolatVosita, hujjatYasaVosita];
