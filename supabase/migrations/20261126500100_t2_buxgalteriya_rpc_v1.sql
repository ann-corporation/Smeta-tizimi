-- T2-BUXGALTERIYA-001 (2/2) - Buxgalteriya RPC lari (security definer, a'zolik + rol + accounting.* ruxsati, faqat service_role).
-- O'QISH (stable, /api/sb, umumiy imzo: kompaniya, actor, dan, gacha, kontragent, shartnoma, hisob, limit):
--   t2_bux_holat_v1 (reja + moslik + davrlar), t2_bux_jurnal_v1, t2_bux_osv_v1, t2_bux_kontragent_v1 (hisob-kitob + akt-sverka qatorlari),
--   t2_bux_nds_v1 (sotuv/xarid reyestri), t2_bux_tolov_v1 (bank va kassa).
-- YOZISH (idempotent operation_id, /api/sb-yoz):
--   t2_bux_boshlash_v1, t2_bux_hisob_saqla_v1, t2_bux_moslik_saqla_v1, t2_bux_avto_provodka_v1 (sinxron: faqat DELTA yoziladi),
--   t2_bux_qolda_provodka_v1, t2_bux_storno_v1, t2_bux_davr_v1 (ogohlantirish asosida), t2_bux_bank_import_v1,
--   t2_bux_tashqi_sync_v1 (KADRLAR va LOGISTIKA uchun ilgak: manba_tur = hr_* | tr_*).
-- Provodka o'zgarmas: tuzatish faqat storno (minus summa) / yangi provodka. Summa QQS bilan keladi, asosiy+QQS ga ayirma bilan bo'linadi.
begin;

-- ICHKI: a'zolik + rol + ruxsat. Kreditor/debitor hisobi ichki ma'lumot: buyurtmachi/prorab kabi rollar ko'rmaydi.
create or replace function public._t2_bux_ruxsat(p_kompaniya_id bigint, p_actor_id bigint, p_perm text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol is null or v_rol not in ('admin', 'superadmin', 'boss', 'director', 'rahbar', 'pto', 'bugalter') then
    raise exception 'PERMISSION_DENIED: buxgalteriya' using errcode = '42501';
  end if;
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, p_perm);
  return v_rol;
end $$;

-- ICHKI: shartnomaning kontragenti (kontragent shartnomasi: birinchi tomon; asosiy shartnoma: buyurtmachi tomoni yoki zakazchik INN i bo'yicha)
create or replace function public._t2_bux_sh_kontragent(p_shartnoma_id bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select t.kontragent_id from public.t2_shartnoma_tomon t join public.t2_shartnoma s on s.id = t.shartnoma_id
      where t.shartnoma_id = p_shartnoma_id and t.kontragent_id is not null
        and (s.asosiy = false or t.rol ~* '(zakaz|buyurtma|заказ|mijoz|xaridor|покупат)')
      order by t.tartib, t.id limit 1),
    (select k.id from public.t2_shartnoma s join public.t2_kontragent k on k.kompaniya_id = s.kompaniya_id and k.inn is not null and k.inn = s.zakazchik_inn and k.holat = 'faol'
      where s.id = p_shartnoma_id and s.asosiy order by k.id limit 1));
$$;

-- ICHKI: shartnoma aniq bitta obyektga bog'langan bo'lsa shu obyekt, aks holda NULL (noma'lum)
create or replace function public._t2_bux_sh_obyekt(p_shartnoma_id bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then min(b.obyekt_id) end from public.t2_shartnoma_qoshimcha_bog b where b.shartnoma_id = p_shartnoma_id and b.holat = 'faol';
$$;

-- ICHKI: hujjat ko'rinadigan nomi (provodka -> hujjatga drill-down yorlig'i)
create or replace function public._t2_bux_hujjat_nomi(p_kompaniya_id bigint, p_tur text, p_id bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_id is null then null
    when p_tur = 'forma3' then (select coalesce(nullif(btrim(coalesce(f.raqam, '')), ''), '#' || f.id) from public.t2_forma3 f where f.id = p_id and f.kompaniya_id = p_kompaniya_id)
    when p_tur = 'tolov' then (select coalesce(nullif(btrim(coalesce(t.hujjat_raqam, '')), ''), '#' || t.id) from public.t2_tolov t where t.id = p_id and t.kompaniya_id = p_kompaniya_id)
    when p_tur in ('ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich') then
      (select coalesce(nullif(btrim(coalesce(a.hujjat_raqam, '')), ''), nullif(btrim(coalesce(a.nomi, '')), ''), '#' || a.id) from public.t2_qarz_asos a where a.id = p_id and a.kompaniya_id = p_kompaniya_id)
    else '#' || p_id end;
$$;

-- ICHKI: bo'lishi kerak (kerak) to'plami <-> jurnaldagi sof summa; faqat DELTA yoziladi (idempotent, storno bilan qaytariladi).
create or replace function public._t2_bux_sync(p_kompaniya_id bigint, p_actor_id bigint, p_turlar text[], p_kerak jsonb, p_dry boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_yangi integer; v_storno integer; v_yopiq integer; v_oylar text[];
begin
  with d0 as (
    select * from jsonb_to_recordset(coalesce(p_kerak, '[]'::jsonb))
      as x(manba_tur text, manba_id bigint, qism text, sana date, dt_kod text, kt_kod text, summa numeric, kontragent_id bigint, shartnoma_id bigint, obyekt_id bigint)
  ), d as (
    select manba_tur, manba_id, qism, sana, dt_kod, kt_kod, coalesce(kontragent_id, 0) as k0, coalesce(shartnoma_id, 0) as s0, coalesce(obyekt_id, 0) as o0, sum(summa) as summa
      from d0 group by 1, 2, 3, 4, 5, 6, 7, 8, 9
  ), c as (
    select manba_tur, manba_id, qism, sana, dt_kod, kt_kod, coalesce(kontragent_id, 0) as k0, coalesce(shartnoma_id, 0) as s0, coalesce(obyekt_id, 0) as o0, sum(summa) as summa
      from public.t2_bux_provodka where kompaniya_id = p_kompaniya_id and manba_tur = any (p_turlar) group by 1, 2, 3, 4, 5, 6, 7, 8, 9
  ), delta as (
    select coalesce(d.manba_tur, c.manba_tur) as manba_tur, coalesce(d.manba_id, c.manba_id) as manba_id, coalesce(d.qism, c.qism) as qism,
           coalesce(d.sana, c.sana) as sana, coalesce(d.dt_kod, c.dt_kod) as dt_kod, coalesce(d.kt_kod, c.kt_kod) as kt_kod,
           nullif(coalesce(d.k0, c.k0), 0) as kontragent_id, nullif(coalesce(d.s0, c.s0), 0) as shartnoma_id, nullif(coalesce(d.o0, c.o0), 0) as obyekt_id,
           coalesce(d.summa, 0) - coalesce(c.summa, 0) as farq
      from d full join c on d.manba_tur = c.manba_tur and d.manba_id = c.manba_id and d.qism = c.qism and d.sana = c.sana
                        and d.dt_kod = c.dt_kod and d.kt_kod = c.kt_kod and d.k0 = c.k0 and d.s0 = c.s0 and d.o0 = c.o0
     where coalesce(d.summa, 0) <> coalesce(c.summa, 0)
  ), ins as (
    insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, aktor_id)
    select p_kompaniya_id, sana, dt_kod, kt_kod, farq, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, 'avto', p_actor_id
      from delta where not p_dry
    returning 1
  )
  select count(*) filter (where farq > 0), count(*) filter (where farq < 0),
         count(*) filter (where exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', delta.sana)::date)),
         coalesce(array_agg(distinct to_char(date_trunc('month', delta.sana), 'YYYY-MM')), array[]::text[])
    into v_yangi, v_storno, v_yopiq, v_oylar
    from delta;
  return jsonb_build_object('yangi', v_yangi, 'storno', v_storno, 'yopiq_davr_ogohlantirish', v_yopiq, 'oylar', to_jsonb(v_oylar));
end $$;

-- ICHKI: mavjud hujjatlardan "bo'lishi kerak" provodkalar to'plami (jsonb massiv)
create or replace function public._t2_bux_kerak_avto(p_kompaniya_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_foiz numeric; v_res jsonb;
begin
  select qiymat into v_foiz from public.t2_bux_moslik where kompaniya_id = p_kompaniya_id and kalit = 'param.nds_foiz';
  v_foiz := coalesce(v_foiz, 12);
  with m as (select kalit, dt_kod, kt_kod from public.t2_bux_moslik where kompaniya_id = p_kompaniya_id and dt_kod is not null and kt_kod is not null),
  f as (
    select f.id, coalesce(f.sotuv_sana, f.davr_oxiri) as sana, f.shartnoma_id, coalesce(f.obyekt_id, public._t2_bux_sh_obyekt(f.shartnoma_id)) as obyekt_id,
           public._t2_bux_sh_kontragent(f.shartnoma_id) as kid, f.sotuv_summa as jami,
           round(f.sotuv_summa / (1 + coalesce(f.nds_foiz, v_foiz) / 100), 2) as net
      from public.t2_forma3 f
     where f.kompaniya_id = p_kompaniya_id and f.holat in ('tayyor', 'imzolangan') and f.sotuv_summa is not null and f.sotuv_summa <> 0
  ),
  a as (
    select a.id, a.tur, coalesce(a.sana, a.yaratildi::date) as sana, a.summa as jami, a.shartnoma_id, a.sklad_harakat_id, a.tolov_id,
           l.kid, public._t2_bux_sh_obyekt(a.shartnoma_id) as obyekt_id,
           case when coalesce(k.qqs_tolovchi, true) then round(a.summa / (1 + v_foiz / 100), 2) else a.summa end as net
      from public.t2_qarz_asos a
      left join lateral (select public._t2_bux_sh_kontragent(a.shartnoma_id) as kid) l on true
      left join public.t2_kontragent k on k.id = l.kid
     where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' and a.summa is not null and a.summa <> 0
  ),
  q as (
    select 'forma3'::text as manba_tur, f.id as manba_id, 'asosiy'::text as qism, f.sana, m.dt_kod, m.kt_kod, f.net as summa, f.kid as kontragent_id, f.shartnoma_id, f.obyekt_id
      from f join m on m.kalit = 'sotuv.realizatsiya' where f.net <> 0
    union all
    select 'forma3', f.id, 'nds_sotuv', f.sana, m.dt_kod, m.kt_kod, f.jami - f.net, f.kid, f.shartnoma_id, f.obyekt_id
      from f join m on m.kalit = 'sotuv.nds' where f.jami - f.net <> 0
    union all
    select 'tolov', t.id, 'asosiy', t.sana, m.dt_kod, m.kt_kod, case when t.tur = 'qaytarim' then -t.summa else t.summa end,
           public._t2_bux_sh_kontragent(t.shartnoma_id), t.shartnoma_id, coalesce(t.obyekt_id, public._t2_bux_sh_obyekt(t.shartnoma_id))
      from public.t2_tolov t join public.t2_shartnoma s on s.id = t.shartnoma_id
      join m on m.kalit = case when s.asosiy then 'tolov.kirim' else 'tolov.chiqim' end
     where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor' and t.summa is not null and t.summa <> 0
    union all
    select case when a.sklad_harakat_id is not null then 'ombor_kirim' else 'qarz_yetkazish' end, a.id, 'asosiy', a.sana, m.dt_kod, m.kt_kod, a.net, a.kid, a.shartnoma_id, a.obyekt_id
      from a join m on m.kalit = 'xarid.ombor' where a.tur = 'yetkazib_berish' and a.net <> 0
    union all
    select case when a.sklad_harakat_id is not null then 'ombor_kirim' else 'qarz_yetkazish' end, a.id, 'nds_xarid', a.sana, m.dt_kod, m.kt_kod, a.jami - a.net, a.kid, a.shartnoma_id, a.obyekt_id
      from a join m on m.kalit = 'xarid.nds' where a.tur = 'yetkazib_berish' and a.jami - a.net <> 0
    union all
    select 'qarz_ish', a.id, 'asosiy', a.sana, m.dt_kod, m.kt_kod, a.net, a.kid, a.shartnoma_id, a.obyekt_id
      from a join m on m.kalit = 'xarid.ish' where a.tur = 'bajarilgan_ish' and a.net <> 0
    union all
    select 'qarz_ish', a.id, 'nds_xarid', a.sana, m.dt_kod, m.kt_kod, a.jami - a.net, a.kid, a.shartnoma_id, a.obyekt_id
      from a join m on m.kalit = 'xarid.nds' where a.tur = 'bajarilgan_ish' and a.jami - a.net <> 0
    union all
    select 'qarz_tolov', a.id, 'asosiy', a.sana, m.dt_kod, m.kt_kod, a.jami, a.kid, a.shartnoma_id, a.obyekt_id
      from a join m on m.kalit = 'tolov.chiqim' where a.tur = 'tolov' and a.tolov_id is null
    union all
    select 'qarz_boshlangich', a.id, 'asosiy', a.sana, m.dt_kod, m.kt_kod, a.jami, a.kid, a.shartnoma_id, a.obyekt_id
      from a join m on m.kalit = 'boshlangich.kreditor' where a.tur = 'boshlangich_qoldiq'
  )
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_res from q;
  return v_res;
end $$;

-- ===================== O'QISH =====================

create or replace function public.t2_bux_holat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  return jsonb_build_object('ok', true,
    'boshlangan', exists (select 1 from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id),
    'hisoblar', (select coalesce(jsonb_agg(jsonb_build_object('kod', h.kod, 'nom_uz', h.nom_uz, 'nom_ru', h.nom_ru, 'tur', h.tur,
                   'kontragent_analitika', h.kontragent_analitika, 'faol', h.faol, 'standart', h.standart) order by h.kod), '[]'::jsonb)
                   from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id),
    'moslik', (select coalesce(jsonb_agg(jsonb_build_object('kalit', z.kalit, 'dt_kod', z.dt_kod, 'kt_kod', z.kt_kod, 'qiymat', z.qiymat, 'izoh', z.izoh) order by z.kalit), '[]'::jsonb)
                from public.t2_bux_moslik z where z.kompaniya_id = p_kompaniya_id),
    'davrlar', (select coalesce(jsonb_agg(jsonb_build_object('oy', d.oy, 'holat', d.holat, 'izoh', d.izoh, 'yangilandi', d.yangilandi) order by d.oy desc), '[]'::jsonb)
                 from public.t2_bux_davr d where d.kompaniya_id = p_kompaniya_id),
    'provodka_soni', (select count(*) from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id),
    'oxirgi_sana', (select max(p.sana) from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id));
end $$;

create or replace function public.t2_bux_jurnal_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 500), 1), 2000); v_jami bigint; v_q jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  select count(*) into v_jami from public.t2_bux_provodka p
   where p.kompaniya_id = p_kompaniya_id and (p_dan is null or p.sana >= p_dan) and (p_gacha is null or p.sana <= p_gacha)
     and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
     and (p_hisob is null or p.dt_kod = p_hisob or p.kt_kod = p_hisob);
  select coalesce(jsonb_agg(x.j order by x.sana desc, x.id desc), '[]'::jsonb) into v_q from (
    select p.id, p.sana, jsonb_build_object('id', p.id, 'sana', p.sana, 'dt', p.dt_kod, 'kt', p.kt_kod, 'summa', p.summa,
             'kontragent_id', p.kontragent_id, 'kontragent', k.nom, 'shartnoma_id', p.shartnoma_id, 'shartnoma_raqam', s.raqam, 'obyekt_id', p.obyekt_id,
             'manba_tur', p.manba_tur, 'manba_id', p.manba_id, 'hujjat', public._t2_bux_hujjat_nomi(p_kompaniya_id, p.manba_tur, p.manba_id),
             'qism', p.qism, 'tur', p.tur, 'storno_id', p.storno_id, 'izoh', p.izoh) as j
      from public.t2_bux_provodka p
      left join public.t2_kontragent k on k.id = p.kontragent_id
      left join public.t2_shartnoma s on s.id = p.shartnoma_id
     where p.kompaniya_id = p_kompaniya_id and (p_dan is null or p.sana >= p_dan) and (p_gacha is null or p.sana <= p_gacha)
       and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
       and (p_hisob is null or p.dt_kod = p_hisob or p.kt_kod = p_hisob)
     order by p.sana desc, p.id desc limit v_lim) x;
  return jsonb_build_object('ok', true, 'jami', v_jami, 'limit', v_lim, 'qatorlar', v_q);
end $$;

create or replace function public.t2_bux_osv_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date_trunc('month', current_date)::date); v_gacha date := coalesce(p_gacha, current_date); v_res jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  with pr as (
    select p.dt_kod as kod, p.summa as dt, 0::numeric as kt, p.sana from public.t2_bux_provodka p
     where p.kompaniya_id = p_kompaniya_id and p.sana <= v_gacha and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
    union all
    select p.kt_kod, 0::numeric, p.summa, p.sana from public.t2_bux_provodka p
     where p.kompaniya_id = p_kompaniya_id and p.sana <= v_gacha and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
  ), ag as (
    select kod, coalesce(sum(dt - kt) filter (where sana < v_dan), 0) as ochilish,
           coalesce(sum(dt) filter (where sana >= v_dan), 0) as dt, coalesce(sum(kt) filter (where sana >= v_dan), 0) as kt
      from pr group by kod
  )
  select jsonb_build_object('ok', true, 'dan', v_dan, 'gacha', v_gacha,
    'qatorlar', coalesce(jsonb_agg(jsonb_build_object('kod', a.kod, 'nom_uz', h.nom_uz, 'nom_ru', h.nom_ru, 'tur', h.tur,
                 'ochilish', a.ochilish, 'dt', a.dt, 'kt', a.kt, 'yopilish', a.ochilish + a.dt - a.kt) order by a.kod), '[]'::jsonb),
    'jami_dt', coalesce(sum(a.dt), 0), 'jami_kt', coalesce(sum(a.kt), 0), 'jami_ochilish', coalesce(sum(a.ochilish), 0))
    into v_res
    from ag a left join public.t2_bux_hisob h on h.kompaniya_id = p_kompaniya_id and h.kod = a.kod
   where a.ochilish <> 0 or a.dt <> 0 or a.kt <> 0;
  return v_res;
end $$;

create or replace function public.t2_bux_kontragent_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date_trunc('month', current_date)::date); v_gacha date := coalesce(p_gacha, current_date); v_qat jsonb; v_huj jsonb := null; v_kon jsonb := null;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  with hs as (select kod from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id and kontragent_analitika),
  pr as (
    select p.kontragent_id, p.dt_kod as kod, p.summa as dt, 0::numeric as kt, p.sana from public.t2_bux_provodka p
     where p.kompaniya_id = p_kompaniya_id and p.sana <= v_gacha and p.dt_kod in (select kod from hs) and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id)
    union all
    select p.kontragent_id, p.kt_kod, 0::numeric, p.summa, p.sana from public.t2_bux_provodka p
     where p.kompaniya_id = p_kompaniya_id and p.sana <= v_gacha and p.kt_kod in (select kod from hs) and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id)
  ), ag as (
    select kontragent_id, kod, coalesce(sum(dt - kt) filter (where sana < v_dan), 0) as ochilish,
           coalesce(sum(dt) filter (where sana >= v_dan), 0) as dt, coalesce(sum(kt) filter (where sana >= v_dan), 0) as kt
      from pr group by kontragent_id, kod
  )
  select coalesce(jsonb_agg(jsonb_build_object('kontragent_id', a.kontragent_id, 'kontragent', k.nom, 'inn', k.inn, 'kod', a.kod, 'nom_uz', h.nom_uz, 'nom_ru', h.nom_ru,
           'ochilish', a.ochilish, 'dt', a.dt, 'kt', a.kt, 'yopilish', a.ochilish + a.dt - a.kt)
           order by coalesce(k.nom, '~'), a.kod), '[]'::jsonb)
    into v_qat
    from ag a left join public.t2_kontragent k on k.id = a.kontragent_id and k.kompaniya_id = p_kompaniya_id
              left join public.t2_bux_hisob h on h.kompaniya_id = p_kompaniya_id and h.kod = a.kod
   where a.ochilish <> 0 or a.dt <> 0 or a.kt <> 0;

  if p_kontragent_id is not null then
    -- akt-sverka qatorlari: bitta hujjat = bitta qator (asosiy + QQS qismlari yig'iladi), davr ichida
    with hs as (select kod from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id and kontragent_analitika),
    ex as (
      select p.id, p.sana, p.dt_kod as hisob, p.summa as dt, 0::numeric as kt, p.manba_tur, p.manba_id, p.shartnoma_id, p.izoh from public.t2_bux_provodka p
       where p.kompaniya_id = p_kompaniya_id and p.kontragent_id = p_kontragent_id and p.sana >= v_dan and p.sana <= v_gacha and p.dt_kod in (select kod from hs)
         and (p_hisob is null or p.dt_kod = p_hisob) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
      union all
      select p.id, p.sana, p.kt_kod, 0::numeric, p.summa, p.manba_tur, p.manba_id, p.shartnoma_id, p.izoh from public.t2_bux_provodka p
       where p.kompaniya_id = p_kompaniya_id and p.kontragent_id = p_kontragent_id and p.sana >= v_dan and p.sana <= v_gacha and p.kt_kod in (select kod from hs)
         and (p_hisob is null or p.kt_kod = p_hisob) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
    ), g as (
      select min(e.sana) as sana, e.hisob, e.manba_tur, e.manba_id, case when e.manba_id is null then min(e.id) end as pid, min(e.shartnoma_id) as shartnoma_id,
             sum(e.dt) as dt, sum(e.kt) as kt, max(e.izoh) as izoh
        from ex e group by e.hisob, e.manba_tur, e.manba_id, case when e.manba_id is null then e.id end
    )
    select coalesce(jsonb_agg(jsonb_build_object('sana', g.sana, 'hisob', g.hisob, 'manba_tur', g.manba_tur, 'manba_id', g.manba_id,
             'hujjat', public._t2_bux_hujjat_nomi(p_kompaniya_id, g.manba_tur, g.manba_id), 'shartnoma_id', g.shartnoma_id, 'shartnoma_raqam', s.raqam,
             'dt', g.dt, 'kt', g.kt, 'izoh', g.izoh) order by g.sana, g.hisob, g.manba_id nulls last), '[]'::jsonb)
      into v_huj
      from g left join public.t2_shartnoma s on s.id = g.shartnoma_id
     where g.dt <> 0 or g.kt <> 0;
    select jsonb_build_object('id', k.id, 'nom', k.nom, 'inn', k.inn) into v_kon from public.t2_kontragent k where k.id = p_kontragent_id and k.kompaniya_id = p_kompaniya_id;
  end if;
  return jsonb_build_object('ok', true, 'dan', v_dan, 'gacha', v_gacha, 'qatorlar', v_qat, 'hujjatlar', v_huj, 'kontragent', v_kon,
    'kompaniya', (select jsonb_build_object('nom', coalesce(c.toliq_nom, c.nom), 'inn', c.inn) from public.t2_kompaniya c where c.id = p_kompaniya_id));
end $$;

create or replace function public.t2_bux_nds_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date_trunc('month', current_date)::date); v_gacha date := coalesce(p_gacha, current_date); v_res jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  with doc as (
    select p.manba_tur, p.manba_id, min(p.sana) as sana, max(p.kontragent_id) as kontragent_id, max(p.shartnoma_id) as shartnoma_id,
           coalesce(sum(p.summa) filter (where p.qism = 'asosiy'), 0) as asos, coalesce(sum(p.summa) filter (where p.qism in ('nds_sotuv', 'nds_xarid')), 0) as nds,
           case when p.manba_tur = 'forma3' then 'sotuv' else 'xarid' end as yon
      from public.t2_bux_provodka p
     where p.kompaniya_id = p_kompaniya_id and p.manba_tur in ('forma3', 'ombor_kirim', 'qarz_yetkazish', 'qarz_ish')
       and p.sana >= v_dan and p.sana <= v_gacha and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id)
     group by p.manba_tur, p.manba_id
  ), x as (
    select d.*, k.nom as kontragent, k.inn, s.raqam as shartnoma_raqam, public._t2_bux_hujjat_nomi(p_kompaniya_id, d.manba_tur, d.manba_id) as hujjat
      from doc d left join public.t2_kontragent k on k.id = d.kontragent_id left join public.t2_shartnoma s on s.id = d.shartnoma_id
     where d.asos <> 0 or d.nds <> 0
  )
  select jsonb_build_object('ok', true, 'dan', v_dan, 'gacha', v_gacha,
    'sotuv', coalesce(jsonb_agg(jsonb_build_object('sana', x.sana, 'hujjat', x.hujjat, 'manba_tur', x.manba_tur, 'manba_id', x.manba_id, 'kontragent', x.kontragent, 'inn', x.inn,
             'shartnoma_raqam', x.shartnoma_raqam, 'asos', x.asos, 'nds', x.nds, 'jami', x.asos + x.nds) order by x.sana, x.manba_id) filter (where x.yon = 'sotuv'), '[]'::jsonb),
    'xarid', coalesce(jsonb_agg(jsonb_build_object('sana', x.sana, 'hujjat', x.hujjat, 'manba_tur', x.manba_tur, 'manba_id', x.manba_id, 'kontragent', x.kontragent, 'inn', x.inn,
             'shartnoma_raqam', x.shartnoma_raqam, 'asos', x.asos, 'nds', x.nds, 'jami', x.asos + x.nds) order by x.sana, x.manba_id) filter (where x.yon = 'xarid'), '[]'::jsonb))
    into v_res from x;
  return v_res;
