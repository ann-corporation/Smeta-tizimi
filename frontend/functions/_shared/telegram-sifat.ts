/**
 * telegram-sifat.ts — bot suhbat sifati: kutilayotgan niyatni yakunlash, kontekst bo'yicha yo'naltirish (fakt / ombor / Jarvis),
 * /til, /taklif, /fakt dialoglari. Yangi yozish yo'li YO'Q: hamma amal mavjud yo'llardan (faktTaklif, omborBuyruq, jarvis, taklifJavobi).
 * Oqim xaritasi: docs/ops/YAGONA_OQIMLAR.md.
 */
import { type TgEnv, type TgTil, tgT } from './telegram';
import { type BotJavob, fotoAmali, jarvisJavobi, obyektlarOl } from './telegram-bot';
import { faktArgument, faktTaklif, obyektOl } from './telegram-bot-oqim';
import { omborBuyruq } from './telegram-ombor';
import { TAKLIF_ROLLAR, taklifJavobi } from './telegram-username';
import { qiymatTuri } from './username';
import { telegramJarvisMatn, type JarvisBotReply } from './telegram-jarvis';
import { joriyObyektId } from './telegram-toliq-yadro';
import { type Kutilgan, holatOch, holatOl, holatYoz, niyatAniqla, sinovNomi } from './telegram-holat';

type BotEnv = TgEnv & Record<string, unknown>;
export type Aloqa = { yubor: (j: BotJavob) => Promise<unknown>; jarvisYubor: (r: JarvisBotReply) => Promise<unknown>; matn: (s: string) => Promise<unknown> };
const raqamOl = (s: string) => /^#?(\d{1,12})$/.exec(s.trim())?.[1];

/** Oxirgi ishlatilgan obyekt (fakt/rasm muvaffaqiyatidan keyin) — 7 kun. */
export const oxirgiObyektYoz = (chatId: number, oid: number) => holatYoz(chatId, 'oxirgi', { oid }, 7 * 86400);

/** «Qaysi obyekt?» ro'yxati: sinov obyektlarsiz, raqam bilan (foydalanuvchi shu raqamni yozadi). */
export async function obyektRaqamSorovi(env: BotEnv, uid: number, til: TgTil, fakt = false): Promise<BotJavob> {
  const q = await obyektlarOl(env, uid, 8);
  return { matn: [fakt ? tgT('Qaysi obyektga fakt yoziladi? Raqamini yozing (masalan: 240):', til) : tgT('Qaysi obyekt? Raqamini yozing (masalan: 240):', til), ...(q ?? []).map((o) => `• #${o.id} ${o.nom}`)].join('\n') };
}

/** Foydalanuvchida haqiqiy (sinov bo'lmagan) obyekt bormi — bo'lsa sinov obyekt standart/joriy bo'lmaydi. */
export async function haqiqiyBormi(env: BotEnv, uid: number): Promise<boolean> {
  const q = await obyektlarOl(env, uid, 1);
  return !!q?.length && !sinovNomi(q[0].nom);
}

/** Standart obyekt: chat menyusidagi joriy obyekt → oxirgi ishlatilgan → yagona ochiq obyekt. Sinov obyekt hech qachon standart bo'lmaydi. */
export async function standartObyekt(env: BotEnv, uid: number, chatId: number): Promise<{ id: number; nom: string } | null> {
  const nomzod: (number | null)[] = [await joriyObyektId(env, chatId), (await holatOl<{ oid?: number }>(chatId, 'oxirgi'))?.oid ?? null];
  for (const id of nomzod) {
    const ob = id ? await obyektOl(env, uid, id) : null;
    if (ob && !(sinovNomi(ob.nom) && await haqiqiyBormi(env, uid))) return { id: ob.id, nom: ob.nom };
  }
  const q = await obyektlarOl(env, uid, 3);
  return q?.length === 1 ? { id: q[0].id, nom: q[0].nom } : null;
}

/** /fakt (argumentsiz yoki obyektsiz matn) — kutish holati + so'rov. */
export async function faktKirish(env: BotEnv, uid: number, til: TgTil, chatId: number, matn: string): Promise<BotJavob> {
  const ob = await standartObyekt(env, uid, chatId);
  if (matn && ob) { await oxirgiObyektYoz(chatId, ob.id); return faktTaklif(env, uid, til, `${ob.id} ${matn}`); }
  if (matn) { await holatYoz(chatId, 'kutish', { tur: 'fakt_obyekt', matn } satisfies Kutilgan); return obyektRaqamSorovi(env, uid, til); }
  if (ob) {
    await holatYoz(chatId, 'kutish', { tur: 'fakt', oid: ob.id } satisfies Kutilgan);
    return { matn: tgT('Fakt: nima bajarilganini va hajmini yozing. Obyekt: {obyekt}. Masalan: 12,5 m3 beton quyildi.', til, { obyekt: `#${ob.id} ${ob.nom}` }) };
  }
  await holatYoz(chatId, 'kutish', { tur: 'fakt' } satisfies Kutilgan);
  return obyektRaqamSorovi(env, uid, til, true);
}

