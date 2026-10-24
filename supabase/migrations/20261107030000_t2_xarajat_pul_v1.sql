-- 20261107030000 — Pul tahlili P1: haqiqiy xarajat (t2_xarajat additive) + qo'lda kiritish + Farq ustuni (t2_pul_tahlil_v2).
-- Additive: mavjud ustun/RPC lar (t2_xarajat_yoz/tahrir/ochir, bux dashboard) o'zgarmaydi; yangi ustunlar NULL ruxsat (eski qatorlar «kategoriyasiz»).
-- NULL ≠ 0: xarajat kiritilmagan kesim — noma'lum (null); farq/foiz faqat ikkala tomon ma'lum bo'lsa.
-- Yozish: actor-based security definer RPC (financial.write, a'zolik, idempotent operation_id). O'qish: financial.read. RLS kengaytirilmaydi (siyosatsiz jadval).
begin;

alter table public.t2_xarajat add column if not exists obyekt_id    bigint references public.t2_obyekt(id);
alter table public.t2_xarajat add column if not exists shartnoma_id bigint references public.t2_shartnoma(id);
alter table public.t2_xarajat add column if not exists kat          text;
alter table public.t2_xarajat add column if not exists manba        text;
alter table public.t2_xarajat add column if not exists hujjat_ref   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_xarajat_kat_chk') then
    alter table public.t2_xarajat add constraint t2_xarajat_kat_chk check (kat is null or kat in ('ЧЕЛ','МАШ','МАТ','ОБ','SUB','OTK'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_xarajat_manba_chk') then
    alter table public.t2_xarajat add constraint t2_xarajat_manba_chk check (manba is null or manba in ('glavbux_import','qolda'));
  end if;
end $$;
create index if not exists ix_t2_xarajat_obyekt on public.t2_xarajat (kompaniya_id, obyekt_id) where obyekt_id is not null;
create index if not exists ix_t2_xarajat_shartnoma on public.t2_xarajat (kompaniya_id, shartnoma_id) where shartnoma_id is not null;

-- Qo'lda kiritish (idempotent)
create or replace function public.t2_xarajat_kirit_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint,
  p_sana date, p_kat text, p_summa numeric, p_hujjat_ref text, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_id bigint; v_kim text; v_bor record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select id, kompaniya_id into v_bor from public.t2_xarajat where operation_id = p_operation_id;
  if found then
    if v_bor.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_CONFLICT'); end if;
    return jsonb_build_object('ok', true, 'takror', true, 'xarajat_id', v_bor.id);
  end if;
  if p_summa is null or p_summa = 0 then return jsonb_build_object('ok', false, 'code', 'SUMMA_INVALID'); end if;
  if p_sana is null then return jsonb_build_object('ok', false, 'code', 'SANA_REQUIRED'); end if;
  if p_kat is null or p_kat not in ('ЧЕЛ','МАШ','МАТ','ОБ','SUB','OTK') then return jsonb_build_object('ok', false, 'code', 'KAT_INVALID'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
  if p_shartnoma_id is not null and not exists (select 1 from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_SCOPE_MISMATCH'); end if;
  select coalesce(nullif(trim(f.ism), ''), f.id::text) into v_kim from public.t2_foydalanuvchi f where f.id = p_actor_id;
  insert into public.t2_xarajat (kompaniya_id, obyekt_id, shartnoma_id, sana, kat, toifa, summa, manba, hujjat_ref, izoh, operation_id, kim)
  values (p_kompaniya_id, p_obyekt_id, p_shartnoma_id, p_sana, p_kat, p_kat, p_summa, 'qolda',
          nullif(left(trim(coalesce(p_hujjat_ref, '')), 300), ''), nullif(left(trim(coalesce(p_izoh, '')), 1000), ''), p_operation_id, v_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'takror', false, 'xarajat_id', v_id);
end $fn$;

-- Bekor qilish (qatorni o'chirmaydi; holat='bekor')
create or replace function public.t2_xarajat_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_xarajat_id bigint, p_kutilgan_versiya integer default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_ver int; v_h text;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  select versiya, holat into v_ver, v_h from public.t2_xarajat where id = p_xarajat_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_h = 'bekor' then return jsonb_build_object('ok', true, 'takror', true, 'xarajat_id', p_xarajat_id); end if;
  if p_kutilgan_versiya is not null and v_ver <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT'); end if;
  update public.t2_xarajat set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_xarajat_id;
  return jsonb_build_object('ok', true, 'takror', false, 'xarajat_id', p_xarajat_id);
end $fn$;

-- Ro'yxat (dalil)
create or replace function public.t2_xarajat_royxat_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint default null, p_shartnoma_id bigint default null,
  p_davr_gacha date default null, p_davr_dan date default null, p_kat text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'sana', x.sana, 'kat', x.kat, 'summa', x.summa, 'obyekt_id', x.obyekt_id,
           'shartnoma_id', x.shartnoma_id, 'manba', x.manba, 'hujjat_ref', x.hujjat_ref, 'izoh', x.izoh, 'kim', x.kim, 'versiya', x.versiya)
           order by x.sana desc, x.id desc), '[]'::jsonb)
    into v_r from (
      select * from public.t2_xarajat x
       where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor'
         and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id) and (p_shartnoma_id is null or x.shartnoma_id = p_shartnoma_id)
         and (p_davr_dan is null or x.sana >= date_trunc('month', p_davr_dan)::date)
         and (p_davr_gacha is null or x.sana < (date_trunc('month', p_davr_gacha) + interval '1 month')::date)
         and (p_kat is null or (case when p_kat = 'KATSIZ' then x.kat is null else x.kat = p_kat end))
       order by x.sana desc, x.id desc limit 500) x;
  return jsonb_build_object('ok', true, 'qatorlar', v_r);
end $fn$;

-- Pul tahlili v2 = v1 (smeta, F2, ustamali, zanjir) + haqiqiy xarajat va Farq (xarajat − F2 ustamasiz)
create or replace function public.t2_pul_tahlil_v2(
  p_kompaniya_id bigint, p_actor_id bigint,
  p_obyekt_id bigint default null, p_shartnoma_id bigint default null,
  p_davr_gacha date default null, p_davr_dan date default null,
  p_dalil_kat text default null, p_dalil_turi text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  r jsonb; v_obs bigint[]; v_gacha_keyin date; v_dan date; v_xm jsonb := '{}'::jsonb; rec record; e jsonb; v_out jsonb := '[]'::jsonb;
  v_kat text; v_x numeric; v_f2 numeric; v_farq numeric; v_main numeric := 0; v_any boolean := false; v_all boolean := true; v_sub numeric := 0;
  v_bor int := 0; v_jami jsonb; v_asosiy text[] := array['ЧЕЛ','МАШ','МАТ','ОБ','KATSIZ']; v_dalil jsonb := null; v_jf2 numeric; v_qam int := 0;
begin
  r := public.t2_pul_tahlil_v1(p_kompaniya_id, p_actor_id, p_obyekt_id, p_shartnoma_id, p_davr_gacha, p_davr_dan,
         case when p_dalil_turi = 'xarajat' then null else p_dalil_kat end);
  if r->>'ok' <> 'true' then return r; end if;
  v_obs := array(select jsonb_array_elements_text(r->'qamrov'->'obyektlar')::bigint);
  v_gacha_keyin := case when p_davr_gacha is null then null else (date_trunc('month', p_davr_gacha) + interval '1 month')::date end;
  v_dan := case when p_davr_dan is null then null else date_trunc('month', p_davr_dan)::date end;

  for rec in
    select coalesce(x.kat, 'KATSIZ') as k, sum(x.summa) as s, count(*) as n
      from public.t2_xarajat x
     where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor'
       and (v_dan is null or x.sana >= v_dan) and (v_gacha_keyin is null or x.sana < v_gacha_keyin)
       and ((p_obyekt_id is null and p_shartnoma_id is null)
            or x.obyekt_id = any(v_obs) or (p_shartnoma_id is not null and x.shartnoma_id = p_shartnoma_id))
     group by 1
  loop
    v_xm := v_xm || jsonb_build_object(rec.k, rec.s);
    v_bor := v_bor + rec.n;
  end loop;

  for e in select * from jsonb_array_elements(r->'kesimlar') loop
    v_kat := e->>'kat';
    if v_kat in ('МАТ_ODDIY','М/К','КАБ','БЕЗСКЛАД') then
      v_out := v_out || jsonb_build_array(e);  -- МАТ ichki qatorlari: xarajat МАТ guruhida
      continue;
    end if;
    v_x := (v_xm ->> v_kat)::numeric;
    v_f2 := (e->>'f2_yopilgan')::numeric;
    v_farq := case when v_x is not null and v_f2 is not null and v_kat not in ('SUB','OTK') then round(v_x - v_f2, 2) end;
    e := e || jsonb_build_object('xarajat', v_x, 'farq', v_farq,
           'farq_foiz', case when v_farq is not null and v_f2 <> 0 then round(v_farq / v_f2 * 100, 1) end,
           'xarajat_holat', case when v_x is not null then 'malum' when v_kat in ('SUB','OTK') then 'hisoblanmagan' else 'kiritilmagan' end);
    v_out := v_out || jsonb_build_array(e);
    if v_kat = any(v_asosiy) then
      if v_x is not null then v_main := v_main + v_x; v_any := true; v_qam := v_qam + 1; end if;
      if v_x is null and coalesce(v_f2, 0) <> 0 then v_all := false; end if;
    elsif v_x is not null then v_sub := v_sub + v_x;
    end if;
  end loop;

  v_jami := r->'jami'; v_jf2 := (v_jami->>'f2_yopilgan')::numeric;
  v_jami := v_jami || jsonb_build_object(
    'xarajat', case when v_any then v_main end,
    'farq', case when v_any and v_all then round(v_main - v_jf2, 2) end,
    'farq_foiz', case when v_any and v_all and v_jf2 <> 0 then round((v_main - v_jf2) / v_jf2 * 100, 1) end,
    'xarajat_toliq', v_any and v_all, 'xarajat_sub_otk', case when v_sub <> 0 or v_xm ? 'SUB' or v_xm ? 'OTK' then v_sub end,
    'xarajat_qator_soni', v_bor);

  if p_dalil_turi = 'xarajat' and p_dalil_kat is not null then
    v_dalil := public.t2_xarajat_royxat_v1(p_kompaniya_id, p_actor_id, p_obyekt_id, p_shartnoma_id, p_davr_gacha, p_davr_dan, p_dalil_kat)->'qatorlar';
  end if;
  return (r - 'kesimlar' - 'jami') || jsonb_build_object('kesimlar', v_out, 'jami', v_jami)
         || case when v_dalil is not null then jsonb_build_object('dalil_turi', 'xarajat', 'dalil_kat', p_dalil_kat, 'dalil', v_dalil) else '{}'::jsonb end;
end $fn$;

revoke all on function public.t2_xarajat_kirit_v1(bigint, bigint, bigint, bigint, date, text, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_xarajat_bekor_v1(bigint, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.t2_xarajat_royxat_v1(bigint, bigint, bigint, bigint, date, date, text) from public, anon, authenticated;
revoke all on function public.t2_pul_tahlil_v2(bigint, bigint, bigint, bigint, date, date, text, text) from public, anon, authenticated;
grant execute on function public.t2_xarajat_kirit_v1(bigint, bigint, bigint, bigint, date, text, numeric, text, text, uuid) to service_role;
grant execute on function public.t2_xarajat_bekor_v1(bigint, bigint, bigint, integer) to service_role;
grant execute on function public.t2_xarajat_royxat_v1(bigint, bigint, bigint, bigint, date, date, text) to service_role;
grant execute on function public.t2_pul_tahlil_v2(bigint, bigint, bigint, bigint, date, date, text, text) to service_role;

commit;
