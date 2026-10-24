-- T2 SUBPUDRAT DOIRASI (tomon-pudrat, A). Bosh pudratchi (GC) o'z smeta doirasini subpudratchiga bo'ladi.
-- Asl smeta (t2_qator) O'ZGARMAYDI: subpudrat hajmi va NARXI alohida qatlamda (t2_subpudrat_qator), narx NDS siz.
-- Pul faqat hajm x narx; narx NULL = noma'lum (0 emas, to'qib chiqarilmaydi). Ustamali summa bazada HISOBLANMAYDI:
-- RPC xom (ustamasiz) summalarni qaytaradi, ustamali ko'rinish frontendda lib/ustamali-summa.ts + SummaJuft orqali.
-- Subpudratchi kirishi: sub_kompaniya_id a'zosi + faol t2_tomon_aloqa(turi='subpudrat') + subpudrat holati faol/yopilgan.
-- U FAQAT o'z doirasini ko'radi, buyurtmachi narxi va marjani KO'RMAYDI (RPC qaytarmaydi).
-- Resurs 'subpudrat_doira' t2_tomon_resurs ga faol=false bilan yoziladi (E2 §5): umumiy grant sifatida hali ochilmaydi,
-- kirish shartnoma-doirali (subpudrat_id) va aloqa holatiga bog'liq.

create table if not exists public.t2_subpudrat_shartnoma (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- bosh pudratchi (egasi tenant)
  asosiy_shartnoma_id bigint references public.t2_shartnoma(id),              -- GC <-> buyurtmachi shartnomasi (ixtiyoriy)
  sub_kompaniya_id bigint references public.t2_kompaniya(id),                 -- platformadagi subpudratchi
  sub_kontragent_id bigint,                                                   -- platformada yo'q: GC kontragenti (mantiqiy havola)
  aloqa_id bigint references public.t2_tomon_aloqa(id),
  raqam text not null check (length(btrim(raqam)) between 1 and 60),
  nom text check (nom is null or length(nom) <= 200),
  avans_foiz numeric check (avans_foiz is null or (avans_foiz >= 0 and avans_foiz <= 100)),
  ushlab_qolish_foiz numeric check (ushlab_qolish_foiz is null or (ushlab_qolish_foiz >= 0 and ushlab_qolish_foiz <= 100)),
  holat text not null default 'qoralama' check (holat in ('qoralama','faol','yopilgan','bekor')),
  versiya integer not null default 1 check (versiya > 0),
  operation_id uuid not null,
  yaratdi_actor_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, operation_id),
  unique (kompaniya_id, raqam),
  check (sub_kompaniya_id is not null or sub_kontragent_id is not null),
  check (sub_kompaniya_id is null or aloqa_id is not null),
  check (sub_kompaniya_id is distinct from kompaniya_id)
);
create index if not exists t2_subpudrat_sh_k_idx on public.t2_subpudrat_shartnoma (kompaniya_id, id desc);
create index if not exists t2_subpudrat_sh_sub_idx on public.t2_subpudrat_shartnoma (sub_kompaniya_id, holat, id desc) where sub_kompaniya_id is not null;
alter table public.t2_subpudrat_shartnoma enable row level security;
revoke all on public.t2_subpudrat_shartnoma from anon, authenticated;

