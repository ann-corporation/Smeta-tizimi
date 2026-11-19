/**
 * telegram-reliz.ts — dastur relizlarini (Android APK / Windows MSI) @qur_uz_bot orqali berish va kanal/guruhda e'lon qilish.
 *
 *  • Manba: sayt manifestlari /mobile-release.json va /desktop-release.json (+ «Nima yangi»: /yangiliklar.json). Faqat ochiq ma'lumot.
 *  • Fayl: R2_CANONICAL (reliz-fayl.ts bilan bir xil kalit: relizKalit) → Telegram sendDocument. Bot API yuklash chegarasi 50 MB:
 *      ≤ 50 MB  → fayl o'zi (birinchi marta oqim bilan yuklanadi, keyin Telegram file_id R2 da keshlanadi: tg-reliz/fayl-id/…);
 *      > 50 MB yoki yuklash xato → xabar + «Yuklab olish» URL tugmasi (saytning ochiq reliz manzili).
 *    sha256 har doim izohda.
 *  • E'lon: TG_KANAL va TG_GURUH (wrangler [vars], bot ikkalasida ham admin). Bir versiya bir chatga BIR MARTA: yozuv R2 da
 *    tg-reliz/elon/<chat>-<platforma>-<versiya>-<sha12>.json; `majbur` bilan qayta e'lon (faqat superadmin). Yangi jadval yo'q.
 *    Yozuv yozilishi atomik emas — bir vaqtda ikki ishga tushirish kamdan-kam hollarda ikki marta yuborishi mumkin.
 *  • Token/chat id loglanmaydi (tgApi/tgApiHam token'ni niqoblaydi).
 */
import { type TgEnv, type TgTil, saytUrl, tgApi, tgApiHam, tgT } from './telegram';
import { type RelizPlatforma, relizKalit } from './reliz-fayl';
import { r2Oqi, r2Yoz } from './r2-saqlash';

export type RelizEnv = TgEnv & { TG_KANAL?: string; TG_GURUH?: string; R2_CANONICAL?: R2Bucket };
export type Reliz = { platforma: 'android' | 'windows'; versiya: string; fayl: string; bayt: number; sha256: string; sana: string; yangi?: string[] };
export type Natija = { chat: 'kanal' | 'guruh'; platforma: Reliz['platforma']; versiya: string; holat: 'yuborildi' | 'otkazildi' | 'xato'; kod?: string };

export const TG_FAYL_MAX = 50 * 1024 * 1024;
const PLATFORMA_NOMI: Record<Reliz['platforma'], string> = { android: 'Android', windows: 'Windows' };
const VERSIYA = /^\d+\.\d+\.\d+$/;
const SHA = /^[a-f0-9]{64}$/;

const yozuvYoqilgan = (x: unknown) => typeof x === 'string' && x.trim().length > 0;

/* ───────── manifestlar ───────── */
async function jsonOl(env: RelizEnv, yol: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(saytUrl(env) + yol, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j === 'object' && !Array.isArray(j) ? j as Record<string, unknown> : null;
  } catch { return null; }
}

function relizQur(platforma: Reliz['platforma'], m: Record<string, unknown> | null | undefined): Reliz | null {
  if (!m) return null;
  const versiya = String(m.version ?? ''); const sha256 = String(m.sha256 ?? '').toLowerCase(); const fayl = String(m.file ?? '');
  const bayt = Number(m.bytes);
  if (!VERSIYA.test(versiya) || !SHA.test(sha256) || !fayl || !Number.isSafeInteger(bayt) || bayt <= 0) return null;
  if (!relizKalit(platforma as RelizPlatforma, `/${platforma}/${versiya}/${sha256}/${encodeURIComponent(fayl)}`)) return null;
  const yangi = Array.isArray(m.notes) ? m.notes.map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, 5) : undefined;
  return { platforma, versiya, fayl, bayt, sha256, sana: String(m.generatedAtUtc ?? '').slice(0, 10), yangi };
}

/** «Nima yangi»: manifestda `notes` bo'lmasa — reliz sanasigacha bo'lgan eng yangi 3 ta yangilik sarlavhasi. */
async function izohlar(env: RelizEnv, sana: string): Promise<string[]> {
  const y = await jsonOl(env, '/yangiliklar.json');
  const yoz = Array.isArray(y?.yozuvlar) ? y!.yozuvlar as { sana?: string; sarlavha?: string }[] : [];
  return yoz.filter((e) => typeof e?.sarlavha === 'string' && (!sana || !e.sana || e.sana <= sana)).slice(0, 3).map((e) => String(e.sarlavha).slice(0, 120));
}

