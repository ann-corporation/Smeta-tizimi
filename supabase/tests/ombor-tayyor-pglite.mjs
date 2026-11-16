// T2-OMBOR-TAYYOR v1 — SQL shartnoma testi (PGlite, FAQAT sintetik ma'lumot; prod'ga tegmaydi).
// Ishga tushirish: OMBOR_PGLITE_DIR=C:/Temp/c11-sql-runtime node --experimental-strip-types supabase/tests/ombor-tayyor-pglite.mjs
// PGlite o'rnatilmagan bo'lsa — test o'tkazib yuboriladi (CI da majburiy emas). Ruxsat/aktor funksiyalari — mock (prod ruxsat paritetiga da'vo yo'q).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nomKaliti, birlikKaliti } from '../../frontend/src/lib/ombor-moslash/moslash.ts';

const dir = process.env.OMBOR_PGLITE_DIR || 'C:/Temp/c11-sql-runtime';
let PGlite, pg_trgm;
try {
  ({ PGlite } = await import(pathToFileURL(resolve(dir, 'node_modules/@electric-sql/pglite/dist/index.js')).href));
  ({ pg_trgm } = await import(pathToFileURL(resolve(dir, 'node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js')).href));
} catch { console.log('SKIP: PGlite topilmadi (' + dir + ')'); process.exit(0); }

