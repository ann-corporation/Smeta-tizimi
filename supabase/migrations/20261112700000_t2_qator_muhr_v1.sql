-- 20261112700000 — SMETA CONST: QATOR MUHRI (egasi 2026-10-27: «bir vergul qo'shilsa ham smetadan o'zgargan pozitsiya aniq
-- bo'lishi kerak»). Dizayn: docs/architecture/SMETA_CONST_KORREKTIROVKA.md §2.
--
-- AUDIT XULOSASI (dublikat yasamaslik):
--   * t2_smeta_revision seq 0 — obyekt bo'yicha bitta jsonb snapshot (kod/norma yo'q, 47 obyektda). O'ZGARMAYDI; muhr unga
--     revision_id bilan havola qiladi va backfill manbai bo'ladi.
--   * t2_ozgarish — jurnal (import/markirovka/narxlash/rollup yozilmaydi; kod/norma/tur/ota umuman yozilmaydi) — isbot emas.
--     View uni muhr bilan bog'laydi («jurnalsiz o'zgarish» belgisi).
--   * t2_qator ga ustun qo'shilmaydi: muhr qatorning o'zi bilan bitta UPDATE da o'zgarib ketishi mumkin bo'lardi.
--   ⇒ yangi INSERT-ONLY jadval t2_qator_muhr + o'qish view t2_qator_muhr_farq. t2_qator ga yozish RAD ETILMAYDI
--     (egasi cheklov xohlamaydi) — farq faqat ko'rinadi.
--
-- QOIDALAR: NULL ≠ 0 (kanonik shaklda NULL '∅'); registr va tinish belgilari saqlanadi; pul to'qilmaydi (summa muhrga
-- kirmaydi — hosila). O'qish: shlyuz /api/sb (kompaniya siyosati). anon/authenticated kirishi yo'q.
-- TEZLIK: search_path o'rnatilgan funksiya har chaqiriqda ~60 mks — shuning uchun qatorga BITTA chaqiriq (t2_qator_muhr_hisob),
-- view esa faqat xom qiymati muhrdan farq qilgan qatorlar uchun chaqiradi. Backfill ≈ 315 ming chaqiriq (~40-60 s, prod o'lchovi:
-- 14 244 qator / 1,4 s); faqat yangi jadvalga yozadi, mavjud jadvallarni qulflamaydi (t2_ozgarish indeksi — eng oxirida).
begin;