end $$;

create or replace function public.t2_bux_tolov_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 500), 1), 2000); v_t jsonb; v_s jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  select coalesce(jsonb_agg(x.j order by x.sana desc, x.id desc), '[]'::jsonb) into v_t from (
    select t.id, t.sana, jsonb_build_object('id', t.id, 'sana', t.sana, 'summa', t.summa, 'tur', t.tur, 'hujjat_raqam', t.hujjat_raqam, 'izoh', t.izoh, 'manba', t.manba,
             'shartnoma_id', t.shartnoma_id, 'shartnoma_raqam', s.raqam, 'asosiy', s.asosiy, 'kontragent_id', l.kid, 'kontragent', k.nom, 'obyekt_id', t.obyekt_id,
             'yonalish', case when (s.asosiy and t.tur <> 'qaytarim') or (not s.asosiy and t.tur = 'qaytarim') then 'kirim' else 'chiqim' end,
             'provodkada', exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.manba_tur = 'tolov' and p.manba_id = t.id)) as j
      from public.t2_tolov t join public.t2_shartnoma s on s.id = t.shartnoma_id
      left join lateral (select public._t2_bux_sh_kontragent(s.id) as kid) l on true
      left join public.t2_kontragent k on k.id = l.kid
     where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor' and (p_dan is null or t.sana >= p_dan) and (p_gacha is null or t.sana <= p_gacha)
       and (p_shartnoma_id is null or t.shartnoma_id = p_shartnoma_id) and (p_kontragent_id is null or l.kid = p_kontragent_id)
     order by t.sana desc, t.id desc limit v_lim) x;
  select coalesce(jsonb_agg(y.j order by y.raqam), '[]'::jsonb) into v_s from (
    select s.raqam, jsonb_build_object('id', s.id, 'raqam', s.raqam, 'nom', s.nom, 'asosiy', s.asosiy, 'kontragent_id', l.kid, 'kontragent', k.nom, 'inn', k.inn) as j
      from public.t2_shartnoma s
      left join lateral (select public._t2_bux_sh_kontragent(s.id) as kid) l on true
      left join public.t2_kontragent k on k.id = l.kid
     where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor' order by s.raqam limit 3000) y;
  return jsonb_build_object('ok', true, 'limit', v_lim, 'tolovlar', v_t, 'shartnomalar', v_s);
end $$;

-- ===================== YOZISH =====================

create or replace function public.t2_bux_boshlash_v1(p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_h integer; v_m integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  v_h := public._t2_bux_hisob_seed(p_kompaniya_id);
  v_m := public._t2_bux_moslik_seed(p_kompaniya_id);
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_boshlash', 'buxgalteriya', null, format('hisob=%s moslik=%s', v_h, v_m), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'hisob_qoshildi', v_h, 'moslik_qoshildi', v_m);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_boshlash_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_bux_hisob_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kod text, p_nom_uz text, p_nom_ru text, p_tur text,
  p_kontragent_analitika boolean, p_faol boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if p_kod is null or p_kod !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'code', 'KOD_4_RAQAM'); end if;
  if nullif(btrim(coalesce(p_nom_uz, '')), '') is null or nullif(btrim(coalesce(p_nom_ru, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'NOM_MAJBURIY'); end if;
  if p_tur is null or p_tur not in ('aktiv', 'passiv', 'aktiv_passiv', 'daromad', 'xarajat', 'balansdan_tashqari') then return jsonb_build_object('ok', false, 'code', 'TUR_INVALID'); end if;
  if not coalesce(p_faol, true) and exists (select 1 from public.t2_bux_moslik z where z.kompaniya_id = p_kompaniya_id and p_kod in (z.dt_kod, z.kt_kod)) then
    return jsonb_build_object('ok', false, 'code', 'HISOB_MOSLIKDA', 'xabar', 'Bu hisob avto-provodka qoidasida ishlatiladi - avval qoidani o''zgartiring.');
  end if;
  insert into public.t2_bux_hisob(kompaniya_id, kod, nom_uz, nom_ru, tur, kontragent_analitika, faol)
  values (p_kompaniya_id, p_kod, btrim(p_nom_uz), btrim(p_nom_ru), p_tur, coalesce(p_kontragent_analitika, false), coalesce(p_faol, true))
  on conflict (kompaniya_id, kod) do update set nom_uz = excluded.nom_uz, nom_ru = excluded.nom_ru, tur = excluded.tur,
    kontragent_analitika = excluded.kontragent_analitika, faol = excluded.faol, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_hisob_saqla', 'buxgalteriya', null, format('kod=%s faol=%s', p_kod, coalesce(p_faol, true)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kod', p_kod);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_hisob_saqla_v1', v_res);
  return v_res;
end $$;

-- Moslik o'zgarsa, keyingi sinxron eski provodkalarni storno qilib yangi hisoblarga qayta yozadi (tarix saqlanadi). Shuning uchun accounting.approve.
create or replace function public.t2_bux_moslik_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kalit text, p_dt_kod text, p_kt_kod text, p_qiymat numeric, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if not exists (select 1 from public.t2_bux_moslik where kompaniya_id = p_kompaniya_id and kalit = p_kalit) then return jsonb_build_object('ok', false, 'code', 'KALIT_YOQ'); end if;
  if p_kalit like 'param.%' then
    if p_qiymat is null or p_qiymat < 0 or p_qiymat >= 100 then return jsonb_build_object('ok', false, 'code', 'QIYMAT_0_100'); end if;
    update public.t2_bux_moslik set qiymat = p_qiymat, yangilandi = now() where kompaniya_id = p_kompaniya_id and kalit = p_kalit;
  else
    if p_dt_kod is null or p_kt_kod is null or p_dt_kod = p_kt_kod
       or (select count(*) from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.faol and h.kod in (p_dt_kod, p_kt_kod)) <> 2 then
      return jsonb_build_object('ok', false, 'code', 'HISOB_NOTOGRI');
    end if;
    update public.t2_bux_moslik set dt_kod = p_dt_kod, kt_kod = p_kt_kod, yangilandi = now() where kompaniya_id = p_kompaniya_id and kalit = p_kalit;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_moslik_saqla', 'buxgalteriya', null, format('kalit=%s', p_kalit), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kalit', p_kalit);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_moslik_saqla_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_bux_avto_provodka_v1(p_actor_id bigint, p_kompaniya_id bigint, p_dry boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_sync jsonb; v_res jsonb; v_f3 bigint; v_asos bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not coalesce(p_dry, false) then
    select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
    if found then return v_prev; end if;
  end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, case when coalesce(p_dry, false) then 'accounting.read' else 'accounting.write' end);
  if not exists (select 1 from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'BOSHLANMAGAN', 'xabar', 'Avval hisoblar rejasini yarating (Boshlash).');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_sync:' || p_kompaniya_id, 0));
  v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id,
    array['forma3', 'tolov', 'ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich'], public._t2_bux_kerak_avto(p_kompaniya_id), coalesce(p_dry, false));
  select count(*) into v_f3 from public.t2_forma3 f where f.kompaniya_id = p_kompaniya_id and f.holat in ('tayyor', 'imzolangan') and f.sotuv_summa is null;
  select count(*) into v_asos from public.t2_qarz_asos a where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' and a.summa is null and not (a.tur = 'tolov' and a.tolov_id is not null);
  v_res := jsonb_build_object('ok', true, 'dry', coalesce(p_dry, false)) || v_sync
           || jsonb_build_object('f3_summasiz', v_f3, 'asos_summasiz', v_asos);
  if not coalesce(p_dry, false) then
    perform public.t2_audit_yoz(p_kompaniya_id, 'bux_avto_provodka', 'buxgalteriya', null,
      format('yangi=%s storno=%s yopiq=%s', v_sync->>'yangi', v_sync->>'storno', v_sync->>'yopiq_davr_ogohlantirish'), 'actor:' || p_actor_id, null);
    insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_avto_provodka_v1', v_res);
  end if;
  return v_res;
