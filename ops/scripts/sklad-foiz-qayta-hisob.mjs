#!/usr/bin/env node
// 2-LOT obyektlari: obyekt podvalidagi SKLAD foizini svodka sklad summasiga MOSLASH (DATA skripti; migratsiya emas).
//
// MUAMMO. Importer podvalga svodkaning EFFEKTIV sklad foizini (svodka sklad summasi / to'liq mat) yozgan va qator bazasini
//   «МАТ + М/К + БЕЗ СКЛАД + КАБ» qilgan. Frontend yadro (hisob-yadro podvalBahola) shu bazani o'qiydi; SQL yadro (_t2_summa_paket_v1,
//   kesh, MCP `f2`/`obyekt_holat`) esa podvaldan FAQAT foizni oladi va standart baza (mat − bez − М/К) ga qo'yadi
//   (t2_nakrutka_podval_smeta_nk_v1). Natija: SQL sklad ~ yarmi, frontend esa foiz 2 xonaga yaxlitlangani uchun biroz kam.
// YECHIM. Ikkala yadro ham o'zgarmaydi. Podvalning `skl_mat` qatori STANDART bazaga («МАТ + КАБ» = SQL mat − bez − М/К) keltiriladi va
//   foiz = svodka sklad summasi / shu baza (yuqori aniqlikda). Shunda SQL va frontend bir xil va svodkaga teng sklad beradi.
//   (Muqobil — SQL yadroga «effektiv» belgisi — barcha obyektlar/o'lchovlar hisobiga tegadi, xavfliroq: rad etilgan.)
//
// Ishlatish (sirlar chop etilmaydi; muhit: SMETA_DB_URL; pg: PG_MODULE_DIR=<pg turgan papka> yoki ops/scripts da `npm i --no-save pg`):
//   node ops/scripts/sklad-foiz-qayta-hisob.mjs --maqsad <fayl.json>              # REHEARSAL: BEGIN ... ROLLBACK, hech narsa saqlanmaydi
//   node ops/scripts/sklad-foiz-qayta-hisob.mjs --maqsad <fayl.json> --apply      # COMMIT (faqat egasi ruxsatidan keyin)
//   --out <fayl.json>   natija jadvali (real summalar — repo ICHIGA YOZILMAYDI)
// <fayl.json>: { "<obyekt_id>": <svodka sklad summasi, so'm, QQS siz, ustamasiz>, ... } — repoda YO'Q (real summa), D:\BOG_MIYASI da.
//
// Xavfsizlik: (1) tasdiqlangan F2 bor-u o'z podvali yo'q obyekt — O'TKAZIB YUBORILADI (imzolangan hujjat summasi o'zgarmasin);
//   (2) skl_mat bazasi kutilgan shaklda bo'lmasa — o'tkazib yuboriladi; (3) har obyekt uchun tizim sklad == maqsad (±1 so'm) tekshiriladi,
//   bo'lmasa butun partiya ROLLBACK; (4) eski holat t2_nakrutka_podval_tarix ga yoziladi (versiya + 1) — qaytarish: --qaytar.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const APPLY = argv.includes('--apply');
const QAYTAR = argv.includes('--qaytar');
const maqsadFayl = arg('--maqsad');
const chiqFayl = arg('--out');
if (!maqsadFayl && !QAYTAR) { console.error('--maqsad <fayl.json> kerak (obyekt_id → svodka sklad summasi).'); process.exit(2); }

const KIM = 'sklad-foiz-qayta-hisob';
const KOD = 'skl_mat';
const KOEF = 'СКЛАДСКИЕ_МАТЕРИАЛ';
const STANDART_BAZA = [{ k: 1, kat: 'МАТ' }, { k: 1, kat: 'КАБ' }];
const bazaKalit = (b) => (b ?? []).map((h) => `${h.kat}:${h.k ?? 1}`).sort().join('|');
const ESKI_BAZA_KALIT = bazaKalit([{ kat: 'МАТ' }, { kat: 'М/К' }, { kat: 'БЕЗ СКЛАД' }, { kat: 'КАБ' }]);

function pgYukla() {
  const dir = process.env.PG_MODULE_DIR;
  try { return createRequire(dir ? join(resolve(dir), 'x.js') : join(__dirname, 'x.js'))('pg'); }
  catch { throw new Error('`pg` moduli topilmadi: PG_MODULE_DIR=<papka> bering yoki `cd ops/scripts && npm i --no-save pg`.'); }
}
const pg = pgYukla();
const url = process.env.SMETA_DB_URL;
if (!url) { console.error('SMETA_DB_URL o\'rnatilmagan.'); process.exit(2); }
const u = new URL(url);
for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k);
const lokal = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
const c = new pg.Client({ connectionString: u.toString(), ssl: lokal ? false : { rejectUnauthorized: false }, application_name: KIM, statement_timeout: 300000 });

