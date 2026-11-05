// Local synthetic-only test for 20261203001000_t2_f2_versiya_kochirma_v1 (real ma'lumot yo'q).
// PGLITE_DIR — o'rnatilgan @electric-sql/pglite paketiga yo'l. Ishga tushirish:
//   PGLITE_DIR=<.../node_modules/@electric-sql/pglite> node supabase/tests/f2-versiya-kochirma-pglite.mjs
// Sxema — faqat funksiya o'qiydigan ustunlar (stub); a'zolik/ruxsat yordamchilari — sintetik.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const runtime = process.env.PGLITE_DIR;
const { PGlite } = await import(runtime ? pathToFileURL(resolve(runtime, 'dist/index.js')).href : '@electric-sql/pglite');
const db = new PGlite();
const nom = '20261203001000_t2_f2_versiya_kochirma_v1';
const migr = await readFile(new URL(`../migrations/${nom}.sql`, import.meta.url), 'utf8');
const rb = await readFile(new URL(`../migrations/${nom}.rollback.sql`, import.meta.url), 'utf8');
let checks = 0;

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table t2_azolik(kompaniya_id bigint, foydalanuvchi_id bigint);
  create table t2_obyekt(id bigint primary key, kompaniya_id bigint);
  create table t2_qator(id bigint primary key, obyekt_id bigint, ota_id bigint, tur text, kod text, nom text, birlik text,
    tartib int, versiya_holat text not null default 'faol', almashtirgan_versiya_id bigint);
  create table t2_akt(id bigint primary key, tur text, holat text);
  create table t2_akt_qator(id serial primary key, akt_id bigint, qator_id bigint, hajm numeric, summa numeric,
    certified_quantity numeric, certified_amount numeric);
  create table t2_smeta_versiya(id bigint primary key, obyekt_id bigint);
  create table t2_smeta_versiya_pozitsiya(id bigint primary key, versiya_id bigint, kompaniya_id bigint, manba jsonb);
  create table t2_smeta_versiya_moslik(id serial primary key, versiya_id bigint, pozitsiya_id bigint, qator_id bigint, holat text,
    ishonch smallint default 100, tasdiq text not null default 'avto', birlik_farq boolean not null default false, versiya int not null default 1);
  create function t2_actor_kompaniya_azo_tekshir(k bigint, a bigint) returns text language plpgsql as $$begin
    if not exists (select 1 from t2_azolik z where z.kompaniya_id = k and z.foydalanuvchi_id = a) then
      raise exception 'COMPANY_ACCESS_DENIED' using errcode = '42501'; end if; return 'admin'; end$$;
  create function t2_require_permission_v2(k bigint, a bigint, p text) returns void language sql as $$select$$;
  create function t2_resurs_nom_kalit(t text) returns text language sql immutable as $$select upper(btrim(coalesce(t,'')))$$;
  create function t2_resurs_birlik_kalit(t text) returns text language sql immutable as $$select upper(btrim(coalesce(t,'')))$$;
  insert into t2_azolik values (1, 7), (2, 8);
  insert into t2_obyekt values (100, 1), (200, 2);