end $$;

create or replace function public.t2_bux_qolda_provodka_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sana date, p_dt_kod text, p_kt_kod text, p_summa numeric,
  p_kontragent_id bigint, p_shartnoma_id bigint, p_obyekt_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_id bigint; v_res jsonb; v_yopiq boolean;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if p_sana is null or p_summa is null or p_summa = 0 then return jsonb_build_object('ok', false, 'code', 'SANA_SUMMA'); end if;
  if p_dt_kod is null or p_kt_kod is null or p_dt_kod = p_kt_kod
     or (select count(*) from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.faol and h.kod in (p_dt_kod, p_kt_kod)) <> 2 then
    return jsonb_build_object('ok', false, 'code', 'HISOB_NOTOGRI');
  end if;
  if p_kontragent_id is not null and not exists (select 1 from public.t2_kontragent where id = p_kontragent_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KONTRAGENT_YOQ'); end if;
  if p_shartnoma_id is not null and not exists (select 1 from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_YOQ'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ'); end if;
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, izoh, aktor_id)
  values (p_kompaniya_id, p_sana, p_dt_kod, p_kt_kod, round(p_summa, 2), p_kontragent_id, p_shartnoma_id, p_obyekt_id, 'qolda', null, 'asosiy', 'qolda',
          nullif(left(btrim(coalesce(p_izoh, '')), 300), ''), p_actor_id)
  returning id into v_id;
  v_yopiq := exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', p_sana)::date);
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_qolda_provodka', 'buxgalteriya', p_obyekt_id, format('id=%s', v_id), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_id, 'yopiq_davr_ogohlantirish', v_yopiq);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_qolda_provodka_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_bux_storno_v1(p_actor_id bigint, p_kompaniya_id bigint, p_provodka_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_p public.t2_bux_provodka%rowtype; v_id bigint; v_res jsonb; v_yopiq boolean;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  select * into v_p from public.t2_bux_provodka where id = p_provodka_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'PROVODKA_YOQ'); end if;
  if v_p.tur = 'avto' then
    return jsonb_build_object('ok', false, 'code', 'AVTO_STORNO_MUMKIN_EMAS', 'xabar', 'Avtomatik provodka hujjat orqali o''zgaradi: hujjatni tuzating yoki bekor qiling, keyin «Hujjatlardan yangilash».');
  end if;
  if v_p.tur = 'storno' then return jsonb_build_object('ok', false, 'code', 'STORNO_STORNO_EMAS'); end if;
  if exists (select 1 from public.t2_bux_provodka where storno_id = v_p.id) then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_STORNO'); end if;
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, storno_id, izoh, aktor_id)
  values (v_p.kompaniya_id, v_p.sana, v_p.dt_kod, v_p.kt_kod, -v_p.summa, v_p.kontragent_id, v_p.shartnoma_id, v_p.obyekt_id, v_p.manba_tur, v_p.manba_id, v_p.qism, 'storno', v_p.id,
          nullif(left(btrim(coalesce(p_izoh, '')), 300), ''), p_actor_id)
  returning id into v_id;
  v_yopiq := exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', v_p.sana)::date);
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_storno', 'buxgalteriya', v_p.obyekt_id, format('provodka=%s storno=%s', v_p.id, v_id), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_id, 'yopiq_davr_ogohlantirish', v_yopiq);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_storno_v1', v_res);
  return v_res;
