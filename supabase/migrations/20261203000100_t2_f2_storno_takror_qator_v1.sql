-- T2 F2 STORNO TAKROR QATOR v1 (egasi 2026-11-05, pereraschet: «eski F2 minus tepada, o'sha qatorlar yangi plyus pastda»).
--
-- MUAMMO: t2_akt_yarat_v2 va t2_f2_qoralama_yangila_v1 bir hujjatda bir qator_id ni ikki marta mutlaqo rad etadi
-- (DUPLICATE_F2_SOURCE_LINE), keyingi UPDATE esa certified_* ni qator_id bo'yicha moslaydi (takrorda qiymatlar aralashadi).
-- Pereraschetda bir smeta qatori storno blokida (minus) VA yangi blokda (plyus) bo'lishi qonuniy.
--
-- QOIDA:
--   1) Bir qator_id hujjatda ko'pi bilan IKKI marta: aynan bitta storno qatori + bitta oddiy qator. Boshqa har qanday takror —
--      DUPLICATE_F2_SOURCE_LINE (avvalgidek). Storno qatori = raw_snapshot->>'source' = 'storno' (frontend STORNO_MANBA) yoki
--      manba_akt_qator_id berilgan.
--   2) Storno manbai: har storno qatorining manba akti (raw_snapshot->>'stornoOf' yoki manba_akt_qator_id -> akt) shu obyekt
--      va kompaniyaga tegishli, tur='f2', holat='tasdiqlangan' (lifecycle null/approved) bo'lishi shart; aks holda
--      STORNO_SOURCE_NOT_APPROVED (qoralama/bekor F2 ni «stornolash» yo'q).
--   3) certified_* yozish qator_id bo'yicha EMAS: kirish elementi va yozilgan qator (qator_id ichida) bir xil kalit
--      (hajm, narx, izoh, tartib) bo'yicha juftlanadi — ikki nusxa o'z qiymatini saqlaydi. Kalitlari bir xil nusxalar
--      insert paytida farqsiz, shuning uchun juftlash bijeksiyasi natijani o'zgartirmaydi.
-- Qolgan hamma tekshiruv, idempotentlik, audit va javob shakli AYNAN saqlanadi: o'zgartirish joriy (prod) ta'rifga
-- pg_get_functiondef + replace() bilan, langar aynan 1 marta topilmasa EXCEPTION (jim o'tmaydi).
-- Rollback uchun joriy ta'riflar *_pre_20261203000100 nusxalarida AYNAN saqlanadi (faqat service_role/postgres).
--
-- Quyi o'quvchilar (bir (akt_id, qator_id) — bir qator deb FARAZ QILMAYDI, tekshirildi):
--   t2_qator_holat.f2_hajm / f2_summa_malum — ishorali SUM; t2_zamena_qoplash — SUM; t2_akt_yarat (ichki insert) —
--   har kirish elementiga bitta qator; t2_akt_lifecycle_transition_v1 / projection guard — faqat sarlavha;
--   t2_akt_qator_versiya_guard — qator bo'yicha; t2_akt_podval_yoz_v1 — akt/blok darajasida. Unikal indeks faqat
--   (akt_id, manba_akt_qator_id) WHERE NOT NULL. Frontend F2 tarix Excel yuklagichi shu PR da tuzatildi
--   (storno nusxasi qator_id bo'yicha emas, bittadan chiqariladi).
begin;

-- 0) Yordamchilar.
create or replace function public._t2_f2_storno_qatormi(x jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $fn$
  select coalesce(x->'raw_snapshot'->>'source', '') = 'storno' or nullif(x->>'manba_akt_qator_id', '') is not null
$fn$;

create or replace function public._t2_f2_takror_xato(p_qatorlar jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from jsonb_array_elements(p_qatorlar) x
    group by x->>'qator_id'
    having count(*) > 2
        or count(*) filter (where public._t2_f2_storno_qatormi(x)) > 1
        or count(*) filter (where not public._t2_f2_storno_qatormi(x)) > 1)
$fn$;

-- Storno qatorlari manbasi tasdiqlangan F2 emas bo'lsa — o'sha qator_id lar (bo'lmasa NULL).
create or replace function public._t2_f2_storno_manba_xato(p_qatorlar jsonb, p_obyekt_id bigint, p_kompaniya_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  select jsonb_agg(s.qid order by s.n)
    from (
      select x->>'qator_id' as qid, e.n,
             coalesce(
               case when coalesce(x->'raw_snapshot'->>'stornoOf', '') ~ '^[1-9][0-9]{0,17}$' then (x->'raw_snapshot'->>'stornoOf')::bigint end,
               (select aq.akt_id from public.t2_akt_qator aq
                 where coalesce(x->>'manba_akt_qator_id', '') ~ '^[1-9][0-9]{0,17}$' and aq.id = (x->>'manba_akt_qator_id')::bigint)) as manba
        from jsonb_array_elements(p_qatorlar) with ordinality e(x, n)
       where public._t2_f2_storno_qatormi(x)) s
   where not exists (
     select 1 from public.t2_akt a
      where a.id = s.manba and a.obyekt_id = p_obyekt_id and coalesce(a.kompaniya_id, p_kompaniya_id) = p_kompaniya_id
        and a.tur = 'f2' and a.holat = 'tasdiqlangan' and coalesce(a.lifecycle_status, 'approved') = 'approved')
$fn$;

revoke all on function public._t2_f2_storno_qatormi(jsonb) from public, anon, authenticated;
revoke all on function public._t2_f2_takror_xato(jsonb) from public, anon, authenticated;
revoke all on function public._t2_f2_storno_manba_xato(jsonb, bigint, bigint) from public, anon, authenticated;
grant execute on function public._t2_f2_storno_qatormi(jsonb) to service_role;
grant execute on function public._t2_f2_takror_xato(jsonb) to service_role;
grant execute on function public._t2_f2_storno_manba_xato(jsonb, bigint, bigint) to service_role;

-- 1) Joriy ta'riflarning aynan nusxasi (rollback manbai).
do $do$
declare f text; sig text; d text;
begin
  foreach sig in array array['t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)',
                             't2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)'] loop
    f := split_part(sig, '(', 1);
    if to_regprocedure(format('public.%s_pre_20261203000100(%s', f, split_part(sig, '(', 2))) is not null then
      raise exception 'STORNO_TAKROR: % zaxira nusxasi allaqachon bor (migratsiya qo''llangan)', f;
    end if;
    d := pg_get_functiondef(format('public.%s', sig)::regprocedure);
    execute replace(d, format('FUNCTION public.%s(', f), format('FUNCTION public.%s_pre_20261203000100(', f));
    execute format('revoke all on function public.%s_pre_20261203000100(%s from public, anon, authenticated', f, split_part(sig, '(', 2));
    execute format('comment on function public.%s_pre_20261203000100(%s is %L', f, split_part(sig, '(', 2),
      'versiya: texnik — 20261203000100 rollback zaxirasi (prod ta''rifi aynan); chaqirilmaydi.');
  end loop;
end $do$;

-- 2) O'zgartirish (langarlar).
do $do$
declare d text; n text;
  -- Juftlash: kirish elementi <-> yozilgan qator, qator_id ichida bir xil kalit tartibi (hajm, narx, izoh) bilan.
  juft_x constant text := $j$(select e.x, (e.x->>'qator_id')::bigint as qid,
          row_number() over (partition by (e.x->>'qator_id')::bigint
            order by (e.x->>'certified_quantity')::numeric,
                     case when coalesce((e.x->>'price_intentionally_absent')::boolean, false) then null else (e.x->>'certified_unit_price')::numeric end nulls last,
                     nullif(btrim(coalesce(e.x->>'izoh', '')), '') nulls last, e.n) as rn
        from jsonb_array_elements(p_qatorlar) with ordinality e(x, n)) xx
  join (select r.id, r.qator_id, row_number() over (partition by r.qator_id order by r.hajm, r.narx nulls last, r.izoh nulls last, r.id) as rn
          from public.t2_akt_qator r where r.akt_id = %s) ar on ar.qator_id = xx.qid and ar.rn = xx.rn$j$;
  a_dup text; a_upd text; y_dup text; y_upd text;
begin
  -- 2a) t2_akt_yarat_v2
  d := replace(pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('_t2_f2_takror_xato' in d) > 0 then raise exception 'STORNO_TAKROR: t2_akt_yarat_v2 allaqachon yangilangan'; end if;
  a_dup := E'  if exists (\n    select 1 from jsonb_array_elements(p_qatorlar) x\n    group by x->>''qator_id'' having count(*) > 1\n  ) then\n    return jsonb_build_object(''ok'', false, ''code'', ''DUPLICATE_F2_SOURCE_LINE'');\n  end if;';
  a_upd := E'  from jsonb_array_elements(p_qatorlar) x\n  where aq.akt_id = v_akt_id and aq.qator_id = (x->>''qator_id'')::bigint;';
  if (length(d) - length(replace(d, a_dup, ''))) / length(a_dup) <> 1 then raise exception 'STORNO_TAKROR: t2_akt_yarat_v2 takror langari aynan 1 marta topilmadi'; end if;
  if (length(d) - length(replace(d, a_upd, ''))) / length(a_upd) <> 1 then raise exception 'STORNO_TAKROR: t2_akt_yarat_v2 UPDATE langari aynan 1 marta topilmadi'; end if;
  n := replace(d, a_dup,
    E'  -- 20261203000100: bitta qator_id — ko''pi bilan bitta storno + bitta oddiy qator; boshqa takror rad.\n'
    || E'  if public._t2_f2_takror_xato(p_qatorlar) then\n    return jsonb_build_object(''ok'', false, ''code'', ''DUPLICATE_F2_SOURCE_LINE'');\n  end if;\n'
    || E'  -- 20261203000100: storno manbai faqat shu obyektning tasdiqlangan F2 si.\n'
    || E'  if public._t2_f2_storno_manba_xato(p_qatorlar, p_obyekt_id, v_komp) is not null then\n'
    || E'    return jsonb_build_object(''ok'', false, ''code'', ''STORNO_SOURCE_NOT_APPROVED'',\n'
    || E'      ''xabar'', ''Storno faqat shu obyektning tasdiqlangan F2 sidan qilinadi.'', ''qatorlar'', public._t2_f2_storno_manba_xato(p_qatorlar, p_obyekt_id, v_komp));\n  end if;');
  n := replace(n, a_upd, E'  -- 20261203000100: qator_id bo''yicha emas — element va qator juftlanadi (ikki nusxa o''z qiymatini saqlaydi).\n  from '
    || format(juft_x, 'v_akt_id') || E'\n  where aq.id = ar.id;');
  execute n;

  -- 2b) t2_f2_qoralama_yangila_v1
  d := replace(pg_get_functiondef('public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('_t2_f2_takror_xato' in d) > 0 then raise exception 'STORNO_TAKROR: t2_f2_qoralama_yangila_v1 allaqachon yangilangan'; end if;
  y_dup := E'  if exists (select 1 from jsonb_array_elements(p_qatorlar) x group by x->>''qator_id'' having count(*) > 1) then\n    return jsonb_build_object(''ok'', false, ''code'', ''DUPLICATE_F2_SOURCE_LINE'');\n  end if;';
  y_upd := E'  from jsonb_array_elements(p_qatorlar) x\n  where aq.akt_id = p_akt_id and aq.qator_id = (x->>''qator_id'')::bigint;';
  if (length(d) - length(replace(d, y_dup, ''))) / length(y_dup) <> 1 then raise exception 'STORNO_TAKROR: t2_f2_qoralama_yangila_v1 takror langari aynan 1 marta topilmadi'; end if;
  if (length(d) - length(replace(d, y_upd, ''))) / length(y_upd) <> 1 then raise exception 'STORNO_TAKROR: t2_f2_qoralama_yangila_v1 UPDATE langari aynan 1 marta topilmadi'; end if;
  n := replace(d, y_dup,
    E'  -- 20261203000100: bitta qator_id — ko''pi bilan bitta storno + bitta oddiy qator; boshqa takror rad.\n'
    || E'  if public._t2_f2_takror_xato(p_qatorlar) then\n    return jsonb_build_object(''ok'', false, ''code'', ''DUPLICATE_F2_SOURCE_LINE'');\n  end if;\n'
    || E'  -- 20261203000100: storno manbai faqat shu obyektning tasdiqlangan F2 si.\n'
    || E'  if public._t2_f2_storno_manba_xato(p_qatorlar, v_akt.obyekt_id, p_kompaniya_id) is not null then\n'
    || E'    return jsonb_build_object(''ok'', false, ''code'', ''STORNO_SOURCE_NOT_APPROVED'',\n'
    || E'      ''xabar'', ''Storno faqat shu obyektning tasdiqlangan F2 sidan qilinadi.'', ''qatorlar'', public._t2_f2_storno_manba_xato(p_qatorlar, v_akt.obyekt_id, p_kompaniya_id));\n  end if;');
  n := replace(n, y_upd, E'  -- 20261203000100: qator_id bo''yicha emas — element va qator juftlanadi (ikki nusxa o''z qiymatini saqlaydi).\n  from '
    || format(juft_x, 'p_akt_id') || E'\n  where aq.id = ar.id;');
  execute n;
end $do$;

commit;
