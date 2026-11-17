// «Приход» (Google Sheets «Navoiy park») → markaziy ombor: idempotent sinxron (faqat YANGI qatorlar qo'shiladi).
// MA'LUMOT GITda YO'Q: kirish C:\Temp\ombor-data\prixod.json (haqiqiy qatorlar), hisobot ham shu papkaga yoziladi.
//
// Ishlatish (sukut — DRY-RUN, hech narsa yozilmaydi):
//   node scripts/ombor-prixod-sinxron.mjs --kompaniya 123 --sklad 18 --actor <t2_foydalanuvchi.id>
// Yozish (faqat dry-run hisobotini ko'rib, SNAPSHOT olgandan keyin):
//   node scripts/ombor-prixod-sinxron.mjs --kompaniya 123 --sklad 18 --actor <id> --apply --snapshot-olindi
// Alias (egasi tasdiqlagan variantlar; variantlar-tasdiq.json: [{ "kanonik": "...", "variantlar": ["...", "..."] }]):
//   node scripts/ombor-prixod-sinxron.mjs --kompaniya 123 --sklad 18 --actor <id> --alias C:\Temp\ombor-data\variantlar-tasdiq.json --apply --snapshot-olindi
//
// Muhit: SUPABASE_URL, SUPABASE_KEY (service role) — hech qachon chop etilmaydi. Migratsiya 20270101000000_t2_ombor_tayyor_v1 prodda bo'lishi shart.
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const KOMP = Number(arg('kompaniya')), SKLAD = Number(arg('sklad')), ACTOR = Number(arg('actor'));
const APPLY = arg('apply', false) === true, SNAPSHOT = arg('snapshot-olindi', false) === true;
const KIRISH = arg('kirish', 'C:/Temp/ombor-data/prixod.json'), HISOBOT = arg('hisobot', 'C:/Temp/ombor-data/sinxron-hisobot.json');
const ALIAS = typeof arg('alias', false) === 'string' ? arg('alias') : null;
const BATCH = 500;
if (![KOMP, SKLAD, ACTOR].every((x) => Number.isSafeInteger(x) && x > 0)) { console.error('Kerak: --kompaniya --sklad --actor'); process.exit(2); }
if (APPLY && !SNAPSHOT) { console.error('Yozishdan oldin snapshot oling (mcp snapshot_ol) va --snapshot-olindi bering.'); process.exit(2); }
const URL_ = String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), KEY = process.env.SUPABASE_KEY || '';
if (!URL_ || !KEY) { console.error('SUPABASE_URL / SUPABASE_KEY muhit o\'zgaruvchilari kerak.'); process.exit(2); }

async function rpc(nom, body) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${nom}`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${nom}: HTTP ${r.status} ${(j && (j.code || j.message)) || ''}`.slice(0, 200));
  return j;
}
const q4 = (x) => String(Number(Number(x).toFixed(4)));
const kalit = (r) => `${r.sana}|${String(r.nomi).trim()}|${String(r.birligi).trim()}|${q4(r.miqdor)}`;

if (ALIAS) {
  const guruhlar = JSON.parse(fs.readFileSync(ALIAS, 'utf8'));
  console.log(`Alias guruhlari: ${guruhlar.length} (${APPLY ? 'YOZILADI' : 'dry-run'})`);
  if (APPLY) for (const g of guruhlar) {
    const op = randomUUID();
    const r = await rpc('t2_ombor_alias_tasdiq_v1', { p_actor_id: ACTOR, p_kompaniya_id: KOMP, p_sklad_id: SKLAD, p_kanonik_nom: g.kanonik, p_variantlar: g.variantlar, p_operation_id: op });
    if (!r?.ok) { console.error('Alias xato:', r?.code); process.exit(1); }
  }
  process.exit(0);
}

const qatorlar = JSON.parse(fs.readFileSync(KIRISH, 'utf8'));
// 1) har qatorga mazmun kaliti ichida tartib raqami (ord): bir xil qatorlar (masalan bir kunda ikki marta 9 m3 qum) alohida yozuv
const sanagich = new Map(); const yuk = [];
for (const r of qatorlar) { const k = kalit(r); const ord = (sanagich.get(k) ?? 0) + 1; sanagich.set(k, ord);
  yuk.push({ row: r.row, ord, sana: r.sana, nomi: String(r.nomi).trim(), birligi: String(r.birligi).trim(), obyomi: q4(r.miqdor), postavshik: r.postavshik ?? null, tur: r.tur ?? null, sf: r.sf ?? null }); }