end $$;

-- Davr yopish: ogohlantirish bo'lsa (p_tasdiq = false) ok=false + ro'yxat; p_tasdiq = true bo'lsa baribir yopiladi (egasi: bloklash emas, ogohlantirish).
create or replace function public.t2_bux_davr_v1(p_actor_id bigint, p_kompaniya_id bigint, p_oy date, p_amal text, p_tasdiq boolean, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_oy date; v_og jsonb := '[]'::jsonb; v_sync jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_oy is null or p_amal is null or p_amal not in ('yop', 'och') then return jsonb_build_object('ok', false, 'code', 'DAVR_AMAL'); end if;
  v_oy := date_trunc('month', p_oy)::date;
  if p_amal = 'yop' then
    v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id, array['forma3', 'tolov', 'ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich'],
                                  public._t2_bux_kerak_avto(p_kompaniya_id), true);
    if to_char(v_oy, 'YYYY-MM') in (select jsonb_array_elements_text(v_sync->'oylar')) then
      v_og := v_og || jsonb_build_array(jsonb_build_object('kod', 'PROVODKASIZ_HUJJAT', 'xabar', 'Bu oyda hali provodkaga aylanmagan hujjatlar bor (Hujjatlardan yangilash).'));
    end if;
    if exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.sana < v_oy
                 and not exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', p.sana)::date)) then
      v_og := v_og || jsonb_build_array(jsonb_build_object('kod', 'OLDINGI_OY_OCHIQ', 'xabar', 'Oldingi oylardan yopilmagani bor.'));
    end if;
    if jsonb_array_length(v_og) > 0 and not coalesce(p_tasdiq, false) then
      return jsonb_build_object('ok', false, 'code', 'OGOHLANTIRISH', 'ogohlantirishlar', v_og);
    end if;
  end if;
  insert into public.t2_bux_davr(kompaniya_id, oy, holat, aktor_id, izoh) values (p_kompaniya_id, v_oy, case when p_amal = 'yop' then 'yopiq' else 'ochiq' end, p_actor_id, nullif(left(btrim(coalesce(p_izoh, '')), 300), ''))
  on conflict (kompaniya_id, oy) do update set holat = excluded.holat, aktor_id = excluded.aktor_id, izoh = excluded.izoh, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_davr', 'buxgalteriya', null, format('oy=%s amal=%s ogohlantirish=%s', v_oy, p_amal, jsonb_array_length(v_og)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'oy', v_oy, 'holat', case when p_amal = 'yop' then 'yopiq' else 'ochiq' end, 'ogohlantirishlar', v_og);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_davr_v1', v_res);
  return v_res;