`);

// Eski smeta (v=10 bilan almashtirilgan): rz 1 → bl 2 (E1) → rs 3 ЦЕМЕНТ, rs 4 ЦЕМЕНТ (takror), rs 5 ПЕСОК;
// bl 6 (E2) → rs 7; rz ostida mat 8 КАБЕЛЬ (yangi smetada yo'q); bl 9 (E3, moslik kutilmoqda); rz ostida mat 11 (pozitsiyasiz);
// rs 12 ЩЕБЕНЬ (yangi E1 da yo'q); bl 13 E4 (nishoni keyin almashtirilgan, keyingi versiyada pozitsiyasi yo'q).
// Yangi smeta: rz 21 → bl 22 (E1) → rs 23 ЦЕМЕНТ, rs 24 ЦЕМЕНТ, rs 25 ПЕСОК; bl 26 (E2); bl 29 (E3); bl 33 (E4, keyin almashtirilgan).
// Ikkinchi versiya (v=20): bl 22 → bl 42 (rs 43, 44 ЦЕМЕНТ, 45 ПЕСОК); bl 26 → bl 46.
await db.exec(`
  insert into t2_smeta_versiya values (10, 100), (20, 100), (90, 200);
  insert into t2_qator(id, obyekt_id, ota_id, tur, kod, nom, birlik, tartib, versiya_holat, almashtirgan_versiya_id) values
    (1,100,null,'rz',null,'R',null,1,'almashtirilgan',10),
    (2,100,1,'bl','E1','ISH1','м3',2,'almashtirilgan',10),
    (3,100,2,'rs','C','ЦЕМЕНТ','т',3,'almashtirilgan',10),
    (4,100,2,'rs','C',' ЦЕМЕНТ ','т',4,'almashtirilgan',10),
    (5,100,2,'rs','P','ПЕСОК','м3',5,'almashtirilgan',10),
    (6,100,1,'bl','E2','ISH2','м2',6,'almashtirilgan',10),
    (7,100,6,'rs','G','ГВОЗДИ','кг',7,'almashtirilgan',10),
    (8,100,1,'mat','K','КАБЕЛЬ','м',8,'almashtirilgan',10),
    (9,100,1,'bl','E3','ISH3','шт',9,'almashtirilgan',10),
    (11,100,1,'mat','Z','PОЗСИЗ','шт',11,'almashtirilgan',10),
    (12,100,2,'rs','Щ','ЩЕБЕНЬ','м3',12,'almashtirilgan',10),
    (13,100,1,'bl','E4','ISH4','шт',13,'almashtirilgan',10),
    (21,100,null,'rz',null,'R',null,1,'almashtirilgan',20),
    (22,100,21,'bl','E1','ISH1','м3',2,'almashtirilgan',20),
    (23,100,22,'rs','CX','ЦЕМЕНТ','т',3,'almashtirilgan',20),
    (24,100,22,'rs','CX','ЦЕМЕНТ','т',4,'almashtirilgan',20),
    (25,100,22,'rs','PX','ПЕСОК','м3',5,'almashtirilgan',20),
    (26,100,21,'bl','E2','ISH2','м2',6,'almashtirilgan',20),
    (29,100,21,'bl','E3','ISH3','шт',9,'faol',null),
    (33,100,21,'bl','E4','ISH4','шт',13,'almashtirilgan',20),
    (41,100,null,'rz',null,'R',null,1,'faol',null),
    (42,100,41,'bl','E1','ISH1','м3',2,'faol',null),
    (43,100,42,'rs','CY','ЦЕМЕНТ','т',3,'faol',null),
    (44,100,42,'rs','CY','ЦЕМЕНТ','т',4,'faol',null),
    (45,100,42,'rs','PY','ПЕСОК','м3',5,'faol',null),
    (46,100,41,'bl','E2','ISH2','м2',6,'faol',null),
    (900,200,null,'bl','E1','ISH1','м3',1,'almashtirilgan',90);
  insert into t2_smeta_versiya_pozitsiya values
    (101,10,1,'{"qator_id":2}'), (102,10,1,'{"qator_id":6}'), (103,10,1,'{"qator_id":8}'), (104,10,1,'{"qator_id":9}'), (105,10,1,'{"qator_id":13}'),
    (201,20,1,'{"qator_id":22}'), (202,20,1,'{"qator_id":26}'), (203,20,1,'{"qator_id":29}');
  insert into t2_smeta_versiya_moslik(versiya_id, pozitsiya_id, qator_id, holat, tasdiq) values
    (10,101,22,'kamaygan','avto'), (10,102,26,'ozgarmagan','tasdiqlandi'), (10,103,null,'ochirilgan','avto'),
    (10,104,29,'ozgarmagan','kutilmoqda'), (10,105,33,'ozgarmagan','avto'),
    (20,201,42,'ozgarmagan','avto'), (20,202,46,'ozgarmagan','avto');
  insert into t2_akt values (1,'f2','tasdiqlangan'), (2,'f2','tasdiqlangan'), (3,'f2','qoralama'), (4,'fakt','tasdiqlangan'), (5,'f2','bekor'), (9,'f2','tasdiqlangan');
  insert into t2_akt_qator(akt_id, qator_id, hajm, summa, certified_quantity, certified_amount) values
    (1,3,4,400,null,null),          -- ЦЕМЕНТ #1 → 43
    (1,4,2,200,2,210),              -- ЦЕМЕНТ #2 (certified ustun) → 44
    (2,4,-1,-100,null,null),        -- storno qismi: ЦЕМЕНТ #2 sof 1 / 110
    (1,5,3,null,null,null),         -- ПЕСОК: summa noma'lum (NULL ≠ 0) → 45
    (1,6,2,200,null,null),          -- ish E2 → 46
    (1,7,1,100,null,null),          -- ish ichidagi rs ГВОЗДИ; yangi E2 da resurs yo'q → resurs_topilmadi
    (1,8,5,50,null,null),           -- КАБЕЛЬ → yangi_smetada_yoq
    (1,9,1,10,null,null),           -- E3 → tasdiq_kutilmoqda (nomzod 29)
    (1,11,1,1,null,null),           -- pozitsiya_yoq
    (1,12,2,20,null,null),          -- ЩЕБЕНЬ → resurs_topilmadi
    (1,13,1,5,null,null),           -- E4 → nishon 33 almashtirilgan, v20 da pozitsiyasi yo'q → nishon_faol_emas
    (3,3,99,9900,null,null),        -- qoralama — kirmaydi
    (4,3,50,5000,null,null),        -- fakt — kirmaydi
    (5,3,7,700,null,null),          -- bekor — kirmaydi
    (2,2,1,0,null,null), (2,2,-1,0,null,null),  -- ish E1 sof 0 — ro'yxatga kirmaydi
    (9,900,3,300,null,null);        -- boshqa obyekt — kirmaydi