const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => (x == null ? 0 : Number(x));

/** TS yadro (hisob-yadro podvalBahola) bilan bir xil: baza hadlari bo'yicha kategoriya yig'indisi × foiz. Kategoriyalar agregatdan. */
function tsSklad(agg, podvalQator) {
  const mat = num(agg.mat), mk = num(agg.mk), kab = num(agg.kab), bez = num(agg.bez);
  const kat = { 'МАТ': mat - mk - kab - bez, 'М/К': mk, 'КАБ': kab, 'БЕЗ СКЛАД': bez };
  const baza = (podvalQator.baza ?? []).reduce((t, h) => t + (h.kat ? (kat[h.kat] ?? 0) * (h.k ?? 1) : 0), 0);
  return r2(baza * Number(podvalQator.foiz) / 100);
}

async function paket(id, olchov, aktId = null) {
  const r = await c.query('select p.paket from public._t2_summa_paket_v1(array[$1::bigint], $2::text, case when $3::bigint is null then null else array[$3::bigint] end) p', [id, olchov, aktId]);
  return r.rows[0]?.paket ?? null;
}
const agg = async (id) => (await c.query("select agg from public._t2_summa_agg_v1(array[$1::bigint], 'smeta')", [id])).rows[0].agg;

async function qaytarish() {
  // Eng so'nggi tarix yozuvini (shu skript yozgan: kim = KIM) qaytaradi.
  const t = await c.query(`select p.id as podval_id, p.obyekt_id, p.versiya, t.qatorlar, t.nom
                             from public.t2_nakrutka_podval p
                             join lateral (select x.* from public.t2_nakrutka_podval_tarix x where x.podval_id = p.id order by x.id desc limit 1) t on true
                            where p.kim = $1 and p.faol`, [KIM]);
  for (const x of t.rows) {
    await c.query('insert into public.t2_nakrutka_podval_tarix (podval_id, kompaniya_id, versiya, nom, qatorlar, faol, kim) select id, kompaniya_id, versiya, nom, qatorlar, faol, kim from public.t2_nakrutka_podval where id = $1', [x.podval_id]);
    await c.query('update public.t2_nakrutka_podval set qatorlar = $2::jsonb, versiya = versiya + 1, kim = $3, yangilandi = now() where id = $1', [x.podval_id, JSON.stringify(x.qatorlar), KIM + ':qaytarildi']);
    console.log(`qaytarildi: obyekt ${x.obyekt_id}, podval ${x.podval_id}`);
  }
}