const migration = await readFile(new URL('../migrations/20270101000000_t2_ombor_tayyor_v1.sql', import.meta.url), 'utf8');
const db = new PGlite({ extensions: { pg_trgm } });
const q = async (sql, params) => (await db.query(sql, params)).rows;
const jq = async (sql, params) => (await q(sql, params))[0].r;

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA extensions; CREATE EXTENSION pg_trgm SCHEMA extensions;
  CREATE TABLE public.t2_obyekt (id bigint PRIMARY KEY, kompaniya_id bigint NOT NULL);
  CREATE TABLE public.t2_sklad_mustaqil (id bigint, kompaniya_id bigint, nomi text, holat text DEFAULT 'faol', UNIQUE (kompaniya_id, id));
  CREATE TABLE public.t2_material_alias (id bigserial PRIMARY KEY, kompaniya_id bigint, alias_nom text NOT NULL, kanonik_nom_key text NOT NULL,
    kanonik_birlik_key text, holat text NOT NULL DEFAULT 'faol', versiya int NOT NULL DEFAULT 1, yaratildi timestamptz NOT NULL DEFAULT now());
  CREATE UNIQUE INDEX t2_material_alias_uniq ON public.t2_material_alias (COALESCE(kompaniya_id, 0), upper(btrim(alias_nom))) WHERE holat = 'faol';
  CREATE TABLE public.t2_sklad_harakat (
    id bigserial PRIMARY KEY, kompaniya_id bigint NOT NULL, obyekt_id bigint, operatsiya text NOT NULL CHECK (operatsiya IN ('prixod','rasxod')),
    turi text NOT NULL DEFAULT 'mat', sana date NOT NULL DEFAULT CURRENT_DATE, nomi text NOT NULL, birligi text NOT NULL,
    obyomi numeric(15,4) NOT NULL CHECK (obyomi > 0), postavshik text, qabul_qiluvchi text, qabul_turi text, izoh text, holat text NOT NULL DEFAULT 'faol',
    operation_id uuid, manba text, kim text, yaratildi timestamptz NOT NULL DEFAULT now(),
    c11_sklad_id bigint, c11_source_sheet text, c11_source_row integer, c11_operation_id uuid, c11_request_hash text, c11_storno_of_id bigint,
    c11_actor_id bigint, c11_manba_turi text, c11_sf_tasdiq text, c11_hedef_obyekt_id bigint, c11_juft_id bigint,
    CHECK (obyekt_id IS NOT NULL OR c11_sklad_id IS NOT NULL), CHECK (c11_request_hash IS NULL OR c11_request_hash ~ '^[0-9a-f]{64}$'));
  CREATE FUNCTION public.t2_sklad_c11_append_only_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN
    IF OLD.c11_sklad_id IS NOT NULL THEN RAISE EXCEPTION 'append-only' USING ERRCODE='55000'; END IF; RETURN OLD; END $f$;
  CREATE TRIGGER g BEFORE DELETE OR UPDATE ON public.t2_sklad_harakat FOR EACH ROW EXECUTE FUNCTION public.t2_sklad_c11_append_only_guard_v1();
  CREATE TABLE public.audit_log (amal text, tafsilot text);
  CREATE FUNCTION public.t2_audit_yoz(k bigint, amal text, tur text, id bigint, tafsilot text, kim text, x text) RETURNS void LANGUAGE sql AS
    $f$ INSERT INTO public.audit_log VALUES (amal, tafsilot) $f$;
  CREATE FUNCTION public.t2_actor_kompaniya_azo_tekshir(k bigint, a bigint) RETURNS text LANGUAGE sql AS
    $f$ SELECT CASE WHEN a = 1 OR a = 2 THEN 'omborchi' ELSE NULL END $f$;
  -- mock: aktor 1 = omborchi (warehouse.write), aktor 2 = faqat o'qiydi
  CREATE FUNCTION public.t2_permission_allowed_v2(k bigint, a bigint, p text) RETURNS boolean LANGUAGE sql AS
    $f$ SELECT (a = 1 AND p IN ('warehouse.write','warehouse.read')) OR (a = 2 AND p = 'warehouse.read') $f$;
  CREATE FUNCTION public.t2_material_alias_yoz(p_alias_nom text, p_kanonik_nom_key text, p_kanonik_birlik_key text DEFAULT NULL, p_kompaniya_id bigint DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql AS $f$ BEGIN
      INSERT INTO public.t2_material_alias (kompaniya_id, alias_nom, kanonik_nom_key, kanonik_birlik_key) VALUES (p_kompaniya_id, p_alias_nom, upper(btrim(p_kanonik_nom_key)), p_kanonik_birlik_key)
      ON CONFLICT (coalesce(kompaniya_id, 0), upper(btrim(alias_nom))) WHERE holat = 'faol' DO UPDATE SET kanonik_nom_key = EXCLUDED.kanonik_nom_key;
      RETURN '{"ok":true}'::jsonb; END $f$;
  INSERT INTO public.t2_sklad_mustaqil VALUES (9, 1, 'Test ombor', 'faol'), (10, 2, 'Boshqa', 'faol');
  INSERT INTO public.t2_obyekt VALUES (100, 1), (200, 2);
`);
await db.exec(migration);

const SK = 9, K = 1, A = 1;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let op = 0;
const prixod = (nomi, birl, m, sana = '2026-11-01', post = 'Ta\'minotchi A', tur = 'Sintetik') =>
  jq(`SELECT public.t2_ombor_prixod_v1($1,$2,$3,$4,$5,$6,$7::date,$8,$9,NULL,NULL,$10::uuid) r`, [A, K, SK, nomi, birl, m, sana, post, tur, uid(++op)]);
const chiqim = (nomi, birl, m, opid = uid(++op), manfiy = false) =>
  jq(`SELECT public.t2_ombor_chiqim_v1($1,$2,$3,$4,$5,$6,'2026-11-02'::date,'Sintetik brigada','prorab',100,NULL,$7::uuid,$8) r`, [A, K, SK, nomi, birl, m, opid, manfiy]);
const qoldiq = (filtr = {}) => jq(`SELECT public.t2_ombor_qoldiq_v2($1,$2,$3,$4::jsonb,50,0) r`, [A, K, SK, JSON.stringify(filtr)]);

// 1) SQL kalit == TS kalit (sintetik namunalar)
const namunalar = ['Пoлиэтилен труба ф25', 'ПЭ труба Д25', 'Уголок 50х50х5', 'Уголок 50 × 50 × 5', 'Лист 2,5 мм', 'Quvur 25', 'Цемент М400', 'Sement M400',
  'Электрод арсенал 3', 'Plita granit 300*600*18', 'Щебень 5х20', 'Cтрoйка ABC-12', 'o\'zbek g\'isht 1,5'];
for (const s of namunalar) assert.equal((await q('SELECT public.t2_ombor_kalit_v1($1) r', [s]))[0].r, nomKaliti(s), 'kalit: ' + s);
for (const b of ['шт', 'dona', 'м2', 'кв.м', 'куб', 'тн', 'м', 'кг', 'рулон', 'Litr']) assert.equal((await q('SELECT public.t2_ombor_birlik_v1($1) r', [b]))[0].r, birlikKaliti(b), 'birlik: ' + b);

// 2) prixod / idempotentlik / konflikt
const r1 = await prixod('Полиэтилен труба ф25', 'м', 100);
assert.equal(r1.ok, true); assert.equal(r1.takror, false);
const opSame = uid(500);
const a1 = await jq(`SELECT public.t2_ombor_prixod_v1($1,$2,$3,'Тест А','шт',5,'2026-11-01'::date,'P',NULL,NULL,NULL,$4::uuid) r`, [A, K, SK, opSame]);
const a2 = await jq(`SELECT public.t2_ombor_prixod_v1($1,$2,$3,'Тест А','шт',5,'2026-11-01'::date,'P',NULL,NULL,NULL,$4::uuid) r`, [A, K, SK, opSame]);
assert.equal(a2.takror, true); assert.equal(a2.harakat_id, a1.harakat_id);
const a3 = await jq(`SELECT public.t2_ombor_prixod_v1($1,$2,$3,'Тест А','шт',6,'2026-11-01'::date,'P',NULL,NULL,NULL,$4::uuid) r`, [A, K, SK, opSame]);
assert.equal(a3.code, 'OPERATION_ID_CONFLICT');
assert.equal((await prixod('Тест', 'шт', 0)).code, 'INVALID_INPUT');
assert.equal((await prixod('Тест', 'шт', 1, '2099-01-01')).code, 'DATE_IN_FUTURE');

// 3) ruxsat va tenant izolyatsiyasi
await assert.rejects(() => jq(`SELECT public.t2_ombor_prixod_v1(2,1,9,'X','шт',1,NULL,NULL,NULL,NULL,NULL,$1::uuid) r`, [uid(900)]), /PERMISSION_DENIED/);
assert.equal((await jq(`SELECT public.t2_ombor_qoldiq_v2(2,1,9,'{}'::jsonb,5,0) r`)).ok, true, 'o\'qish ruxsati bor');
assert.equal((await jq(`SELECT public.t2_ombor_prixod_v1(1,1,10,'X','шт',1,NULL,NULL,NULL,NULL,NULL,$1::uuid) r`, [uid(901)])).code, 'WAREHOUSE_SCOPE_MISMATCH');

// 4) variantlar bitta guruhda (kalit bo'yicha avtomatik) + alias bilan tasdiq
await prixod('ПЭ труба Д25', 'м', 50);
await prixod('Пoлиэтилен труба ф25', 'м', 25); // lotin «o»
await prixod('Полиэтилен труба ф32', 'м', 10); // boshqa o'lcham — alohida
let o = await qoldiq({ qidir: 'труба 25' });
const g25 = o.qatorlar.find((x) => x.qoldiq === 175);
assert.ok(g25, 'ф25 variantlari 100+50+25=175 bitta guruhda');
assert.equal(g25.variantlar_soni, 3);
assert.ok(!o.qatorlar.some((x) => x.qoldiq === 10) || o.qatorlar.findIndex((x) => x.qoldiq === 175) < o.qatorlar.findIndex((x) => x.qoldiq === 10), 'ф25 ф32 dan oldin');
o = await qoldiq({ qidir: 'quvur 32' });
assert.equal(o.qatorlar[0].qoldiq, 10, 'o\'zbekcha lotin qidiruv kirill nomni topadi');

// 5) chiqim: yetmasa rad, idempotent, manfiy ruxsat
assert.equal((await chiqim('Полиэтилен труба ф25', 'м', 1000)).code, 'QOLDIQ_YETMAYDI');
const c1op = uid(700);
const c1 = await chiqim('ПЭ труба Д25', 'м', 75, c1op); // boshqa yozuv nomi — guruh ostatkasidan (175)
assert.equal(c1.ok, true); assert.equal(c1.qoldiq_keyin, 100);
assert.equal((await chiqim('ПЭ труба Д25', 'м', 75, c1op)).takror, true);
assert.equal((await chiqim('Полиэтилен труба ф25', 'шт', 1)).code, 'QOLDIQ_YETMAYDI', 'birlik farqi — boshqa guruh');

// 6) tuzatish: aniq yozuvga havola; append-only; bir marta
const tuz = (id, yangi, sabab = 'sintetik xato', opid = uid(++op)) =>
  jq(`SELECT public.t2_ombor_tuzat_v1($1,$2,$3,$4,$5::jsonb,$6,$7::uuid) r`, [A, K, SK, id, yangi && JSON.stringify(yangi), sabab, opid]);
const t1 = await tuz(c1.harakat_id, { miqdor: 60 });
assert.equal(t1.ok, true);
assert.equal((await qoldiq({ qidir: 'труба 25' })).qatorlar.find((x) => x.nomi && x.birligi === 'м' && x.qoldiq === 115)?.qoldiq, 115, '175-60');
assert.equal((await tuz(c1.harakat_id, { miqdor: 10 })).code, 'ALREADY_REVERSED');
await assert.rejects(() => db.exec(`UPDATE public.t2_sklad_harakat SET obyomi = 1 WHERE id = ${c1.harakat_id}`), /append-only/);
assert.equal((await tuz(999999, { miqdor: 1 })).code, 'MOVEMENT_NOT_FOUND');
const bekor = await tuz(t1.yangi_id, null, 'bekor');
assert.equal(bekor.ok, true); assert.equal(bekor.yangi_id ?? null, null);
assert.equal((await qoldiq({ qidir: 'труба 25' })).qatorlar.find((x) => x.birligi === 'м' && x.qoldiq === 175)?.qoldiq, 175, 'bekordan keyin to\'liq qaytdi');
const tarix = await jq(`SELECT public.t2_ombor_tarix_v1($1,$2,$3,$4,'м',50,0) r`, [A, K, SK, g25.kalit]);
assert.equal(tarix.ok, true); assert.ok(tarix.qatorlar.some((x) => x.teskari === true));

// 7) alias tasdiq: ikki XAR XIL kalitli nom bitta guruhga birlashadi
await prixod('Мих 100', 'кг', 20); await prixod('Гвозди 100мм', 'кг', 30);
assert.equal((await qoldiq({ qidir: 'мих' })).qatorlar.length >= 1, true);
const al = await jq(`SELECT public.t2_ombor_alias_tasdiq_v1($1,$2,$3,'Гвозди 100мм','["Мих 100"]'::jsonb,$4::uuid) r`, [A, K, SK, uid(++op)]);
assert.equal(al.ok, true);
const birl = await qoldiq({ birlik: 'kg' });
assert.equal(birl.qatorlar.find((x) => x.qoldiq === 50)?.variantlar_soni, 2, 'alias bilan 20+30=50');

// 8) «Приход» sinxron: dry-run, qo'llash, idempotent, takroriy mazmun (ord), siljigan qator raqamlari
const qat = [
  { row: 4, ord: 1, sana: '2026-10-01', nomi: 'Синтетик песок', birligi: 'м3', obyomi: '9', postavshik: 'S1', tur: 'Песок' },
  { row: 5, ord: 2, sana: '2026-10-01', nomi: 'Синтетик песок', birligi: 'м3', obyomi: '9', postavshik: 'S1', tur: 'Песок' },
  { row: 6, ord: 1, sana: '2026-10-02', nomi: 'Синтетик цемент', birligi: 'тн', obyomi: '10.5', postavshik: 'S2', tur: 'Цемент', sf: 'ha' },
];
const dry = await jq(`SELECT public.t2_ombor_prixod_sinxron_v1($1,$2,$3,$4::jsonb,$5::uuid,true) r`, [A, K, SK, JSON.stringify(qat), uid(800)]);
assert.deepEqual([dry.yangi, dry.mavjud, dry.dry_run], [3, 0, true]);
assert.equal(Number((await q(`SELECT count(*) c FROM public.t2_sklad_harakat WHERE manba='ombor_prixod_sinxron_v1'`))[0].c), 0, 'dry-run yozmaydi');
const ap = await jq(`SELECT public.t2_ombor_prixod_sinxron_v1($1,$2,$3,$4::jsonb,$5::uuid,false) r`, [A, K, SK, JSON.stringify(qat), uid(801)]);
assert.equal(ap.yangi, 3);
const sh = qat.map((x) => ({ ...x, row: x.row + 17 })); // qator raqamlari siljidi
const ap2 = await jq(`SELECT public.t2_ombor_prixod_sinxron_v1($1,$2,$3,$4::jsonb,$5::uuid,false) r`, [A, K, SK, JSON.stringify(sh), uid(802)]);
assert.deepEqual([ap2.yangi, ap2.mavjud], [0, 3], 'qayta ishga tushirish takror yaratmaydi');
const qat2 = [...qat, { row: 9, ord: 3, sana: '2026-10-01', nomi: 'Синтетик песок', birligi: 'м3', obyomi: '9' }];
const ap3 = await jq(`SELECT public.t2_ombor_prixod_sinxron_v1($1,$2,$3,$4::jsonb,$5::uuid,false) r`, [A, K, SK, JSON.stringify(qat2), uid(803)]);
assert.deepEqual([ap3.yangi, ap3.mavjud], [1, 3], 'faqat yangi (3-takror) qo\'shildi');
const kal = await jq(`SELECT public.t2_ombor_prixod_kalitlar_v1($1,$2,$3) r`, [A, K, SK]);
assert.equal(kal.kalitlar.find((x) => x.k === '2026-10-01|Синтетик песок|м3|9')?.n, 3);
const bad = await jq(`SELECT public.t2_ombor_prixod_sinxron_v1($1,$2,$3,'[{"row":1,"ord":1,"sana":"bad","nomi":"x","birligi":"шт","obyomi":"1"}]'::jsonb,$4::uuid,true) r`, [A, K, SK, uid(804)]);
assert.equal(bad.xato.length, 1);

// 9) audit yozilgan
const audit = await q(`SELECT DISTINCT amal FROM public.audit_log ORDER BY 1`);
for (const a of ['ombor_prixod_yozildi', 'ombor_rasxod_yozildi', 'ombor_tuzatildi', 'ombor_alias_tasdiqlandi', 'ombor_prixod_sinxronlandi']) assert.ok(audit.some((x) => x.amal === a), 'audit: ' + a);
// 10) anon/authenticated ijro huquqi yo'q
assert.equal((await q(`SELECT has_function_privilege('anon','public.t2_ombor_qoldiq_v2(bigint,bigint,bigint,jsonb,integer,integer)','EXECUTE') r`))[0].r, false);
console.log('OK: ombor-tayyor SQL shartnoma testi o\'tdi');
await db.close();