/** /taklif va uning davomi: odam va rol alohida xabarlarda yozilishi mumkin. Qaytadi: foydalanuvchiga javob matni. */
export async function taklifBosh(env: BotEnv, uid: number, til: TgTil, chatId: number, arg: string, oldingi?: string): Promise<string> {
  const toliq = [oldingi, arg].filter(Boolean).join(' ').trim();
  const qism = toliq.split(/\s+/).filter(Boolean);
  if (qism.slice(1).some((x) => TAKLIF_ROLLAR.includes(x.toLowerCase()))) { await holatOch(chatId, 'kutish'); return taklifJavobi(env, uid, til, toliq); }
  const aniq = qism.length > 0 && qiymatTuri(qism.join(' ')) !== 'noaniq';   // @username / telefon / email
  await holatYoz(chatId, 'kutish', { tur: 'taklif', ...(aniq ? { qiymat: qism.join(' ') } : {}) } satisfies Kutilgan);
  if (qism.length && !aniq) return taklifJavobi(env, uid, til, toliq);   // noto'g'ri shakl — foydalanish ko'rsatmasi (keyingi xabar baribir kutiladi)
  return qism.length ? tgT('Qaysi rolda? Yozing: {rollar}', til, { rollar: TAKLIF_ROLLAR.join(', ') }) : tgT('Kimni taklif qilamiz? @username, telefon yoki email yozing.', til);
}

/** Bot savol bergan edi (rasm obyekti, fakt, taklif): keyingi oddiy xabar shu amalni yakunlaydi. Mos kelmasa — holat tozalanadi, null (oddiy yo'naltirish). */
export async function kutilganIshla(env: BotEnv, uid: number, til: TgTil, chatId: number, matn: string, a: Aloqa): Promise<string | null> {
  const k = await holatOl<Kutilgan>(chatId, 'kutish');
  if (!k) return null;
  const m = matn.trim();
  const raqam = raqamOl(m);
  if (k.tur === 'foto') {
    if (!raqam) { await holatOch(chatId, 'kutish'); return null; }
    await holatOch(chatId, 'kutish');
    const j = await fotoAmali(env, uid, til, [{ file_id: k.fileId, width: k.w, height: k.h }], `#${raqam} ${k.izoh}`.trim());
    await a.yubor(j);
    if (j.obyektId) await oxirgiObyektYoz(chatId, j.obyektId);
    return 'foto_kutilgan';
  }
  if (k.tur === 'taklif') { await a.matn(await taklifBosh(env, uid, til, chatId, m, k.qiymat)); return 'taklif_kutilgan'; }
  if (k.tur === 'fakt_obyekt') {
    if (!raqam) { await holatOch(chatId, 'kutish'); return null; }
    await holatOch(chatId, 'kutish');
    await oxirgiObyektYoz(chatId, Number(raqam));
    await a.yubor(await faktTaklif(env, uid, til, `${raqam} ${k.matn}`));
    return 'fakt_kutilgan';
  }
  // k.tur === 'fakt'
  if (!k.oid && raqam) {
    await holatYoz(chatId, 'kutish', { tur: 'fakt', oid: Number(raqam) } satisfies Kutilgan);
    await a.matn(tgT('Endi nima bajarilganini va hajmini yozing. Masalan: 12,5 m3 beton quyildi.', til));
    return 'fakt_obyekt_tanlandi';
  }
  await holatOch(chatId, 'kutish');
  if (/^#\d{1,12}\s/.test(m) && faktArgument(m)) { await a.yubor(await faktTaklif(env, uid, til, m)); return 'fakt_kutilgan'; }
  if (k.oid) { await oxirgiObyektYoz(chatId, k.oid); await a.yubor(await faktTaklif(env, uid, til, `${k.oid} ${m}`)); return 'fakt_kutilgan'; }
  await holatYoz(chatId, 'kutish', { tur: 'fakt_obyekt', matn: m } satisfies Kutilgan);
  await a.yubor(await obyektRaqamSorovi(env, uid, til));
  return 'fakt_obyekt_sorov';
}

/**
 * Kutilgan holat yo'q, buyruq emas: matn mazmuni bo'yicha. Ombor — FAQAT ombor niyatida (keldi/berdim/qoldiq…) va omborchi uchun;
 * fakt — bajarilgan ish + hajm; qolgani — Jarvis (faol suhbat bo'lsa shunda, bo'lmasa yagona savol). Yordam ro'yxati bu yerda YO'Q.
 */
export async function oddiyMatnIshla(env: BotEnv, uid: number, til: TgTil, chatId: number, shaxsiy: boolean, matn: string, a: Aloqa): Promise<string> {
  const niyat = niyatAniqla(matn);
  if (niyat === 'ombor') {
    const j = await omborBuyruq(env, uid, til, { matn });
    if (j) { await a.yubor(j); return 'ombor_matn'; }
  } else if (niyat === 'fakt') {
    await a.yubor(await faktKirish(env, uid, til, chatId, matn.slice(0, 500)));
    return 'fakt_matn';
  }
  if (shaxsiy) {
    const r = await telegramJarvisMatn(env, uid, chatId, til, matn);
    if (r) { await a.jarvisYubor(r); return 'jarvis_matn'; }
  }
  await a.yubor(await jarvisJavobi(env, uid, til, matn));
  return 'jarvis_matn';
}