create table if not exists public.t2_subpudrat_qator (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  subpudrat_id bigint not null references public.t2_subpudrat_shartnoma(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  qator_id bigint not null references public.t2_qator(id),
  hajm numeric check (hajm is null or hajm >= 0),                            -- NULL = noma'lum
  narx numeric check (narx is null or narx >= 0),                            -- subpudrat narxi, NDS siz; NULL = narxsiz
  holat text not null default 'faol' check (holat in ('faol','bekor')),
  versiya integer not null default 1 check (versiya > 0),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_subpudrat_qator_faol_uq on public.t2_subpudrat_qator (subpudrat_id, qator_id) where holat = 'faol';
create index if not exists t2_subpudrat_qator_q_idx on public.t2_subpudrat_qator (qator_id) where holat = 'faol';
create index if not exists t2_subpudrat_qator_s_idx on public.t2_subpudrat_qator (subpudrat_id, obyekt_id) where holat = 'faol';
alter table public.t2_subpudrat_qator enable row level security;
revoke all on public.t2_subpudrat_qator from anon, authenticated;

create table if not exists public.t2_subpudrat_amal (                          -- idempotentlik
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  operation_id uuid not null,
  natija jsonb not null,
  yaratildi timestamptz not null default now(),
  primary key (kompaniya_id, operation_id)
);
alter table public.t2_subpudrat_amal enable row level security;
revoke all on public.t2_subpudrat_amal from anon, authenticated;

insert into public.t2_tomon_resurs (kalit, nom, nom_ru, guruh, amallar, taqdim_mumkin, faol, tartib, izoh)
values ('subpudrat_doira', 'Subpudrat doirasi', 'Объём субподряда', 'jadval', array['korish'], false, false, 90,
        'Shartnoma-doirali; kirish t2_subpudrat_shartnoma + faol aloqa orqali, umumiy grant emas')
on conflict (kalit) do nothing;

-- ── SHARTNOMA (sarlavha) saqlash ──
create or replace function public.t2_subpudrat_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_kutilgan_versiya integer, p_malumot jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint := nullif(p_malumot->>'id', '')::bigint; v_old public.t2_subpudrat_shartnoma; v_row public.t2_subpudrat_shartnoma;
  v_prev jsonb; v_sub bigint := nullif(p_malumot->>'sub_kompaniya_id', '')::bigint; v_aloqa bigint := nullif(p_malumot->>'aloqa_id', '')::bigint;
  v_kontr bigint := nullif(p_malumot->>'sub_kontragent_id', '')::bigint; v_as bigint := nullif(p_malumot->>'asosiy_shartnoma_id', '')::bigint;
  v_holat text := coalesce(p_malumot->>'holat', 'qoralama'); v_res jsonb; v_yangi integer;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select natija into v_prev from public.t2_subpudrat_amal where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  if v_holat not in ('qoralama','faol','yopilgan','bekor') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  if v_as is not null and not exists (select 1 from public.t2_shartnoma s where s.id = v_as and s.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_BEGONA');
  end if;
  if v_sub is not null then
    if v_sub = p_kompaniya_id or v_aloqa is null or not exists (
      select 1 from public.t2_tomon_aloqa a where a.id = v_aloqa and a.holat = 'faol' and a.turi = 'subpudrat'
         and ((a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = v_sub)
           or (a.qabul_kompaniya_id = p_kompaniya_id and a.taklif_kompaniya_id = v_sub))) then
      return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ');
    end if;
  elsif v_kontr is null then
    return jsonb_build_object('ok', false, 'code', 'SUB_KERAK');
  end if;
  if v_id is null then
    if length(btrim(coalesce(p_malumot->>'raqam', ''))) = 0 then return jsonb_build_object('ok', false, 'code', 'RAQAM_KERAK'); end if;
    if exists (select 1 from public.t2_subpudrat_shartnoma where kompaniya_id = p_kompaniya_id and raqam = btrim(p_malumot->>'raqam')) then
      return jsonb_build_object('ok', false, 'code', 'RAQAM_BAND');
    end if;
    insert into public.t2_subpudrat_shartnoma (kompaniya_id, asosiy_shartnoma_id, sub_kompaniya_id, sub_kontragent_id, aloqa_id, raqam, nom,
        avans_foiz, ushlab_qolish_foiz, holat, operation_id, yaratdi_actor_id)
    values (p_kompaniya_id, v_as, v_sub, v_kontr, case when v_sub is not null then v_aloqa end, btrim(p_malumot->>'raqam'), nullif(btrim(p_malumot->>'nom'), ''),
        nullif(p_malumot->>'avans_foiz', '')::numeric, nullif(p_malumot->>'ushlab_qolish_foiz', '')::numeric,
        case when v_holat = 'bekor' then 'qoralama' else v_holat end, p_operation_id, p_actor_id)
    returning * into v_row;
    v_res := jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya);
  else
    select * into v_old from public.t2_subpudrat_shartnoma where id = v_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
    if p_kutilgan_versiya is null or v_old.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_old.versiya); end if;
    if v_old.holat in ('yopilgan','bekor') then return jsonb_build_object('ok', false, 'code', 'YOPIQ'); end if;
    if not (v_holat = v_old.holat or (v_old.holat = 'qoralama' and v_holat in ('faol','bekor')) or (v_old.holat = 'faol' and v_holat in ('yopilgan','bekor'))) then
      return jsonb_build_object('ok', false, 'code', 'OTISH_MUMKIN_EMAS');
    end if;
    update public.t2_subpudrat_shartnoma set
        asosiy_shartnoma_id = v_as, sub_kompaniya_id = v_sub, sub_kontragent_id = v_kontr, aloqa_id = case when v_sub is not null then v_aloqa end,
        nom = nullif(btrim(p_malumot->>'nom'), ''),
        avans_foiz = nullif(p_malumot->>'avans_foiz', '')::numeric, ushlab_qolish_foiz = nullif(p_malumot->>'ushlab_qolish_foiz', '')::numeric,
        holat = v_holat, versiya = versiya + 1, yangilandi = now()
     where id = v_id and versiya = p_kutilgan_versiya returning versiya into v_yangi;
    if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI'); end if;
    v_res := jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_yangi);
  end if;
  insert into public.t2_subpudrat_amal (kompaniya_id, operation_id, natija) values (p_kompaniya_id, p_operation_id, v_res);
  return v_res;