// 2) bazadagi mavjud sheet-yozuvlar (kalit -> soni) bilan solishtirish (mijoz tomonida, dry-run uchun)
const kal = await rpc('t2_ombor_prixod_kalitlar_v1', { p_actor_id: ACTOR, p_kompaniya_id: KOMP, p_sklad_id: SKLAD });
if (!kal?.ok) { console.error('Kalitlarni o\'qib bo\'lmadi:', kal?.code); process.exit(1); }
const dbSoni = new Map(kal.kalitlar.map((x) => [x.k, x.n]));
const yangiQatorlar = yuk.filter((r) => (dbSoni.get(kalit({ ...r, miqdor: r.obyomi })) ?? 0) < r.ord);
const dbOrtiqcha = [];
for (const [k, n] of dbSoni) { const bor = sanagich.get(k) ?? 0; if (n > bor) dbOrtiqcha.push({ kalit: k, bazada: n, sheetda: bor }); }
const yangiJami = yangiQatorlar.reduce((a, r) => a + Number(r.obyomi), 0);
const hisobot = { sana: new Date().toISOString(), kirish_qator: qatorlar.length, bazada_mavjud_kalit: dbSoni.size,
  yangi_qator: yangiQatorlar.length, mavjud_qator: yuk.length - yangiQatorlar.length, bazada_ortiqcha_kalit: dbOrtiqcha.length,
  bazada_ortiqcha_qator: dbOrtiqcha.reduce((a, x) => a + (x.bazada - x.sheetda), 0), yangi_nomlar: new Set(yangiQatorlar.map((r) => r.nomi)).size,
  yangi_miqdor_yigindisi_birliksiz: Math.round(yangiJami * 1000) / 1000, namuna_yangi: yangiQatorlar.slice(0, 15), namuna_ortiqcha: dbOrtiqcha.slice(0, 30),
  eslatma: 'Bazada ortiqcha = sheet keyin tahrirlangan/o\'chirilgan qatorlar; AVTOMATIK o\'chirilmaydi — egasi ko\'rib chiqadi (tuzatish: t2_ombor_tuzat_v1).' };
fs.writeFileSync(HISOBOT, JSON.stringify(hisobot, null, 2));
console.log(JSON.stringify({ ...hisobot, namuna_yangi: undefined, namuna_ortiqcha: undefined, hisobot: HISOBOT }));
if (!APPLY) { console.log('DRY-RUN: hech narsa yozilmadi. Yozish uchun: --apply --snapshot-olindi'); process.exit(0); }

// 3) yozish: server har qatorni qayta tekshiradi (ord > mavjud soni) — qayta ishga tushirish xavfsiz
let yozildi = 0;
for (let i = 0; i < yangiQatorlar.length; i += BATCH) {
  const bolak = yangiQatorlar.slice(i, i + BATCH);
  const op = createHash('sha256').update(JSON.stringify(bolak)).digest('hex'); // deterministik: bir xil bo'lak — bir xil operation_id
  const uuid = `${op.slice(0, 8)}-${op.slice(8, 12)}-4${op.slice(13, 16)}-8${op.slice(17, 20)}-${op.slice(20, 32)}`;
  const r = await rpc('t2_ombor_prixod_sinxron_v1', { p_actor_id: ACTOR, p_kompaniya_id: KOMP, p_sklad_id: SKLAD, p_qatorlar: bolak, p_operation_id: uuid, p_dry_run: false });
  if (!r?.ok) { console.error('Bo\'lak xato:', r?.code, 'oraliq', i); process.exit(1); }
  yozildi += r.yangi;
}
// 4) tekshiruv: qayta o'qib, hech bir kalit sheetdan kam emasligini ko'rsatadi
const k2 = await rpc('t2_ombor_prixod_kalitlar_v1', { p_actor_id: ACTOR, p_kompaniya_id: KOMP, p_sklad_id: SKLAD });
const db2 = new Map(k2.kalitlar.map((x) => [x.k, x.n]));
let kam = 0; for (const [k, n] of sanagich) if ((db2.get(k) ?? 0) < n) kam++;
console.log(JSON.stringify({ yozildi, tekshiruv_kam_kalit: kam }));
process.exit(kam ? 1 : 0);
