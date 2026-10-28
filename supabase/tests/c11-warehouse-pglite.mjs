import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Synthetic-only contract runner. Install PGlite separately, e.g.
//   npm install --prefix C:/Temp/c11-sql-runtime @electric-sql/pglite@0.5.12
// Then set C11_PGLITE_DIR to that package directory before running this file.
// The mock guards below are not production authorization parity.
const pgliteDir = process.env.C11_PGLITE_DIR;
const pgliteModule = pgliteDir
  ? pathToFileURL(resolve(pgliteDir, 'dist/index.js')).href
  : '@electric-sql/pglite';
const { PGlite } = await import(pgliteModule);

const migration = await readFile(new URL('../migrations/20261113810000_c11_warehouse_receipt_v1.sql', import.meta.url), 'utf8');
const acceptance = await readFile(new URL('./c11_warehouse_receipt_v1.sql', import.meta.url), 'utf8');
const rollback = await readFile(new URL('../migrations/20261113810000_c11_warehouse_receipt_v1.rollback.sql', import.meta.url), 'utf8');
const db = new PGlite();

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.t2_foydalanuvchi (id bigint PRIMARY KEY);
    CREATE TABLE public.t2_sklad_harakat (
      id bigserial PRIMARY KEY,
      kompaniya_id bigint NOT NULL,
      obyekt_id bigint NOT NULL,
      operatsiya text NOT NULL,
      turi text,
      sana date,
      nomi text,
      birligi text,
      obyomi numeric,
      postavshik text,
      qabul_qiluvchi text,
      qabul_turi text,
      izoh text,
      holat text,
      operation_id uuid,
      manba text,
      kim text,
      yaratildi timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.t2_sklad_mustaqil (
      id bigint PRIMARY KEY,
      kompaniya_id bigint NOT NULL,
      nomi text NOT NULL,
      holat text NOT NULL
    );
    CREATE TABLE public.t2_document_registry (
      id bigint PRIMARY KEY,
      kompaniya_id bigint NOT NULL,
      provider text,
      status text,
      canonical_storage_status text,
      sha256 text,
      sha256_verified boolean
    );
    CREATE TABLE public.t2_kontragent (
      id bigint PRIMARY KEY,
      kompaniya_id bigint NOT NULL,
      nom text NOT NULL
    );
    CREATE TABLE public.t2_erp_taminot (
      id bigint PRIMARY KEY,
      kompaniya_id bigint NOT NULL
    );
    CREATE FUNCTION public.t2_actor_kompaniya_azo_tekshir(bigint,bigint)
    RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      IF $1 <> 10 OR $2 <> 101 THEN
        RAISE EXCEPTION 'synthetic tenant actor rejected' USING ERRCODE = '42501';
      END IF;
      RETURN 'admin';
    END $$;
    CREATE FUNCTION public.t2_require_permission_v2(bigint,bigint,text)
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      IF $1 <> 10 OR $2 <> 101 OR $3 <> 'document.write' THEN
        RAISE EXCEPTION 'synthetic permission rejected' USING ERRCODE = '42501';
      END IF;
    END $$;
    CREATE FUNCTION public.t2_audit_yoz(bigint,text,text,bigint,text,text,text)
    RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
    INSERT INTO public.t2_sklad_mustaqil(id, kompaniya_id, nomi, holat) VALUES
      (100,10,'Synthetic main warehouse','faol'),
      (200,20,'Synthetic foreign warehouse','faol');
    INSERT INTO public.t2_foydalanuvchi(id) VALUES (101);
    INSERT INTO public.t2_document_registry
      (id, kompaniya_id, provider, status, canonical_storage_status, sha256, sha256_verified)
    VALUES
      (300,10,'cloudflare_r2','active','stored',repeat('a',64),true),
      (301,10,'cloudflare_r2','active','stored',repeat('a',64),true),
      (302,10,'cloudflare_r2','active','stored',NULL,true);
    SELECT set_config('t2.c11_test_company_id','10',false);
    SELECT set_config('t2.c11_test_actor_id','101',false);
    SELECT set_config('t2.c11_test_warehouse_id','100',false);
    SELECT set_config('t2.c11_test_foreign_warehouse_id','200',false);
    SELECT set_config('t2.c11_test_document_id','300',false);
    SELECT set_config('t2.c11_test_reuploaded_document_id','301',false);
    SELECT set_config('t2.c11_test_null_hash_document_id','302',false);
    SELECT set_config('t2.c11_test_other_company_id','20',false);
  `);

  await db.exec(migration);
  await db.exec(acceptance);
  await db.exec(rollback);

  const postRollback = await db.query(`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='t2_sklad_harakat'
          AND column_name LIKE 'c11_%') AS c11_columns_left,
      (SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='t2_sklad_harakat'
          AND column_name='obyekt_id') AS object_id_nullable,
      to_regclass('public.t2_sklad_ombor_qoldiq_v1') IS NULL AS view_removed,
      to_regprocedure('public.t2_sklad_c11_append_only_guard_v1()') IS NULL AS guard_removed
  `);
  const result = postRollback.rows[0];
  if (Number(result.c11_columns_left) !== 0 || result.object_id_nullable !== 'NO'
      || !result.view_removed || !result.guard_removed) {
    throw new Error(`rollback postconditions failed: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({
    status: 'PASS_SYNTHETIC_SQL_ONLY',
    migration: 'executed',
    acceptance: 'executed_with_assertions',
    rollback: 'executed_and_postconditions_verified',
    auth: 'explicit_mock_guards_not_production_parity',
    concurrency: 'not_proven_single_connection',
    postRollback: result
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: 'FAIL_SYNTHETIC_SQL',
    name: error?.name,
    message: error?.message,
    code: error?.code,
    detail: error?.detail,
    hint: error?.hint,
    where: error?.where,
    stack: error?.stack
  }, null, 2));
  process.exitCode = 1;
} finally {
  await db.close();
}
