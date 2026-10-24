-- T2 P1 TOPSHIRIQ (E7 §3: umumiy ish primitivi). Egasi: tomon-pudrat. F1b.
-- Tomonlar: kompaniya_id = BERUVCHI (egasi tenant), ijrochi_kompaniya_id (+ ixtiyoriy ijrochi_foydalanuvchi_id).
-- Hayot sikli: berildi -> qabul_qilindi | rad -> bajarilmoqda -> bajarildi (dalil) -> tasdiqlandi | qaytarildi ; bekor.
-- Holat o'tishi FAQAT RPC da. Hard delete yo'q. Boshqa tenant jadvaliga UPDATE yo'q: ijrochi o'z tomonidan o'tkazadi.
-- Bog'liqlik (F1, arxitektura): t2_outbox_yoz() va _t2_obyekt_doira_ok() hali bo'lmasligi mumkin — mavjud bo'lsa
-- chaqiriladi (to_regprocedure), bo'lmasa o'tkazib yuboriladi; F1 tushgach qayta migratsiya shart emas.
-- Dalil: hozircha t2_topshiriq_otish.dalil_hujjat_idlar (bigint[]); F1 t2_primitiv_dalil tushgach shunga ko'chiriladi.

create table if not exists public.t2_topshiriq (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  tur text not null default 'ish' check (tur in ('ish','reys','tamir','tekshiruv','tuzatish','boshqa')),
  ijrochi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  ijrochi_foydalanuvchi_id bigint references public.t2_foydalanuvchi(id),
  aloqa_id bigint references public.t2_tomon_aloqa(id),
  sarlavha text not null check (length(btrim(sarlavha)) between 1 and 200),
  matn text check (matn is null or length(matn) <= 4000),
  muddat date,
  manba jsonb,
  meta jsonb check (meta is null or length(meta::text) <= 2048),
  holat text not null default 'berildi'
    check (holat in ('berildi','qabul_qilindi','rad','bajarilmoqda','bajarildi','tasdiqlandi','qaytarildi','bekor')),
  oxirgi_izoh text check (oxirgi_izoh is null or length(oxirgi_izoh) <= 1000),
  versiya integer not null default 1 check (versiya > 0),
  operation_id uuid not null,
  yaratdi_actor_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, operation_id),
  check (ijrochi_kompaniya_id = kompaniya_id or aloqa_id is not null)
);
create index if not exists t2_topshiriq_k_o_idx on public.t2_topshiriq (kompaniya_id, obyekt_id, id desc);
create index if not exists t2_topshiriq_ijrochi_idx on public.t2_topshiriq (ijrochi_kompaniya_id, holat, id desc);
create index if not exists t2_topshiriq_ijrochi_user_idx on public.t2_topshiriq (ijrochi_foydalanuvchi_id, holat, id desc) where ijrochi_foydalanuvchi_id is not null;
alter table public.t2_topshiriq enable row level security;
revoke all on public.t2_topshiriq from anon, authenticated;

create table if not exists public.t2_topshiriq_otish (
  id bigint generated always as identity primary key,
  topshiriq_id bigint not null references public.t2_topshiriq(id),
  kompaniya_id bigint not null references public.t2_kompaniya(id),  -- o'tkazuvchi actor tenanti
  eski_holat text,
  yangi_holat text not null,
  izoh text check (izoh is null or length(izoh) <= 1000),
  dalil_hujjat_idlar bigint[] not null default '{}' check (cardinality(dalil_hujjat_idlar) <= 20),
  actor_id bigint not null references public.t2_foydalanuvchi(id),
  operation_id uuid not null,
  yaratildi timestamptz not null default now(),
  unique (kompaniya_id, operation_id)
);
create index if not exists t2_topshiriq_otish_t_idx on public.t2_topshiriq_otish (topshiriq_id, id);
alter table public.t2_topshiriq_otish enable row level security;
revoke all on public.t2_topshiriq_otish from anon, authenticated;