end $$;

-- Bank ko'chirmasi importi: faqat shartnomaga moslangan qatorlar t2_tolov ga yoziladi (takrorsiz). Moslanmaganlar foydalanuvchiga qaytariladi.
create or replace function public.t2_bux_bank_import_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_e jsonb; v_i integer := 0; v_yangi integer := 0; v_takror integer := 0; v_xato integer := 0; v_sh public.t2_shartnoma%rowtype;
  v_sana date; v_summa numeric; v_yon text; v_tur text; v_op uuid; v_raqam text; v_natija jsonb := '[]'::jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 500 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_1_500');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_bank:' || p_kompaniya_id, 0));
  for v_e in select value from jsonb_array_elements(p_qatorlar) loop
    v_i := v_i + 1;
    begin
      v_sana := nullif(v_e->>'sana', '')::date;
      v_summa := round(nullif(v_e->>'summa', '')::numeric, 2);
      v_yon := v_e->>'yonalish';
      v_raqam := nullif(btrim(coalesce(v_e->>'hujjat_raqam', '')), '');
      if v_sana is null or v_summa is null or v_summa <= 0 or v_yon not in ('kirim', 'chiqim') or nullif(v_e->>'kalit', '') is null then raise exception 'QATOR_MAYDON'; end if;
      select * into v_sh from public.t2_shartnoma where id = nullif(v_e->>'shartnoma_id', '')::bigint and kompaniya_id = p_kompaniya_id and holat <> 'bekor';
      if not found then raise exception 'SHARTNOMA_NOT_FOUND'; end if;
      v_tur := case when (v_sh.asosiy and v_yon = 'kirim') or (not v_sh.asosiy and v_yon = 'chiqim') then 'tolov' else 'qaytarim' end;
      v_op := md5(p_kompaniya_id::text || ':' || (v_e->>'kalit'))::uuid;
      if exists (select 1 from public.t2_tolov where operation_id = v_op)
         or (v_raqam is not null and exists (select 1 from public.t2_tolov where shartnoma_id = v_sh.id and sana = v_sana and hujjat_raqam = v_raqam and summa = v_summa and tur = v_tur)) then
        v_takror := v_takror + 1;
        v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'holat', 'takror'));
      else
        insert into public.t2_tolov(kompaniya_id, shartnoma_id, sana, summa, tur, izoh, operation_id, kim, hujjat_raqam, manba)
        values (p_kompaniya_id, v_sh.id, v_sana, v_summa, v_tur, nullif(left(coalesce(v_e->>'izoh', ''), 500), ''), v_op, 'actor:' || p_actor_id, v_raqam, 'bank_import');
        v_yangi := v_yangi + 1;
        v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'holat', 'yangi'));
      end if;
    exception when others then
      v_xato := v_xato + 1;
      v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'holat', 'xato', 'code', left(sqlerrm, 120)));
    end;
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_bank_import', 'buxgalteriya', null, format('qator=%s yangi=%s takror=%s xato=%s', v_i, v_yangi, v_takror, v_xato), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'yangi', v_yangi, 'takror', v_takror, 'xato', v_xato, 'natija', v_natija);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_bank_import_v1', v_res);
  return v_res;
