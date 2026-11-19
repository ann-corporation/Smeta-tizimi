-- 20270118000001_t2_hujjat_paket_nomzod_v1
-- Hujjatlar paketi (universal): paketga kirishi mumkin bo'lgan hujjatlar ro'yxati - Disk (t2_hm_fayl) + akt/forma3 reestri BIR joydan.
-- Sayt (F2 reestri > Hujjatlar paketi), Telegram bot, MCP (hujjat_paket) va Jarvis shu bitta RPC ni o'qiydi.
--  * F-2: bekor emas, lifecycle cancelled/superseded emas, TAXMINIY (prorab tasdig'i) emas (PR #670 qoidasi: _t2_f2_taxminiy_v1).
--    Bir obyekt+oyda >1 F-2 bo'lsa ularga takror=true belgilanadi (paket quruvchi ularni rad etadi).
--  * F-3: bekor emas; tayyor/imzolangan = tasdiqlangan, qoralama = qoralama.
--  * Oylik/obyekt hujjatlari (nakopitelniy, m29, slichitelniy, ostatka, aosr): Diskda bor bo'lsa - fayl bilan; tasdiqlangan F-2 oylari uchun
--    Diskda YO'Q nakopitelniy/m29 va obyekt uchun slichitelniy/ostatka - yasash=true (paket yasalganda yasaladi va Diskka yoziladi).
--  * Har qator: loyiha > shartnoma > obyekt > oy > tur, Disk fayli (fayl_id, versiya, bayt) yoki null.
-- Faqat o'qiydi (stable). Faqat service_role. Pul summalari qaytarilmaydi (token bahosi uchun qator soni).
-- Applied: YO'Q (L0 qo'llaydi: avval ROLLBACK sinov). versiya: texnik (t2_qator o'qilmaydi).

create or replace function public.t2_hujjat_paket_nomzod_v1(p_actor bigint, p_kompaniya bigint, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_f jsonb := coalesce(p_filtr, '{}'::jsonb);
  v_lo bigint[] := case when jsonb_typeof(v_f->'loyiha_ids') = 'array' then array(select jsonb_array_elements_text(v_f->'loyiha_ids')::bigint) else '{}'::bigint[] end;
  v_sh bigint[] := case when jsonb_typeof(v_f->'shartnoma_ids') = 'array' then array(select jsonb_array_elements_text(v_f->'shartnoma_ids')::bigint) else '{}'::bigint[] end;
  v_ob bigint[] := case when jsonb_typeof(v_f->'obyekt_ids') = 'array' then array(select jsonb_array_elements_text(v_f->'obyekt_ids')::bigint) else '{}'::bigint[] end;
  v_tur text[] := case when jsonb_typeof(v_f->'turlar') = 'array' then array(select lower(jsonb_array_elements_text(v_f->'turlar'))) else '{}'::text[] end;
  v_hol text[] := case when jsonb_typeof(v_f->'holatlar') = 'array' then array(select lower(jsonb_array_elements_text(v_f->'holatlar'))) else '{}'::text[] end;
  v_dan text := nullif(v_f->>'oy_dan', '');
  v_gacha text := nullif(v_f->>'oy_gacha', '');
  v_lim integer := least(greatest(coalesce((v_f->>'limit')::integer, 1500), 1), 3000);
  v_res jsonb; v_jami integer;
begin
  if p_kompaniya is null or public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if (v_dan is not null and v_dan !~ '^\d{4}-\d{2}$') or (v_gacha is not null and v_gacha !~ '^\d{4}-\d{2}$') then return jsonb_build_object('ok', false, 'code', 'OY_NOTOGRI'); end if;

  with ob as (
    select o.id as obyekt_id, o.nom as obyekt_nom, o.loyiha_id, l.nom as loyiha_nom, public._t2_disk_shartnoma_v1(p_kompaniya, o.id) as shartnoma_id
      from public.t2_obyekt o left join public.t2_loyiha l on l.id = o.loyiha_id and l.kompaniya_id = p_kompaniya
     where o.kompaniya_id = p_kompaniya
       and (cardinality(v_lo) = 0 or o.loyiha_id = any(v_lo))
       and (cardinality(v_ob) = 0 or o.id = any(v_ob))
  ), ob2 as (
    select b.*, s.raqam as shartnoma_raqam from ob b left join public.t2_shartnoma s on s.id = b.shartnoma_id and s.kompaniya_id = p_kompaniya
     where cardinality(v_sh) = 0 or b.shartnoma_id = any(v_sh)
  ), akt as (
    select a.id, a.obyekt_id, a.raqam, a.holat, to_char(a.oy, 'YYYY-MM') as oy, a.oy as oy_sana,
           public._t2_f2_taxminiy_v1(a.raqam, a.izoh) as taxminiy
      from public.t2_akt a join ob2 on ob2.obyekt_id = a.obyekt_id
     where a.tur = 'f2' and a.holat <> 'bekor' and coalesce(a.lifecycle_status, '') not in ('cancelled', 'superseded') and a.oy is not null
  ), f2 as (
    select 'f2'::text as tur, 'f2:' || a.id as kalit, 'F-2 ' || chr(8470) || coalesce(nullif(a.raqam, ''), a.id::text) as sarlavha,
           case when a.holat = 'tasdiqlangan' then 'tasdiqlangan' else 'qoralama' end as holat,
           ob2.loyiha_id, ob2.loyiha_nom, ob2.shartnoma_id, ob2.shartnoma_raqam, ob2.obyekt_id, ob2.obyekt_nom, a.oy,
           a.id as akt_id, null::bigint as forma3_id, a.taxminiy,
           jsonb_array_length(public._t2_f2_oy_takror_v1(array[a.obyekt_id], date_trunc('month', a.oy_sana)::date, array[a.id])) > 0 as takror,
           (select count(*) from public.t2_akt_qator q where q.akt_id = a.id)::integer as qator_soni
      from akt a join ob2 on ob2.obyekt_id = a.obyekt_id
  ), f3 as (
    select 'forma3'::text, 'f3:' || f.id, 'F-3 ' || chr(8470) || coalesce(nullif(f.raqam, ''), f.id::text),
           case when f.holat in ('tayyor', 'imzolangan') then 'tasdiqlangan' else 'qoralama' end,
           coalesce(f.loyiha_id, ob2.loyiha_id), coalesce(lo.nom, ob2.loyiha_nom), f.shartnoma_id, s.raqam, f.obyekt_id, ob2.obyekt_nom, to_char(f.davr_oxiri, 'YYYY-MM'),
           null::bigint, f.id, false, false, null::integer
      from public.t2_forma3 f
      left join ob2 on ob2.obyekt_id = f.obyekt_id
      left join public.t2_shartnoma s on s.id = f.shartnoma_id and s.kompaniya_id = p_kompaniya
      left join public.t2_loyiha lo on lo.id = f.loyiha_id and lo.kompaniya_id = p_kompaniya
     where f.kompaniya_id = p_kompaniya and f.holat <> 'bekor'
       and (cardinality(v_ob) = 0 or f.obyekt_id = any(v_ob))
       and (cardinality(v_lo) = 0 or coalesce(f.loyiha_id, ob2.loyiha_id) = any(v_lo))
       and (cardinality(v_sh) = 0 or f.shartnoma_id = any(v_sh))
  ), disk_oylik as (
    select split_part(h.hujjat_kalit, ':', 1) as tur, h.hujjat_kalit as kalit, h.id as fayl_id
      from public.t2_hm_fayl h
     where h.kompaniya_id = p_kompaniya and h.savatda is null
       and h.manba_turi in ('nakopitelniy', 'm29', 'slichitelniy', 'ostatka', 'aosr')
       and h.hujjat_kalit ~ '^(nakopitelniy|m29|slichitelniy|ostatka|aosr):\d+:(\d{4}-\d{2}|-)$'
  ), oylik_disk as (
    select d.tur, d.kalit, o.obyekt_id, o.obyekt_nom, o.loyiha_id, o.loyiha_nom, o.shartnoma_id, o.shartnoma_raqam,
           nullif(split_part(d.kalit, ':', 3), '-') as oy
      from disk_oylik d join ob2 o on o.obyekt_id = split_part(d.kalit, ':', 2)::bigint
  ), oylik_yoq as (
    -- tasdiqlangan F-2 oylari uchun nakopitelniy + m29; obyekt uchun slichitelniy + ostatka (Diskda hali yo'qlari)
    select t.tur, t.tur || ':' || a.obyekt_id || ':' || a.oy as kalit, a.obyekt_id, a.oy
      from (select distinct x.obyekt_id, x.oy from akt x where x.holat = 'tasdiqlangan' and not x.taxminiy) a cross join (values ('nakopitelniy'), ('m29')) t(tur)
    union
    select t.tur, t.tur || ':' || a.obyekt_id || ':-', a.obyekt_id, null
      from (select distinct x.obyekt_id from akt x where x.holat = 'tasdiqlangan' and not x.taxminiy) a cross join (values ('slichitelniy'), ('ostatka')) t(tur)
  ), oylik as (
    select od.tur, od.kalit, case od.tur when 'nakopitelniy' then 'Nakopitelniy' when 'm29' then 'M-29' when 'slichitelniy' then 'Slichitelniy' when 'ostatka' then 'Ostatka' else 'AOSR' end ||
           coalesce(' ' || od.oy, '') as sarlavha, 'joriy'::text as holat, od.loyiha_id, od.loyiha_nom, od.shartnoma_id, od.shartnoma_raqam, od.obyekt_id, od.obyekt_nom, od.oy,
           null::bigint as akt_id, null::bigint as forma3_id, false as taxminiy, false as takror, null::integer as qator_soni
      from oylik_disk od
    union all
    select y.tur, y.kalit, case y.tur when 'nakopitelniy' then 'Nakopitelniy' when 'm29' then 'M-29' when 'slichitelniy' then 'Slichitelniy' else 'Ostatka' end || coalesce(' ' || y.oy, ''),
           'joriy', o.loyiha_id, o.loyiha_nom, o.shartnoma_id, o.shartnoma_raqam, o.obyekt_id, o.obyekt_nom, y.oy, null::bigint, null::bigint, false, false, null::integer
      from oylik_yoq y join ob2 o on o.obyekt_id = y.obyekt_id
     where not exists (select 1 from disk_oylik d where d.kalit = y.kalit)
  ), hammasi as (
    select * from f2 union all select * from f3 union all select * from oylik
  ), suzilgan as (
    select h.* from hammasi h
     where (cardinality(v_tur) = 0 or h.tur = any(v_tur))
       and (cardinality(v_hol) = 0 or h.holat = 'joriy' or h.holat = any(v_hol))
       and (v_dan is null or h.oy is null or h.oy >= v_dan)
       and (v_gacha is null or h.oy is null or h.oy <= v_gacha)
  ), tayyor as (
    select s.*, d.fayl_id, d.versiya, d.bayt, d.yangilandi, d.fayl_id is null as yasash
      from suzilgan s
      left join lateral (select f.id as fayl_id, vv.raqam as versiya, vv.bayt, f.yangilandi
                           from public.t2_hm_fayl f left join public.t2_hm_versiya vv on vv.id = f.joriy_versiya_id
                          where f.kompaniya_id = p_kompaniya and f.hujjat_kalit = s.kalit and f.savatda is null limit 1) d on true
  )
  select (select count(*) from tayyor)::integer,
         coalesce((select jsonb_agg(jsonb_build_object(
           'kalit', t.kalit, 'tur', t.tur, 'sarlavha', t.sarlavha, 'holat', t.holat,
           'loyiha_id', t.loyiha_id, 'loyiha_nom', t.loyiha_nom, 'shartnoma_id', t.shartnoma_id, 'shartnoma_raqam', t.shartnoma_raqam,
           'obyekt_id', t.obyekt_id, 'obyekt_nom', t.obyekt_nom, 'oy', t.oy, 'akt_id', t.akt_id, 'forma3_id', t.forma3_id,
           'taxminiy', t.taxminiy, 'takror', t.takror, 'qator_soni', t.qator_soni,
           'fayl_id', t.fayl_id, 'versiya', t.versiya, 'bayt', t.bayt, 'yangilandi', t.yangilandi, 'yasash', t.yasash)
           order by t.loyiha_nom nulls last, t.shartnoma_raqam nulls last, t.obyekt_nom nulls last, t.oy nulls last, t.tur, t.kalit)
           from (select * from tayyor order by loyiha_nom nulls last, shartnoma_raqam nulls last, obyekt_nom nulls last, oy nulls last, tur, kalit limit v_lim) t), '[]'::jsonb)
    into v_jami, v_res;

  return jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya, 'jami', v_jami, 'kesilgan', v_jami > v_lim, 'nomzodlar', v_res);
end $fn$;

do $g$ begin
  execute 'revoke all on function public.t2_hujjat_paket_nomzod_v1(bigint, bigint, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.t2_hujjat_paket_nomzod_v1(bigint, bigint, jsonb) to service_role';
end $g$;