-- ── ichki yordamchilar ──
create or replace function public._t2_topshiriq_hodisa(p_kompaniya_id bigint, p_mavzu text, p_id bigint, p_yuk jsonb, p_actor_id bigint, p_op uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid)') is not null then
    execute 'select public.t2_outbox_yoz($1,$2,$3,$4,$5,$6,$7)' using p_kompaniya_id, p_mavzu, 't2_topshiriq', p_id, p_yuk, p_actor_id, p_op;
  end if;
end $$;

create or replace function public._t2_topshiriq_doira(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v boolean;
begin
  if p_obyekt_id is null then return true; end if;
  if to_regprocedure('public._t2_obyekt_doira_ok(bigint,bigint,bigint)') is null then return true; end if;
  execute 'select public._t2_obyekt_doira_ok($1,$2,$3)' into v using p_actor_id, p_kompaniya_id, p_obyekt_id;
  return coalesce(v, false);
end $$;

-- ── BER ──
create or replace function public.t2_topshiriq_ber_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_tur text,
  p_ijrochi_kompaniya_id bigint, p_ijrochi_foydalanuvchi_id bigint, p_aloqa_id bigint, p_obyekt_id bigint,
  p_sarlavha text, p_matn text, p_muddat date, p_manba jsonb, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.t2_topshiriq; v_row public.t2_topshiriq; v_ij bigint := coalesce(p_ijrochi_kompaniya_id, p_kompaniya_id);
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_topshiriq where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id, 'versiya', v_old.versiya); end if;
  if p_sarlavha is null or length(btrim(p_sarlavha)) = 0 then return jsonb_build_object('ok', false, 'code', 'SARLAVHA_KERAK'); end if;
  if coalesce(p_tur, 'ish') not in ('ish','reys','tamir','tekshiruv','tuzatish','boshqa') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if p_obyekt_id is not null then
    if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA');
    end if;
    if not public._t2_topshiriq_doira(p_actor_id, p_kompaniya_id, p_obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'DOIRA_YOQ');
    end if;
  end if;
  if not exists (select 1 from public.t2_kompaniya k where k.id = v_ij and k.faol) then
    return jsonb_build_object('ok', false, 'code', 'IJROCHI_YOQ');
  end if;
  if v_ij <> p_kompaniya_id then
    -- kompaniyalararo: faol aloqa majburiy va aynan shu ikki tomon orasida
    if p_aloqa_id is null or not exists (
      select 1 from public.t2_tomon_aloqa a where a.id = p_aloqa_id and a.holat = 'faol'
         and ((a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = v_ij)
           or (a.qabul_kompaniya_id = p_kompaniya_id and a.taklif_kompaniya_id = v_ij))) then
      return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ');
    end if;
  end if;
  if p_ijrochi_foydalanuvchi_id is not null and not exists (
    select 1 from public.t2_azolik z where z.kompaniya_id = v_ij and z.foydalanuvchi_id = p_ijrochi_foydalanuvchi_id and z.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'IJROCHI_AZO_EMAS');
  end if;
  insert into public.t2_topshiriq (kompaniya_id, obyekt_id, tur, ijrochi_kompaniya_id, ijrochi_foydalanuvchi_id, aloqa_id,
      sarlavha, matn, muddat, manba, meta, operation_id, yaratdi_actor_id)
  values (p_kompaniya_id, p_obyekt_id, coalesce(p_tur, 'ish'), v_ij, p_ijrochi_foydalanuvchi_id, case when v_ij <> p_kompaniya_id then p_aloqa_id end,
      btrim(p_sarlavha), nullif(btrim(p_matn), ''), p_muddat, p_manba, p_meta, p_operation_id, p_actor_id)
  returning * into v_row;
  insert into public.t2_topshiriq_otish (topshiriq_id, kompaniya_id, eski_holat, yangi_holat, actor_id, operation_id)
  values (v_row.id, p_kompaniya_id, null, 'berildi', p_actor_id, p_operation_id);
  perform public._t2_topshiriq_hodisa(p_kompaniya_id, 'topshiriq.berildi', v_row.id,
    jsonb_build_object('obyekt_id', v_row.obyekt_id, 'tur', v_row.tur, 'ijrochi_kompaniya_id', v_row.ijrochi_kompaniya_id), p_actor_id, p_operation_id);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya);