end $$;

-- KADRLAR / boshqa modullar uchun ilgak: modul o'z hujjatlaridan "bo'lishi kerak" qatorlarni beradi; sinxron faqat deltani yozadi (idempotent, storno bilan).
-- qatorlar: [{manba_id, sana, dt_kod, kt_kod, summa, kontragent_id?, shartnoma_id?, obyekt_id?}]; manba_tur faqat hr_* (kadrlar, masalan hr_ish_haqi) yoki tr_* (logistika/transport, masalan tr_mash_xarajat).
create or replace function public.t2_bux_tashqi_sync_v1(p_actor_id bigint, p_kompaniya_id bigint, p_manba_tur text, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_kerak jsonb; v_sync jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if p_manba_tur is null or p_manba_tur !~ '^(hr|tr)_[a-z0-9_]{1,30}$' then return jsonb_build_object('ok', false, 'code', 'MANBA_TUR_HR'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 5000 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_0_5000'); end if;
  if exists (
    select 1 from jsonb_to_recordset(p_qatorlar) as x(manba_id bigint, sana date, dt_kod text, kt_kod text, summa numeric)
     where x.manba_id is null or x.sana is null or x.summa is null or x.summa = 0 or x.dt_kod = x.kt_kod
        or (select count(*) from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.faol and h.kod in (x.dt_kod, x.kt_kod)) <> 2) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('manba_tur', p_manba_tur, 'manba_id', x.manba_id, 'qism', 'asosiy', 'sana', x.sana, 'dt_kod', x.dt_kod, 'kt_kod', x.kt_kod,
           'summa', round(x.summa, 2), 'kontragent_id', x.kontragent_id, 'shartnoma_id', x.shartnoma_id, 'obyekt_id', x.obyekt_id)), '[]'::jsonb)
    into v_kerak
    from jsonb_to_recordset(p_qatorlar) as x(manba_id bigint, sana date, dt_kod text, kt_kod text, summa numeric, kontragent_id bigint, shartnoma_id bigint, obyekt_id bigint);
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_sync:' || p_kompaniya_id, 0));
  v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id, array[p_manba_tur], v_kerak, false);
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_tashqi_sync', 'buxgalteriya', null, format('manba=%s yangi=%s storno=%s', p_manba_tur, v_sync->>'yangi', v_sync->>'storno'), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true) || v_sync;
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_tashqi_sync_v1', v_res);
  return v_res;