/** Joriy (manifestdagi) relizlar: Android + Windows. */
export async function relizlarniOl(env: RelizEnv): Promise<Reliz[]> {
  const [mob, desk] = await Promise.all([jsonOl(env, '/mobile-release.json'), jsonOl(env, '/desktop-release.json')]);
  const r = [relizQur('android', mob?.android as Record<string, unknown> | undefined), relizQur('windows', desk)].filter((x): x is Reliz => !!x);
  for (const x of r) if (!x.yangi?.length) x.yangi = await izohlar(env, x.sana);
  return r;
}

/** Eski versiya (qayta e'lon): manifestda yo'q bo'lsa R2 dan topiladi (`reliz/android/<v>/<sha>/…`, `windows/<v>/<sha>/…`). */
export async function relizTop(env: RelizEnv, platforma: Reliz['platforma'], versiya: string, joriy?: Reliz[]): Promise<Reliz | null> {
  if (!VERSIYA.test(versiya)) return null;
  const j = (joriy ?? await relizlarniOl(env)).find((x) => x.platforma === platforma && x.versiya === versiya);
  if (j) return j;
  if (!env.R2_CANONICAL) return null;
  try {
    const prefiks = platforma === 'windows' ? `windows/${versiya}/` : `reliz/android/${versiya}/`;
    const l = await env.R2_CANONICAL.list({ prefix: prefiks, limit: 50 });
    for (const o of l.objects) {
      const q = o.key.slice(prefiks.length).split('/');
      if (q.length !== 2 || !SHA.test(q[0]) || !/\.(apk|msi|exe)$/i.test(q[1])) continue;
      if (!relizKalit(platforma as RelizPlatforma, `/${platforma}/${versiya}/${q[0]}/${encodeURIComponent(q[1])}`)) continue;
      return { platforma, versiya, fayl: q[1], bayt: o.size, sha256: q[0], sana: '', yangi: [] };
    }
  } catch { /* R2 list xatosi — topilmadi */ }
  return null;
}

/* ───────── matn / tugma ───────── */
export const relizUrl = (env: RelizEnv, r: Reliz) => `${saytUrl(env)}/${r.platforma}/${r.versiya}/${r.sha256}/${encodeURIComponent(r.fayl)}`;
const mb = (bayt: number) => (bayt / 1048576).toFixed(1);

export function relizMatni(r: Reliz, til: TgTil, yangiReliz: boolean, katta = false): string {
  const p = { platforma: PLATFORMA_NOMI[r.platforma], versiya: r.versiya };
  const q = [tgT(yangiReliz ? 'Yangi reliz: QURAI {platforma} {versiya}' : 'QURAI {platforma} {versiya}', til, p), tgT('Hajmi: {mb} MB', til, { mb: mb(r.bayt) }), `SHA-256: ${r.sha256}`];
  if (r.yangi?.length) q.push('', tgT('Nima yangi:', til), ...r.yangi.map((x) => '• ' + x));
  if (katta) q.push('', tgT('Fayl Telegram chegarasidan (50 MB) katta — tugma orqali yuklab oling.', til));
  return q.join('\n').slice(0, 1000);
}
const urlTugma = (env: RelizEnv, r: Reliz, til: TgTil) => ({ inline_keyboard: [[{ text: tgT('⬇️ Yuklab olish', til), url: relizUrl(env, r) }]] });

/* ───────── R2 yozuvlari ───────── */
const fileIdKalit = (r: Reliz) => `tg-reliz/fayl-id/${r.platforma}-${r.versiya}-${r.sha256.slice(0, 12)}.json`;
const elonKalit = (chat: string, r: Reliz) => `tg-reliz/elon/${chat}-${r.platforma}-${r.versiya}-${r.sha256.slice(0, 12)}.json`;
async function r2Json<T>(env: RelizEnv, kalit: string): Promise<T | null> {
  if (!env.R2_CANONICAL) return null;
  try { const o = await r2Oqi(env.R2_CANONICAL, kalit); return o ? await o.json() as T : null; } catch { return null; }
}
async function r2Saqla(env: RelizEnv, kalit: string, v: unknown): Promise<boolean> {
  if (!env.R2_CANONICAL) return false;
  try { await r2Yoz(env.R2_CANONICAL, kalit, JSON.stringify(v)); return true; } catch { return false; }
}