end $$;

-- ── QATORLAR (doira + subpudrat hajm/narx) ──
-- p_qatorlar: [{qator_id, hajm?, narx?, bekor?}]; hajm kaliti YO'Q bo'lsa asl hajm olinadi; narx kaliti yo'q/null = narxsiz.
-- p_razdel_id: razdel/blok ostidagi barcha hisobga kiruvchi qatorlar (rs, mat, ob) qo'shiladi (asl hajm, narxsiz).
create or replace function public.t2_subpudrat_qator_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_subpudrat_id bigint, p_kutilgan_versiya integer,
  p_qatorlar jsonb, p_razdel_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.t2_subpudrat_shartnoma; v_prev jsonb; e jsonb; q record; v_n integer := 0; v_bekor integer := 0; v_yangi integer; v_res jsonb; v_ogoh jsonb;
  v_qid bigint; v_hajm numeric; v_narx numeric;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select natija into v_prev from public.t2_subpudrat_amal where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  select * into s from public.t2_subpudrat_shartnoma where id = p_subpudrat_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if p_kutilgan_versiya is null or s.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', s.versiya); end if;
  if s.holat in ('yopilgan','bekor') then return jsonb_build_object('ok', false, 'code', 'YOPIQ'); end if;
  if p_qatorlar is not null and (jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 2000) then return jsonb_build_object('ok', false, 'code', 'QATORLAR_0_2000'); end if;

  -- razdel kengaytmasi: asl hajm, narxsiz; mavjud faol qatorlarga tegmaydi
  if p_razdel_id is not null then
    if not exists (select 1 from public.t2_qator r join public.t2_obyekt o on o.id = r.obyekt_id where r.id = p_razdel_id and o.kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'QATOR_BEGONA');
    end if;
    for q in
      with recursive d as (select id, obyekt_id, tur, hajm from public.t2_qator where ota_id = p_razdel_id
                           union all select c.id, c.obyekt_id, c.tur, c.hajm from public.t2_qator c join d on c.ota_id = d.id)
      select d.id, d.obyekt_id, d.hajm from d where d.tur in ('rs','mat','ob')
         and not exists (select 1 from public.t2_shartnoma_qator_qamrov m where s.asosiy_shartnoma_id is not null and m.shartnoma_id = s.asosiy_shartnoma_id and m.qator_id = d.id and m.holat = 'chiqarilgan')
    loop
      insert into public.t2_subpudrat_qator (kompaniya_id, subpudrat_id, obyekt_id, qator_id, hajm, narx)
      values (p_kompaniya_id, s.id, q.obyekt_id, q.id, q.hajm, null)
      on conflict (subpudrat_id, qator_id) where holat = 'faol' do nothing;
      v_n := v_n + 1;
    end loop;
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_qatorlar, '[]'::jsonb)) loop
    v_qid := nullif(e->>'qator_id', '')::bigint;
    select r.id, r.obyekt_id, r.hajm, r.tur into q from public.t2_qator r join public.t2_obyekt o on o.id = r.obyekt_id
     where r.id = v_qid and o.kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_BEGONA', 'qator_id', v_qid); end if;
    if coalesce((e->>'bekor')::boolean, false) then
      update public.t2_subpudrat_qator set holat = 'bekor', versiya = versiya + 1, yangilandi = now()
       where subpudrat_id = s.id and qator_id = v_qid and holat = 'faol';
      v_bekor := v_bekor + 1; continue;
    end if;
    if q.tur not in ('rs','mat','ob') then return jsonb_build_object('ok', false, 'code', 'QATOR_TURI', 'qator_id', v_qid); end if;
    if s.asosiy_shartnoma_id is not null and exists (select 1 from public.t2_shartnoma_qator_qamrov m
        where m.shartnoma_id = s.asosiy_shartnoma_id and m.qator_id = v_qid and m.holat = 'chiqarilgan') then
      return jsonb_build_object('ok', false, 'code', 'QAMROVDA_EMAS', 'qator_id', v_qid);
    end if;
    v_hajm := case when e ? 'hajm' then nullif(e->>'hajm', '')::numeric else q.hajm end;
    v_narx := nullif(e->>'narx', '')::numeric;
    if (v_hajm is not null and v_hajm < 0) or (v_narx is not null and v_narx < 0) then return jsonb_build_object('ok', false, 'code', 'QIYMAT_MANFIY', 'qator_id', v_qid); end if;
    update public.t2_subpudrat_qator set hajm = v_hajm, narx = v_narx, versiya = versiya + 1, yangilandi = now()
     where subpudrat_id = s.id and qator_id = v_qid and holat = 'faol';
    if not found then
      insert into public.t2_subpudrat_qator (kompaniya_id, subpudrat_id, obyekt_id, qator_id, hajm, narx)
      values (p_kompaniya_id, s.id, q.obyekt_id, v_qid, v_hajm, v_narx);
    end if;
    v_n := v_n + 1;
  end loop;

  update public.t2_subpudrat_shartnoma set versiya = versiya + 1, yangilandi = now() where id = s.id returning versiya into v_yangi;
  -- ogohlantirish (TO'SMAYDI): subpudratlar yig'indisi asl hajmdan oshgan qatorlar
  select coalesce(jsonb_agg(jsonb_build_object('qator_id', x.qator_id, 'asl_hajm', x.asl, 'subpudrat_jami', x.jami)), '[]'::jsonb) into v_ogoh
    from (select sq.qator_id, r.hajm as asl, sum(sq.hajm) as jami
            from public.t2_subpudrat_qator sq join public.t2_qator r on r.id = sq.qator_id
           where sq.holat = 'faol' and sq.qator_id in (select qator_id from public.t2_subpudrat_qator where subpudrat_id = s.id and holat = 'faol')
           group by sq.qator_id, r.hajm having r.hajm is not null and sum(sq.hajm) > r.hajm) x;
  v_res := jsonb_build_object('ok', true, 'id', s.id, 'versiya', v_yangi, 'saqlandi', v_n, 'bekor', v_bekor, 'ogohlantirish', v_ogoh);
  insert into public.t2_subpudrat_amal (kompaniya_id, operation_id, natija) values (p_kompaniya_id, p_operation_id, v_res);
  return v_res;
end $$;

-- ── RO'YXAT ──
create or replace function public.t2_subpudrat_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_yonalish not in ('meniki','menga') then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI'); end if;
  if p_yonalish = 'meniki' then perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read'); end if;
  return jsonb_build_object('ok', true, 'shartnomalar', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'raqam', s.raqam, 'nom', s.nom, 'holat', s.holat, 'versiya', s.versiya, 'asosiy_shartnoma_id', s.asosiy_shartnoma_id,
        'sub_kompaniya_id', s.sub_kompaniya_id, 'sub_kontragent_id', s.sub_kontragent_id,
        'sub_nom', (select k.nom from public.t2_kompaniya k where k.id = s.sub_kompaniya_id),
        'bosh_nom', (select k.nom from public.t2_kompaniya k where k.id = s.kompaniya_id),
        'avans_foiz', s.avans_foiz, 'ushlab_qolish_foiz', s.ushlab_qolish_foiz,
        'qator_soni', t.soni, 'narxsiz_soni', t.narxsiz,
        'summa_ustamasiz', t.summa) order by s.id desc), '[]'::jsonb)
      from public.t2_subpudrat_shartnoma s
      cross join lateral (select count(*) as soni, count(*) filter (where q.narx is null or q.hajm is null) as narxsiz,
                                 sum(q.hajm * q.narx) as summa
                            from public.t2_subpudrat_qator q where q.subpudrat_id = s.id and q.holat = 'faol') t
     where case when p_yonalish = 'meniki' then s.kompaniya_id = p_kompaniya_id
                else s.sub_kompaniya_id = p_kompaniya_id and s.holat in ('faol','yopilgan')
                     and exists (select 1 from public.t2_tomon_aloqa a where a.id = s.aloqa_id and a.holat = 'faol' and a.turi = 'subpudrat') end));