`);

await db.exec(migr);
const ol = async (o, a) => (await db.query('select t2_f2_versiya_kochirma_v1($1,$2) r', [o, a])).rows[0].r;
const r = await ol(100, 7);
assert.equal(r.ok, true); checks++;
assert.deepEqual(r.versiyalar, [10, 20]); checks++;
const q = new Map(r.qatorlar.map((x) => [x.qator_id, x]));
assert.deepEqual([...q.keys()].sort((a, b) => a - b), [43, 44, 45, 46]); checks++;
assert.equal(Number(q.get(43).f2_avvalgi_hajm), 4); assert.equal(Number(q.get(43).f2_avvalgi_summa), 400); assert.equal(q.get(43).zanjir_qadam, 2); checks++;
assert.equal(Number(q.get(44).f2_avvalgi_hajm), 1); assert.equal(Number(q.get(44).f2_avvalgi_summa), 110); assert.deepEqual(q.get(44).akt_idlar, [1, 2]); checks++;
assert.equal(Number(q.get(45).f2_avvalgi_hajm), 3); assert.equal(q.get(45).f2_avvalgi_summa, null); assert.equal(Number(q.get(45).f2_avvalgi_summa_nomalum), 1); checks++;
assert.equal(Number(q.get(46).f2_avvalgi_summa), 200); assert.deepEqual(q.get(46).eski_qator_idlar, [6]); checks++;
const m = new Map(r.moslanmagan.map((x) => [x.eski_qator_id, x]));
assert.deepEqual(Object.fromEntries([...m].map(([k, v]) => [k, v.sabab])),
  { 7: 'resurs_topilmadi', 8: 'yangi_smetada_yoq', 9: 'tasdiq_kutilmoqda', 11: 'pozitsiya_yoq', 12: 'resurs_topilmadi', 13: 'nishon_faol_emas' }); checks++;
assert.equal(m.get(9).nomzod_qator_id, 29); assert.equal(m.get(7).nomzod_qator_id, 46); checks++;
assert.ok(!m.has(2) && !q.has(42), 'sof 0 F2 ro‘yxatga kirmaydi'); checks++;
const j = r.jami;
assert.equal(j.eski_soni, 10); assert.equal(Number(j.eski_summa), 400 + 110 + 200 + 100 + 50 + 10 + 1 + 20 + 5); checks++;
assert.equal(j.kochdi_soni + j.kutilmoqda_soni + j.moslanmagan_soni, j.eski_soni); checks++;
assert.equal(Number(j.kochdi_summa) + Number(j.kutilmoqda_summa) + Number(j.moslanmagan_summa), Number(j.eski_summa)); checks++;
assert.equal(Number(j.kochdi_summa), 710); assert.equal(Number(j.kutilmoqda_summa), 10); checks++;

// Rad → rad_etilgan; tasdiqlandi → ko'chadi (29 faol).
await db.exec("update t2_smeta_versiya_moslik set tasdiq='rad' where pozitsiya_id=104");
assert.equal((await ol(100, 7)).moslanmagan.find((x) => x.eski_qator_id === 9).sabab, 'rad_etilgan'); checks++;
await db.exec("update t2_smeta_versiya_moslik set tasdiq='tasdiqlandi' where pozitsiya_id=104");
assert.ok((await ol(100, 7)).qatorlar.some((x) => x.qator_id === 29 && Number(x.f2_avvalgi_summa) === 10)); checks++;
// avto + birlik farqi → kutilmoqda.
await db.exec("update t2_smeta_versiya_moslik set birlik_farq=true where pozitsiya_id=201");
const r2 = await ol(100, 7);
assert.ok(!r2.qatorlar.some((x) => x.qator_id === 43)); assert.equal(r2.moslanmagan.find((x) => x.eski_qator_id === 3).sabab, 'tasdiq_kutilmoqda'); checks++;
await db.exec("update t2_smeta_versiya_moslik set birlik_farq=false where pozitsiya_id=201");

// Tenant: boshqa kompaniya a'zosi (8) va a'zo bo'lmagan (99) — rad; o'z obyekti (200, aktor 8) — faqat o'z ma'lumoti.
await assert.rejects(ol(100, 8), /COMPANY_ACCESS_DENIED/); checks++;
await assert.rejects(ol(100, 99), /COMPANY_ACCESS_DENIED/); checks++;
assert.equal((await ol(-1, 7)).code, 'OBYEKT_NOT_FOUND'); checks++;
const begona = await ol(200, 8);
assert.equal(begona.jami.eski_soni, 1); assert.equal(begona.moslanmagan[0].sabab, 'pozitsiya_yoq'); checks++;
// Ruxsatlar: faqat service_role.
const priv = (await db.query(`select has_function_privilege('anon','t2_f2_versiya_kochirma_v1(bigint,bigint)','execute') an,
  has_function_privilege('authenticated','t2_f2_versiya_kochirma_v1(bigint,bigint)','execute') au,
  has_function_privilege('service_role','t2_f2_versiya_kochirma_v1(bigint,bigint)','execute') sr`)).rows[0];
assert.deepEqual(priv, { an: false, au: false, sr: true }); checks++;
// Ma'lumot o'zgarmagan (faqat o'qish).
assert.equal((await db.query('select count(*)::int n from t2_akt_qator')).rows[0].n, 17); checks++;
// Rollback.
await db.exec(rb);
assert.equal((await db.query("select to_regprocedure('t2_f2_versiya_kochirma_v1(bigint,bigint)') p")).rows[0].p, null); checks++;
console.log(`F2_VERSIYA_KOCHIRMA_PGLITE_PASS checks=${checks}`);