/* ───────── fayl yuklash (oqim; xotira ~50 MB ni ushlamaydi) ───────── */
async function hujjatYukla(env: RelizEnv, chatId: string | number, r: Reliz, izoh: string, tugma: unknown): Promise<string | null> {
  const k = relizKalit(r.platforma as RelizPlatforma, `/${r.platforma}/${r.versiya}/${r.sha256}/${encodeURIComponent(r.fayl)}`);
  if (!k || !env.R2_CANONICAL) return null;
  const obj = await env.R2_CANONICAL.get(k.key);
  if (!obj?.body || obj.size > TG_FAYL_MAX) return null;
  const sn = '----qurai' + crypto.randomUUID().replace(/-/g, '');
  const te = new TextEncoder();
  const maydon = (n: string, v: string) => `--${sn}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
  const bosh = te.encode(maydon('chat_id', String(chatId)) + maydon('caption', izoh) + maydon('reply_markup', JSON.stringify(tugma))
    + `--${sn}\r\nContent-Disposition: form-data; name="document"; filename="${k.file}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const dum = te.encode(`\r\n--${sn}--\r\n`);
  const jami = bosh.length + obj.size + dum.length;
  const sarlavha = { 'Content-Type': `multipart/form-data; boundary=${sn}` };
  const FLS = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream<Uint8Array, Uint8Array> }).FixedLengthStream;
  let javob: Awaited<ReturnType<typeof tgApiHam<{ document?: { file_id?: string } }>>>;
  if (FLS) {
    const { readable, writable } = new FLS(jami);
    const w = writable.getWriter();
    const pump = (async () => {
      try {
        await w.write(bosh);
        const rd = (obj.body as ReadableStream<Uint8Array>).getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; await w.write(value); }
        await w.write(dum); await w.close();
      } catch { await w.abort().catch(() => undefined); }
    })();
    [javob] = await Promise.all([tgApiHam<{ document?: { file_id?: string } }>(env, 'sendDocument', readable, sarlavha), pump]);
  } else {
    // Oqim konstruktori yo'q muhit (sinov/lokal): bufer.
    const bufer = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
    javob = await tgApiHam<{ document?: { file_id?: string } }>(env, 'sendDocument', new Blob([bosh, bufer, dum] as never), sarlavha);
  }
  const id = javob.ok ? javob.result?.document?.file_id : undefined;
  if (!id) return null;
  await r2Saqla(env, fileIdKalit(r), { file_id: id, bayt: r.bayt, vaqt: new Date().toISOString() });
  return id;
}

/** Bitta chatga: fayl (≤ 50 MB: keshlangan file_id yoki yuklash) yoki tugmali xabar. true = yuborildi. */
export async function relizYubor(env: RelizEnv, chatId: string | number, r: Reliz, til: TgTil, yangiReliz = false): Promise<boolean> {
  const tugma = urlTugma(env, r, til);
  if (r.bayt <= TG_FAYL_MAX) {
    const izoh = relizMatni(r, til, yangiReliz);
    const kesh = await r2Json<{ file_id?: string }>(env, fileIdKalit(r));
    if (kesh?.file_id) {
      const j = await tgApi(env, 'sendDocument', { chat_id: chatId, document: kesh.file_id, caption: izoh, reply_markup: tugma });
      if (j.ok) return true;   // file_id eskirgan bo'lsa — qayta yuklashga tushadi
    }
    if (await hujjatYukla(env, chatId, r, izoh, tugma)) return true;
  }
  const j = await tgApi(env, 'sendMessage', { chat_id: chatId, text: relizMatni(r, til, yangiReliz, r.bayt > TG_FAYL_MAX), reply_markup: tugma, disable_web_page_preview: true });
  return j.ok;
}

/* ───────── e'lon ───────── */
export function elonChatlari(env: RelizEnv): { alias: 'kanal' | 'guruh'; id: string }[] {
  const c: { alias: 'kanal' | 'guruh'; id: string }[] = [];
  if (yozuvYoqilgan(env.TG_KANAL)) c.push({ alias: 'kanal', id: String(env.TG_KANAL).trim() });
  if (yozuvYoqilgan(env.TG_GURUH)) c.push({ alias: 'guruh', id: String(env.TG_GURUH).trim() });
  return c;
}

/**
 * Relizlarni kanal va guruhga e'lon qiladi. Bir versiya bir chatga bir marta (R2 yozuvi); `majbur` — qayta e'lon.
 * `filtr` berilmasa — manifestdagi joriy relizlar. Hech narsa tashqarida (token, chat id) qaytarilmaydi.
 */
export async function relizElon(env: RelizEnv, p: { relizlar: Reliz[]; majbur?: boolean; kim?: number | null }): Promise<Natija[]> {
  const natija: Natija[] = [];
  const chatlar = elonChatlari(env);
  for (const r of p.relizlar) {
    for (const c of chatlar) {
      const n = { chat: c.alias, platforma: r.platforma, versiya: r.versiya };
      const kalit = elonKalit(c.alias, r);
      if (!p.majbur && await r2Json(env, kalit)) { natija.push({ ...n, holat: 'otkazildi' }); continue; }
      const ok = await relizYubor(env, c.id, r, 'uz', true);
      if (!ok) { natija.push({ ...n, holat: 'xato', kod: 'YUBORILMADI' }); continue; }
      const yozildi = await r2Saqla(env, kalit, { vaqt: new Date().toISOString(), majbur: !!p.majbur, kim: p.kim ?? null, sha256: r.sha256 });
      natija.push({ ...n, holat: 'yuborildi', ...(yozildi ? {} : { kod: 'YOZUV_YOZILMADI' }) });
    }
  }
  return natija;
}