end $$;

-- ── O'TISH ──
create or replace function public.t2_topshiriq_otish_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_topshiriq_id bigint, p_kutilgan_versiya integer,
  p_holat text, p_izoh text, p_dalil_hujjat_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_topshiriq; v_rol text; v_taraf text; v_old public.t2_topshiriq_otish; v_ok boolean := false; v_yangi integer;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_topshiriq_otish where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.topshiriq_id, 'versiya', (select versiya from public.t2_topshiriq where id = v_old.topshiriq_id));
  end if;
  if p_holat not in ('qabul_qilindi','rad','bajarilmoqda','bajarildi','tasdiqlandi','qaytarildi','bekor') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI');
  end if;
  if p_dalil_hujjat_idlar is not null and cardinality(p_dalil_hujjat_idlar) > 20 then return jsonb_build_object('ok', false, 'code', 'DALIL_KOP'); end if;
  select * into t from public.t2_topshiriq where id = p_topshiriq_id
     and (kompaniya_id = p_kompaniya_id or ijrochi_kompaniya_id = p_kompaniya_id) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;   -- mavjudligini oshkor qilmaydi
  if p_kutilgan_versiya is null or t.versiya <> p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', t.versiya);
  end if;
  -- qaysi tomon: ijrochi harakatlari / beruvchi harakatlari
  if p_holat in ('qabul_qilindi','rad','bajarilmoqda','bajarildi') then
    v_taraf := 'ijrochi';
    if t.ijrochi_kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TOMON_NOTOGRI'); end if;
    if v_rol in ('kuzatuvchi','buyurtmachi') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
    if t.ijrochi_foydalanuvchi_id is not null and t.ijrochi_foydalanuvchi_id <> p_actor_id
       and v_rol in ('usta','brigadir','haydovchi') then
      return jsonb_build_object('ok', false, 'code', 'IJROCHI_EMAS');
    end if;
  else
    v_taraf := 'beruvchi';
    if t.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TOMON_NOTOGRI'); end if;
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  end if;
  v_ok := case
    when t.holat = 'berildi'       and p_holat in ('qabul_qilindi','rad','bekor') then true
    when t.holat = 'qabul_qilindi' and p_holat in ('bajarilmoqda','bekor') then true
    when t.holat = 'bajarilmoqda'  and p_holat in ('bajarildi','bekor') then true
    when t.holat = 'bajarildi'     and p_holat in ('tasdiqlandi','qaytarildi') then true
    when t.holat = 'qaytarildi'    and p_holat in ('bajarilmoqda','bekor') then true
    else false end;
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'OTISH_MUMKIN_EMAS', 'holat', t.holat); end if;
  if p_holat = 'rad' and (p_izoh is null or length(btrim(p_izoh)) = 0) then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK'); end if;
  update public.t2_topshiriq set holat = p_holat, oxirgi_izoh = left(nullif(btrim(p_izoh), ''), 1000), versiya = versiya + 1, yangilandi = now()
   where id = t.id and versiya = p_kutilgan_versiya returning versiya into v_yangi;
  if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI'); end if;
  insert into public.t2_topshiriq_otish (topshiriq_id, kompaniya_id, eski_holat, yangi_holat, izoh, dalil_hujjat_idlar, actor_id, operation_id)
  values (t.id, p_kompaniya_id, t.holat, p_holat, left(nullif(btrim(p_izoh), ''), 1000), coalesce(p_dalil_hujjat_idlar, '{}'), p_actor_id, p_operation_id);
  perform public._t2_topshiriq_hodisa(t.kompaniya_id, 'topshiriq.' || p_holat, t.id,
    jsonb_build_object('obyekt_id', t.obyekt_id, 'tur', t.tur, 'taraf', v_taraf), p_actor_id, p_operation_id);
  return jsonb_build_object('ok', true, 'id', t.id, 'versiya', v_yangi, 'holat', p_holat);