async function main() {
  await c.connect();
  await c.query('begin');
  const natija = [];
  let xato = false;
  try {
    if (QAYTAR) { await qaytarish(); }
    else {
      const maqsad = JSON.parse(readFileSync(maqsadFayl, 'utf8'));
      for (const [idS, target] of Object.entries(maqsad)) {
        const id = Number(idS);
        const q = { id, holat: null };
        const pv = (await c.query('select id, versiya, nom, qatorlar, kompaniya_id from public.t2_nakrutka_podval where obyekt_id = $1 and faol for update', [id])).rows[0];
        if (!pv) { natija.push({ ...q, holat: 'PODVAL_YOQ' }); continue; }
        const qat = pv.qatorlar.find((x) => x.kod === KOD && x.koefKod === KOEF);
        if (!qat) { natija.push({ ...q, holat: 'SKL_MAT_QATORI_YOQ' }); continue; }
        const eskiBaza = bazaKalit(qat.baza);
        if (eskiBaza !== ESKI_BAZA_KALIT && eskiBaza !== bazaKalit(STANDART_BAZA)) { natija.push({ ...q, holat: 'BAZA_KUTILMAGAN', baza: eskiBaza }); continue; }
        // Tasdiqlangan F2: o'z podvali yo'q bo'lsa — obyekt podvali o'zgarsa summasi o'zgaradi → o'tkazib yuboriladi.
        const tas = (await c.query(`select count(*)::int n, count(*) filter (where not exists (select 1 from public.t2_akt_podval ap where ap.akt_id = a.id))::int podvalsiz
                                      from public.t2_akt a where a.obyekt_id = $1 and a.tur = 'f2' and a.holat = 'tasdiqlangan'`, [id])).rows[0];
        if (tas.podvalsiz > 0) { natija.push({ ...q, holat: 'TASDIQLANGAN_F2_PODVALSIZ', tasdiqlangan: tas.n }); continue; }

        const a = await agg(id);
        const baza = r2(num(a.mat) - num(a.bez) - num(a.mk));
        if (!(baza > 0)) { natija.push({ ...q, holat: 'BAZA_NOL' }); continue; }
        const oldin = { smeta: await paket(id, 'smeta'), f2: await paket(id, 'f2'), f2q: await paket(id, 'f2_qoralama') };
        const eskiFoiz = qat.foiz;
        const yangiFoiz = Number((Number(target) / baza * 100).toFixed(12));

        // Eski holat tarixga (t2_nakrutka_podval_saqla_v1 bilan bir xil), keyin yangilash.
        await c.query('insert into public.t2_nakrutka_podval_tarix (podval_id, kompaniya_id, versiya, nom, qatorlar, faol, kim) select id, kompaniya_id, versiya, nom, qatorlar, faol, kim from public.t2_nakrutka_podval where id = $1', [pv.id]);
        const yangiQatorlar = pv.qatorlar.map((x) => (x === qat
          ? { ...x, foiz: yangiFoiz, baza: STANDART_BAZA, izoh: 'Эффективный % сводки (сумма складских / база МАТ+КАБ); база приведена к стандартной' }
          : x));
        await c.query('update public.t2_nakrutka_podval set qatorlar = $2::jsonb, versiya = versiya + 1, kim = $3, yangilandi = now() where id = $1', [pv.id, JSON.stringify(yangiQatorlar), KIM]);

        const keyin = { smeta: await paket(id, 'smeta'), f2: await paket(id, 'f2'), f2q: await paket(id, 'f2_qoralama') };
        const sklKeyin = num(keyin.smeta.ustama.skl_mat);
        const yangiQat = yangiQatorlar.find((x) => x.kod === KOD);
        const ts = tsSklad(a, yangiQat);
        const farqSql = r2(sklKeyin - Number(target));
        const farqTs = r2(ts - Number(target));
        const tasF2Oz = JSON.stringify(oldin.f2) !== JSON.stringify(keyin.f2);
        const ok = Math.abs(farqSql) <= 1 && Math.abs(farqTs) <= 1 && !tasF2Oz;
        if (!ok) xato = true;
        natija.push({
          id, holat: ok ? 'OK' : 'MOS_EMAS', podval_id: pv.id,
          baza_sql: baza, foiz_eski: eskiFoiz, foiz_yangi: yangiFoiz, maqsad: Number(target),
          sklad_eski_sql: num(oldin.smeta.ustama.skl_mat), sklad_yangi_sql: sklKeyin, sklad_yangi_ts: ts, farq_sql: farqSql, farq_ts: farqTs,
          ustamali_eski: num(oldin.smeta.ustamali), ustamali_yangi: num(keyin.smeta.ustamali), ustamasiz_ozgardi: num(oldin.smeta.ustamasiz) !== num(keyin.smeta.ustamasiz),
          tasdiqlangan_f2: tas.n, tasdiqlangan_f2_summa_ozgardi: tasF2Oz,
          qoralama_ustamali_eski: oldin.f2q ? num(oldin.f2q.ustamali) : null, qoralama_ustamali_yangi: keyin.f2q ? num(keyin.f2q.ustamali) : null,
        });
      }
    }
    if (chiqFayl) writeFileSync(chiqFayl, JSON.stringify(natija, null, 1), 'utf8');
    const ozi = natija.filter((x) => x.holat === 'OK').length;
    for (const x of natija) console.log(JSON.stringify(x));
    console.log(`JAMI: ${natija.length}, OK: ${ozi}, boshqa: ${natija.length - ozi}`);
    if (APPLY && !xato && natija.every((x) => x.holat === 'OK') || (APPLY && QAYTAR)) { await c.query('commit'); console.log('COMMIT qilindi.'); }
    else { await c.query('rollback'); console.log(APPLY ? 'ROLLBACK (tekshiruv o\'tmadi — hech narsa saqlanmadi).' : 'ROLLBACK (rehearsal — hech narsa saqlanmadi).'); }
  } catch (e) {
    await c.query('rollback').catch(() => {});
    console.error('XATO, ROLLBACK:', e.message);
    process.exitCode = 1;
  } finally { await c.end(); }
}
main();