-- ───────────────────────────── 1. Kanonik shakl ─────────────────────────────
-- Matn: NBSP/tab/qator ko'chishi → probel, ketma-ket probellar → bitta, chetlari olinadi; bo'sh → NULL. Registr, vergul,
-- nuqta, qavs, ё/е — SAQLANADI («bir vergul ham» o'zgarish). Son: trim_scale (2.4210 = 2.421). NULL — '∅' (0 dan farqli).
-- Kanonik matn: v1 ␟ =tur ␟ =kod ␟ =nom ␟ =birlik ␟ =kat ␟ =ota_id ␟ =hajm ␟ =narx ␟ =norma (␟ = chr(31)).
-- Natija: {muhr (sha256 hex), tur, kod, nom, birlik, kat} — normallashtirilgan matnlar bilan.
create or replace function public.t2_qator_muhr_hisob(
  p_tur text, p_kod text, p_nom text, p_birlik text, p_kat text, p_ota_id bigint, p_hajm numeric, p_narx numeric, p_norma numeric)
returns text[] language sql immutable parallel safe set search_path = pg_catalog, pg_temp as $$
  select array[encode(sha256(convert_to(concat_ws(chr(31), 'v1',
                 coalesce('=' || n.tur, '∅'), coalesce('=' || n.kod, '∅'), coalesce('=' || n.nom, '∅'),
                 coalesce('=' || n.birlik, '∅'), coalesce('=' || n.kat, '∅'), coalesce('=' || p_ota_id::text, '∅'),
                 coalesce('=' || trim_scale(p_hajm)::text, '∅'), coalesce('=' || trim_scale(p_narx)::text, '∅'),
                 coalesce('=' || trim_scale(p_norma)::text, '∅')), 'UTF8')), 'hex'),
               n.tur, n.kod, n.nom, n.birlik, n.kat]
    from (select
      nullif(btrim(regexp_replace(translate(p_tur,    chr(160) || chr(8239) || chr(9) || chr(10) || chr(13), '     '), ' {2,}', ' ', 'g')), '') as tur,
      nullif(btrim(regexp_replace(translate(p_kod,    chr(160) || chr(8239) || chr(9) || chr(10) || chr(13), '     '), ' {2,}', ' ', 'g')), '') as kod,
      nullif(btrim(regexp_replace(translate(p_nom,    chr(160) || chr(8239) || chr(9) || chr(10) || chr(13), '     '), ' {2,}', ' ', 'g')), '') as nom,
      nullif(btrim(regexp_replace(translate(p_birlik, chr(160) || chr(8239) || chr(9) || chr(10) || chr(13), '     '), ' {2,}', ' ', 'g')), '') as birlik,
      nullif(btrim(regexp_replace(translate(p_kat,    chr(160) || chr(8239) || chr(9) || chr(10) || chr(13), '     '), ' {2,}', ' ', 'g')), '') as kat
    ) n
$$;
comment on function public.t2_qator_muhr_hisob(text, text, text, text, text, bigint, numeric, numeric, numeric) is
  'SMETA CONST: qator muhri v1 — {sha256 hex, tur, kod, nom, birlik, kat} (normallashtirilgan). Registr va tinish belgilari saqlanadi; NULL ≠ 0.';

-- ───────────────────────────── 2. Muhr jadvali (insert-only) ─────────────────────────────
create table if not exists public.t2_qator_muhr (
  id              bigint generated always as identity primary key,
  kompaniya_id    bigint not null,
  obyekt_id       bigint not null,          -- FK yo'q: obyekt o'chirish oqimlari bloklanmasin; muhr tarix sifatida qoladi
  qator_id        bigint not null,          -- FK yo'q: qator o'chirilsa — view «o'chirilgan» deb ko'rsatadi
  bosqich         integer not null default 0 check (bosqich >= 0),   -- 0 = asl; N = korrektirovka revision seq (B)
  revision_id     bigint,                   -- t2_smeta_revision (FK yo'q: migratsiya revision jadvalini qulflamasin)
  manba           text not null check (manba in ('import','backfill_revision','backfill_joriy','korrektirovka','qolda')),
  aslda_yoq       boolean not null default false,   -- bazaviy (seq 0) holatda bo'lmagan, keyin qo'shilgan qator
  ekspertizagacha boolean not null default false,   -- «(ekspertizagacha)» bo'lim ostida (frontend ESKI_SMETA bilan bir xil regex)
  tekshirilmagan  text[] not null default '{}',     -- asl qiymati noma'lum maydonlar (backfill: snapshotda kod/norma yo'q)
  tur             text,
  kod             text,
  nom             text,
  birlik          text,
  kat             text,
  ota_id          bigint,
  hajm            numeric,
  narx            numeric,
  norma           numeric,
  muhr            text not null check (muhr ~ '^[0-9a-f]{64}$'),
  asos_vaqt       timestamptz not null,             -- qiymatlar qaysi paytdagi holat
  actor_id        bigint,
  yaratildi       timestamptz not null default now(),
  yopildi         timestamptz,
  yopilish_sabab  text,
  unique (qator_id, bosqich),
  constraint t2_qator_muhr_yopish check ((yopildi is null) = (yopilish_sabab is null))
);
create index if not exists t2_qator_muhr_obyekt_ix on public.t2_qator_muhr (obyekt_id, qator_id) where yopildi is null;
create index if not exists t2_qator_muhr_kompaniya_ix on public.t2_qator_muhr (kompaniya_id, obyekt_id);
comment on table public.t2_qator_muhr is
  'SMETA CONST: har smeta qatorining kanonik muhri (normallashtirilgan tur/kod/nom/birlik/kat/ota/hajm/narx/norma + SHA-256). INSERT-ONLY: UPDATE/DELETE rad etiladi (faqat bir marta yopish). Farq: view t2_qator_muhr_farq.';

-- Const qo'riqchisi: o'chirish yo'q; yangilash — faqat ochiq muhrni bir marta yopish.
create or replace function public.t2_qator_muhr_const_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''chirilmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  if old.yopildi is not null
     or (to_jsonb(new) - 'yopildi' - 'yopilish_sabab') is distinct from (to_jsonb(old) - 'yopildi' - 'yopilish_sabab') then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''zgarmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists t2_qator_muhr_const on public.t2_qator_muhr;
create trigger t2_qator_muhr_const before update or delete on public.t2_qator_muhr
  for each row execute function public.t2_qator_muhr_const_trg();

alter table public.t2_qator_muhr enable row level security;
revoke all on public.t2_qator_muhr from public, anon, authenticated;

-- ───────────────────────────── 3. Muhr olish (import va qo'lda) ─────────────────────────────
-- Idempotent: faqat muhri yo'q qatorlar muhrlanadi. 'import' da bazada endi yo'q qatorlarning ochiq asl muhrlari yopiladi.
create or replace function public.t2_qator_muhr_ol_v1(p_obyekt_id bigint, p_manba text, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_komp bigint; v_rev bigint; v_yopildi int := 0; v_yangi int := 0;
begin
  if p_manba is null or p_manba not in ('import','qolda') then return jsonb_build_object('ok', false, 'code', 'MANBA_INVALID'); end if;
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_TOPILMADI'); end if;

  if p_manba = 'import' then
    update public.t2_qator_muhr m set yopildi = now(), yopilish_sabab = 'qayta import: qator bazada yo''q'
     where m.obyekt_id = p_obyekt_id and m.yopildi is null and m.bosqich = 0
       and not exists (select 1 from public.t2_qator q where q.id = m.qator_id);
    get diagnostics v_yopildi = row_count;
  end if;

  select id into v_rev from public.t2_smeta_revision where obyekt_id = p_obyekt_id order by seq desc limit 1;

  with recursive e as (   -- «(ekspertizagacha)» nomli qatorlar va ularning butun shoxi
    select q.id, 0 as chuqur from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and (q.nom ilike '%kspertiz%' or q.nom ilike '%экспертиз%')
       and q.nom ~* 'ekspertiza\s*(gacha|dan\s*oldin)|до\s+экспертиз'
    union all
    select q.id, e.chuqur + 1 from public.t2_qator q join e on q.ota_id = e.id where e.chuqur < 64
  ), ins as (
    insert into public.t2_qator_muhr (kompaniya_id, obyekt_id, qator_id, bosqich, revision_id, manba, aslda_yoq, ekspertizagacha,
                                      tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma, muhr, asos_vaqt, actor_id)
    select z.kompaniya_id, z.obyekt_id, z.id, 0, v_rev, p_manba, false, ee.id is not null,
           z.h[2], z.h[3], z.h[4], z.h[5], z.h[6], z.ota_id, trim_scale(z.hajm), trim_scale(z.narx), trim_scale(z.norma), z.h[1], now(), p_actor_id
      from (select q.*, public.t2_qator_muhr_hisob(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) as h
              from public.t2_qator q
             where q.obyekt_id = p_obyekt_id
               and not exists (select 1 from public.t2_qator_muhr m where m.qator_id = q.id and m.bosqich = 0)) z
      left join (select distinct id from e) ee on ee.id = z.id
    on conflict (qator_id, bosqich) do nothing
    returning 1)
  select count(*) into v_yangi from ins;

  if v_yangi > 0 or v_yopildi > 0 then
    perform public.t2_audit_yoz(v_komp, 'qator_muhr', 'smeta', p_obyekt_id,
      format('manba=%s; muhrlandi=%s; yopildi=%s; revision=%s', p_manba, v_yangi, v_yopildi, v_rev), 'actor:' || coalesce(p_actor_id::text, '?'), null);
  end if;
  return jsonb_build_object('ok', true, 'muhrlandi', v_yangi, 'yopildi', v_yopildi, 'revision_id', v_rev);
end $function$;

-- ───────────────────────────── 4. Import o'ramlari: muvaffaqiyatli importdan keyin muhr ─────────────────────────────
-- Ichki (unlocked) funksiyalar O'ZGARMAYDI. Muhr xatosi importni yiqitmaydi — javobda `muhr_xato`, qatorlar view'da «muhrsiz».
create or replace function public.t2_smeta_import_yakunla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
 returns jsonb language plpgsql security definer
 set search_path to 'public', 'pg_temp' set statement_timeout to '120s' as $function$
declare v_obyekt_id bigint; v_res jsonb;
begin
  select s.obyekt_id into v_obyekt_id from public.t2_smeta_import_sessiya s where s.id=p_sessiya_id and s.kompaniya_id=p_kompaniya_id;
  if v_obyekt_id is not null then perform public.t2_smeta_import_object_lock_v1(v_obyekt_id); end if;
  v_res := public.t2_smeta_import_yakunla_unlocked_v1(p_kompaniya_id,p_actor_id,p_sessiya_id);
  if v_obyekt_id is not null and coalesce(v_res->>'ok', '') = 'true' then
    begin
      v_res := v_res || jsonb_build_object('muhr', public.t2_qator_muhr_ol_v1(v_obyekt_id, 'import', p_actor_id));
    exception when others then
      raise warning 't2_smeta_import_yakunla_v1: qator muhri olinmadi (import saqlandi): %', sqlerrm;
      v_res := v_res || jsonb_build_object('muhr_xato', left(sqlerrm, 300));
    end;
  end if;
  return v_res;
end $function$;

create or replace function public.t2_smeta_paket_import_yakunla_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
 returns jsonb language plpgsql security definer
 set search_path to 'public', 'pg_temp' set statement_timeout to '120s' as $function$
declare v_obyekt_id bigint; v_res jsonb;
begin
  select s.obyekt_id into v_obyekt_id from public.t2_smeta_paket_import_sessiya s where s.id=p_sessiya_id and s.kompaniya_id=p_kompaniya_id;
  if v_obyekt_id is not null then perform public.t2_smeta_import_object_lock_v1(v_obyekt_id); end if;
  v_res := public.t2_smeta_paket_import_yakunla_unlocked_v1(p_kompaniya_id,p_actor_id,p_sessiya_id);
  if v_obyekt_id is not null and coalesce(v_res->>'ok', '') = 'true' then
    begin
      v_res := v_res || jsonb_build_object('muhr', public.t2_qator_muhr_ol_v1(v_obyekt_id, 'import', p_actor_id));
    exception when others then
      raise warning 't2_smeta_paket_import_yakunla_v1: qator muhri olinmadi (import saqlandi): %', sqlerrm;
      v_res := v_res || jsonb_build_object('muhr_xato', left(sqlerrm, 300));
    end;
  end if;
  return v_res;
end $function$;

-- ───────────────────────────── 5. Bir martalik backfill ─────────────────────────────
-- Ekspertizagacha belgisi: «(ekspertizagacha)» nomli qatorlar va ularning butun shoxi (joriy daraxt).
create temp table _muhr_eksp on commit drop as
with recursive e as (
  select q.id, 0 as chuqur from public.t2_qator q
   where (q.nom ilike '%kspertiz%' or q.nom ilike '%экспертиз%') and q.nom ~* 'ekspertiza\s*(gacha|dan\s*oldin)|до\s+экспертиз'
  union all
  select q.id, e.chuqur + 1 from public.t2_qator q join e on q.ota_id = e.id where e.chuqur < 64
)
select distinct id from e;
create unique index on _muhr_eksp (id);

-- (a) seq 0 snapshoti bor obyektlar: «avval» = snapshot qiymatlari (kod/norma snapshotda yo'q → joriydan, tekshirilmagan).
--     Snapshotda bor, bazada yo'q qator ham muhrlanadi (view: «o'chirilgan»).
insert into public.t2_qator_muhr (kompaniya_id, obyekt_id, qator_id, bosqich, revision_id, manba, aslda_yoq, ekspertizagacha, tekshirilmagan,
                                  tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma, muhr, asos_vaqt, actor_id)
select z.kompaniya_id, z.obyekt_id, z.qid, 0, z.rev_id, 'backfill_revision', false, exists (select 1 from _muhr_eksp x where x.id = z.qid),
       array['kod','norma'], z.h[2], z.h[3], z.h[4], z.h[5], z.h[6], z.ota_id, trim_scale(z.hajm), trim_scale(z.narx), trim_scale(z.norma),
       z.h[1], z.asos, z.actor_id
  from (select r.kompaniya_id, r.obyekt_id, r.id as rev_id, r.yaratildi as asos, r.actor_id, s.qid,
               nullif(s.e->>'ota_id', '')::bigint as ota_id, nullif(s.e->>'hajm', '')::numeric as hajm,
               nullif(s.e->>'narx', '')::numeric as narx, q.norma,
               public.t2_qator_muhr_hisob(s.e->>'tur', q.kod, s.e->>'nom', s.e->>'birlik', s.e->>'kat', nullif(s.e->>'ota_id', '')::bigint,
                                          nullif(s.e->>'hajm', '')::numeric, nullif(s.e->>'narx', '')::numeric, q.norma) as h
          from public.t2_smeta_revision r
          cross join lateral (select distinct on ((e->>'qator_id')::bigint) (e->>'qator_id')::bigint as qid, e
                                from jsonb_array_elements(case when jsonb_typeof(r.snapshot) = 'array' then r.snapshot else '[]'::jsonb end) e
                               where nullif(e->>'qator_id', '') is not null) s
          left join public.t2_qator q on q.id = s.qid
         where r.seq = 0) z
on conflict (qator_id, bosqich) do nothing;

-- (b) qolgan joriy qatorlar: muhr = hozirgi holat. Seq 0 bor obyektda — «asl smetadan keyin qo'shilgan» (aslda_yoq).
insert into public.t2_qator_muhr (kompaniya_id, obyekt_id, qator_id, bosqich, revision_id, manba, aslda_yoq, ekspertizagacha,
                                  tur, kod, nom, birlik, kat, ota_id, hajm, narx, norma, muhr, asos_vaqt, actor_id)
select z.kompaniya_id, z.obyekt_id, z.id, 0, z.rev_id, 'backfill_joriy', z.rev_id is not null, exists (select 1 from _muhr_eksp x where x.id = z.id),
       z.h[2], z.h[3], z.h[4], z.h[5], z.h[6], z.ota_id, trim_scale(z.hajm), trim_scale(z.narx), trim_scale(z.norma), z.h[1], now(), null
  from (select q.kompaniya_id, q.obyekt_id, q.id, q.ota_id, q.hajm, q.narx, q.norma, r0.id as rev_id,
               public.t2_qator_muhr_hisob(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) as h
          from public.t2_qator q
          left join public.t2_smeta_revision r0 on r0.obyekt_id = q.obyekt_id and r0.seq = 0
         where not exists (select 1 from public.t2_qator_muhr m where m.qator_id = q.id and m.bosqich = 0)) z
on conflict (qator_id, bosqich) do nothing;

-- ───────────────────────────── 6. «O'zgargan» read-model ─────────────────────────────
-- Faqat farqi borlar: ozgargan (muhrdan farq) | ochirilgan (muhr bor, qator yo'q) | qoshilgan (asl smetadan keyin qo'shilgan,
-- o'zgarmagan) | muhrsiz (muhri yo'q qator). avval/endi — faqat o'zgargan maydonlar. Jurnal: t2_ozgarish, asos_vaqt dan keyin.
-- Tezlik: xom qiymati saqlangan (normallashtirilgan) qiymatga teng qator — aniq o'zgarmagan; muhr faqat nomzodlar uchun hisoblanadi.
create or replace view public.t2_qator_muhr_farq with (security_invoker = true) as
with b as (
  select m.kompaniya_id, m.obyekt_id, m.qator_id,
         coalesce(q.tur, m.tur) as tur, coalesce(q.kod, m.kod) as kod, coalesce(q.nom, m.nom) as nom, coalesce(q.ota_id, m.ota_id) as ota_id,
         case when q.id is null then 'ochirilgan' when cardinality(f.maydonlar) > 0 then 'ozgargan' else 'qoshilgan' end as holat,
         f.maydonlar, f.avval, f.endi,
         (q.id is not null and f.maydonlar = array['narx'] and m.narx is null) as faqat_narx_qoyildi,
         m.aslda_yoq, m.ekspertizagacha, m.tekshirilmagan, m.manba as muhr_manba, m.asos_vaqt, m.bosqich, m.revision_id, m.muhr
    from public.t2_qator_muhr m
    left join public.t2_qator q on q.id = m.qator_id
    left join lateral (
      select public.t2_qator_muhr_hisob(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) as h
       where q.id is not null
         and (q.tur is distinct from m.tur or q.kod is distinct from m.kod or q.nom is distinct from m.nom
              or q.birlik is distinct from m.birlik or q.kat is distinct from m.kat or q.ota_id is distinct from m.ota_id
              or q.hajm is distinct from m.hajm or q.narx is distinct from m.narx or q.norma is distinct from m.norma)
    ) c on true
    cross join lateral (
      select coalesce(array_agg(x.maydon order by x.n), '{}'::text[]) as maydonlar,
             coalesce(jsonb_object_agg(x.maydon, x.avval), '{}'::jsonb) as avval,
             coalesce(jsonb_object_agg(x.maydon, x.endi), '{}'::jsonb) as endi
        from (values
          (1, 'tur',    to_jsonb(m.tur),    to_jsonb(c.h[2])),
          (2, 'kod',    to_jsonb(m.kod),    to_jsonb(c.h[3])),
          (3, 'nom',    to_jsonb(m.nom),    to_jsonb(c.h[4])),
          (4, 'birlik', to_jsonb(m.birlik), to_jsonb(c.h[5])),
          (5, 'kat',    to_jsonb(m.kat),    to_jsonb(c.h[6])),
          (6, 'ota_id', to_jsonb(m.ota_id), to_jsonb(q.ota_id)),
          (7, 'hajm',   to_jsonb(m.hajm),   to_jsonb(trim_scale(q.hajm))),
          (8, 'narx',   to_jsonb(m.narx),   to_jsonb(trim_scale(q.narx))),
          (9, 'norma',  to_jsonb(m.norma),  to_jsonb(trim_scale(q.norma)))
        ) x(n, maydon, avval, endi)
       where c.h is not null and x.avval is distinct from x.endi
    ) f
   where m.yopildi is null
     and not exists (select 1 from public.t2_qator_muhr m2 where m2.qator_id = m.qator_id and m2.bosqich > m.bosqich and m2.yopildi is null)
     and (q.id is null or cardinality(f.maydonlar) > 0 or m.aslda_yoq)
  union all
  select q.kompaniya_id, q.obyekt_id, q.id, q.tur, q.kod, q.nom, q.ota_id, 'muhrsiz', '{}'::text[], '{}'::jsonb, '{}'::jsonb,
         false, null::boolean, null::boolean, '{}'::text[], null::text, null::timestamptz, null::integer, null::bigint, null::text
    from public.t2_qator q
   where not exists (select 1 from public.t2_qator_muhr m where m.qator_id = q.id and m.yopildi is null)
)
select b.*, j.jurnal_soni, j.oxirgi_tahrir, j.oxirgi_kim, j.oxirgi_manba
  from b
  left join lateral (
    select count(*)::int as jurnal_soni, max(z.vaqt) as oxirgi_tahrir,
           (array_agg(z.kim order by z.vaqt desc))[1] as oxirgi_kim, (array_agg(z.manba order by z.vaqt desc))[1] as oxirgi_manba
      from public.t2_ozgarish z
     where z.qator_id = b.qator_id and z.jadval = 't2_qator' and (b.asos_vaqt is null or z.vaqt >= b.asos_vaqt)
  ) j on true;
comment on view public.t2_qator_muhr_farq is
  'SMETA CONST: muhrdan farq qilgan qatorlar (ozgargan / ochirilgan / qoshilgan / muhrsiz), avval/endi faqat o''zgargan maydonlar, t2_ozgarish jurnali bilan. jurnal_soni = 0 va holat = ozgargan — jurnalsiz o''zgarish (import/markirovka yo''li).';
revoke all on public.t2_qator_muhr_farq from public, anon, authenticated;

revoke all on function public.t2_qator_muhr_hisob(text, text, text, text, text, bigint, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.t2_qator_muhr_ol_v1(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.t2_qator_muhr_const_trg() from public, anon, authenticated;
grant execute on function public.t2_qator_muhr_hisob(text, text, text, text, text, bigint, numeric, numeric, numeric) to service_role;
grant execute on function public.t2_qator_muhr_ol_v1(bigint, text, bigint) to service_role;
grant select on public.t2_qator_muhr, public.t2_qator_muhr_farq to service_role;

-- Jurnal bog'lanishi uchun (t2_ozgarish da qator_id indeksi yo'q edi). OXIRIDA: t2_ozgarish ga yozish (har t2_qator tahriri)
-- faqat indeks qurilishi davomida kutadi, butun backfill davomida emas.
create index if not exists t2_ozgarish_qator_vaqt_ix on public.t2_ozgarish (qator_id, vaqt desc) where qator_id is not null;

commit;