end $$;

-- ── RO'YXAT (keyset) ──
create or replace function public.t2_topshiriqlar_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_obyekt_id bigint, p_limit integer, p_keyin_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rol text; v_lim integer := least(greatest(coalesce(p_limit, 30), 1), 100); v_q jsonb; v_son integer; v_oxirgi bigint;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_yonalish not in ('menga','mendan') then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'tur', q.tur, 'holat', q.holat, 'sarlavha', q.sarlavha, 'matn', q.matn, 'muddat', q.muddat,
      'obyekt_id', q.obyekt_id, 'obyekt_nom', q.obyekt_nom, 'beruvchi_kompaniya_id', q.kompaniya_id, 'beruvchi_nom', q.beruvchi_nom,
      'ijrochi_kompaniya_id', q.ijrochi_kompaniya_id, 'ijrochi_foydalanuvchi_id', q.ijrochi_foydalanuvchi_id,
      'oxirgi_izoh', q.oxirgi_izoh, 'versiya', q.versiya, 'yaratildi', q.yaratildi, 'yangilandi', q.yangilandi) order by q.id desc)
      filter (where q.rn <= v_lim), '[]'::jsonb),
    count(*), min(q.id) filter (where q.rn <= v_lim)
    into v_q, v_son, v_oxirgi
  from (
    select t.*, k.nom as beruvchi_nom, o.nom as obyekt_nom, row_number() over (order by t.id desc) as rn
      from public.t2_topshiriq t
      join public.t2_kompaniya k on k.id = t.kompaniya_id
      left join public.t2_obyekt o on o.id = t.obyekt_id
     where (p_keyin_id is null or t.id < p_keyin_id)
       and (p_holat is null or t.holat = p_holat)
       and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id)
       and (case when p_yonalish = 'menga'
                 then t.ijrochi_kompaniya_id = p_kompaniya_id
                      and (v_rol not in ('usta','brigadir','haydovchi') or t.ijrochi_foydalanuvchi_id = p_actor_id)
                 else t.kompaniya_id = p_kompaniya_id end)
     order by t.id desc limit v_lim + 1) q;
  return jsonb_build_object('ok', true, 'qatorlar', v_q, 'keyingi_id', case when v_son > v_lim then v_oxirgi end);
end $$;
revoke all on function public._t2_topshiriq_hodisa(bigint,text,bigint,jsonb,bigint,uuid) from public, anon, authenticated;
revoke all on function public._t2_topshiriq_doira(bigint,bigint,bigint) from public, anon, authenticated;
revoke all on function public.t2_topshiriq_ber_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,text,text,date,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.t2_topshiriq_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[]) from public, anon, authenticated;
revoke all on function public.t2_topshiriqlar_v1(bigint,bigint,text,text,bigint,integer,bigint) from public, anon, authenticated;
grant execute on function public._t2_topshiriq_hodisa(bigint,text,bigint,jsonb,bigint,uuid) to service_role;
grant execute on function public._t2_topshiriq_doira(bigint,bigint,bigint) to service_role;
grant execute on function public.t2_topshiriq_ber_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,text,text,date,jsonb,jsonb) to service_role;
grant execute on function public.t2_topshiriq_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,bigint[]) to service_role;
grant execute on function public.t2_topshiriqlar_v1(bigint,bigint,text,text,bigint,integer,bigint) to service_role;