end $$;

-- Ruxsatlar: faqat service_role (BFF). Ichki yordamchilar hech kimga ochiq emas.
revoke all on function public._t2_bux_ruxsat(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public._t2_bux_sh_kontragent(bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_sh_obyekt(bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_hujjat_nomi(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_sync(bigint, bigint, text[], jsonb, boolean) from public, anon, authenticated;
revoke all on function public._t2_bux_kerak_avto(bigint) from public, anon, authenticated;

revoke all on function public.t2_bux_holat_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_jurnal_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_osv_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_kontragent_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_nds_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_tolov_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_boshlash_v1(bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_hisob_saqla_v1(bigint, bigint, text, text, text, text, boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_moslik_saqla_v1(bigint, bigint, text, text, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_avto_provodka_v1(bigint, bigint, boolean, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_qolda_provodka_v1(bigint, bigint, date, text, text, numeric, bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_storno_v1(bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_davr_v1(bigint, bigint, date, text, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_bank_import_v1(bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_tashqi_sync_v1(bigint, bigint, text, jsonb, uuid) from public, anon, authenticated;

grant execute on function public.t2_bux_holat_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_jurnal_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_osv_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_kontragent_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_nds_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_tolov_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_boshlash_v1(bigint, bigint, uuid) to service_role;
grant execute on function public.t2_bux_hisob_saqla_v1(bigint, bigint, text, text, text, text, boolean, boolean, uuid) to service_role;
grant execute on function public.t2_bux_moslik_saqla_v1(bigint, bigint, text, text, text, numeric, uuid) to service_role;
grant execute on function public.t2_bux_avto_provodka_v1(bigint, bigint, boolean, uuid) to service_role;
grant execute on function public.t2_bux_qolda_provodka_v1(bigint, bigint, date, text, text, numeric, bigint, bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_bux_storno_v1(bigint, bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_bux_davr_v1(bigint, bigint, date, text, boolean, text, uuid) to service_role;
grant execute on function public.t2_bux_bank_import_v1(bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_bux_tashqi_sync_v1(bigint, bigint, text, jsonb, uuid) to service_role;

commit;