end $$;

-- ── QAMROV: egasi (marja bilan) va subpudratchi (faqat o'z doirasi) ──
create or replace function public.t2_subpudrat_qamrov_v1(p_actor_id bigint, p_kompaniya_id bigint, p_subpudrat_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.t2_subpudrat_shartnoma; v_egasi boolean;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into s from public.t2_subpudrat_shartnoma x where x.id = p_subpudrat_id and (x.kompaniya_id = p_kompaniya_id or x.sub_kompaniya_id = p_kompaniya_id);
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_egasi := s.kompaniya_id = p_kompaniya_id;
  if v_egasi then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  else
    if s.holat not in ('faol','yopilgan') or not exists (select 1 from public.t2_tomon_aloqa a where a.id = s.aloqa_id and a.holat = 'faol' and a.turi = 'subpudrat') then
      return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'egasi', v_egasi,
    'shartnoma', jsonb_build_object('id', s.id, 'raqam', s.raqam, 'nom', s.nom, 'holat', s.holat, 'versiya', s.versiya,
        'avans_foiz', s.avans_foiz, 'ushlab_qolish_foiz', s.ushlab_qolish_foiz),
    'qatorlar', (
      select coalesce(jsonb_agg(
        jsonb_build_object('qator_id', r.id, 'obyekt_id', r.obyekt_id, 'tur', r.tur, 'kod', r.kod, 'nom', r.nom, 'birlik', r.birlik, 'ota_id', r.ota_id,
            'hajm', q.hajm, 'narx', q.narx, 'summa_ustamasiz', q.hajm * q.narx)
        || case when v_egasi then jsonb_build_object('asl_hajm', r.hajm, 'asl_narx', r.narx, 'asl_summa', r.summa, 'kat', r.kat,
              'marja_ustamasiz', case when r.summa is not null and q.hajm is not null and q.narx is not null then r.summa - q.hajm * q.narx end,
              'qamrov_hajm_ogohlantirish', (select sum(z.hajm) > r.hajm from public.t2_subpudrat_qator z where z.qator_id = r.id and z.holat = 'faol' and r.hajm is not null)) else '{}'::jsonb end
        order by r.obyekt_id, r.id), '[]'::jsonb)
        from public.t2_subpudrat_qator q join public.t2_qator r on r.id = q.qator_id
       where q.subpudrat_id = s.id and q.holat = 'faol'),
    'jami', (
      select jsonb_build_object('qator_soni', count(*), 'narxsiz_soni', count(*) filter (where q.narx is null or q.hajm is null),
          'subpudrat_summa_ustamasiz', sum(q.hajm * q.narx))
        || case when v_egasi then jsonb_build_object('asl_summa_ustamasiz', sum(r.summa) filter (where q.narx is not null and q.hajm is not null),
              'marja_ustamasiz', sum(r.summa - q.hajm * q.narx) filter (where r.summa is not null and q.narx is not null and q.hajm is not null)) else '{}'::jsonb end
        from public.t2_subpudrat_qator q join public.t2_qator r on r.id = q.qator_id where q.subpudrat_id = s.id and q.holat = 'faol'));
end $$;

revoke all on function public.t2_subpudrat_saqla_v1(bigint,bigint,uuid,integer,jsonb) from public, anon, authenticated;
revoke all on function public.t2_subpudrat_qator_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint) from public, anon, authenticated;
revoke all on function public.t2_subpudrat_royxat_v1(bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.t2_subpudrat_qamrov_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_subpudrat_saqla_v1(bigint,bigint,uuid,integer,jsonb) to service_role;
grant execute on function public.t2_subpudrat_qator_saqla_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint) to service_role;
grant execute on function public.t2_subpudrat_royxat_v1(bigint,bigint,text) to service_role;
grant execute on function public.t2_subpudrat_qamrov_v1(bigint,bigint,bigint) to service_role;
