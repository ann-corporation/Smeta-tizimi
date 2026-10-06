-- AI: FAOLIYAT JURNALI (har qadam ko'rinadi), SHAXSIY SOZLAMALAR (ishonch darajasi), HARAKAT TAKLIFLARI (xavf bahosi, tasdiq oqimi).
-- Qonun: AI hech qachon biznes jadvalga yozmaydi. U harakat TAKLIF qiladi; server uni tekshirib (rol, obyekt egaligi, qiymatlar) xavf baholaydi;
-- foydalanuvchi tasdiqlaydi (yoki o'z sozlamasiga ko'ra past xavfda avto) va harakat foydalanuvchining O'Z sessiyasi bilan mavjud nomli gateway orqali bajariladi.
set local statement_timeout = '60s';

alter table public.t2_agent_kasb add column if not exists harakatlar text[] not null default array['eslatma']::text[];
update public.t2_agent_kasb set harakatlar = case rol
  when 'boss' then array['ombor_kirim','ombor_chiqim','grafik_foiz','eslatma']
  when 'admin' then array['ombor_kirim','ombor_chiqim','grafik_foiz','eslatma']
  when 'director' then array['ombor_kirim','ombor_chiqim','grafik_foiz','eslatma']
  when 'rahbar' then array['eslatma']
  when 'superadmin' then array['eslatma']
  when 'pto' then array['grafik_foiz','eslatma']
  when 'prorab' then array['ombor_kirim','ombor_chiqim','grafik_foiz','eslatma']
  when 'usta' then array['ombor_chiqim','grafik_foiz','eslatma']
  when 'skladchi' then array['ombor_kirim','ombor_chiqim','eslatma']
  when 'taminotchi' then array['ombor_kirim','eslatma']
  else array['eslatma'] end;

create table if not exists public.t2_agent_jurnal (
  id bigint generated always as identity primary key,
  sessiya uuid not null,
  vaqt timestamptz not null default now(),
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  actor_id bigint not null,
  profil_kod text,
  rol text,
  tur text not null check (tur in ('savol','rad','salom','xato')),
  savol text check (savol is null or length(savol) <= 600),
  javob text check (javob is null or length(javob) <= 2000),
  qadamlar jsonb not null default '[]'::jsonb,
  toifalar text[] not null default '{}',
  model text,
  kirish_token integer not null default 0,
  chiqish_token integer not null default 0,
  ms integer,
  rad boolean not null default false
);
create index if not exists t2_agent_jurnal_komp_ix on public.t2_agent_jurnal (kompaniya_id, vaqt desc);
create index if not exists t2_agent_jurnal_actor_ix on public.t2_agent_jurnal (actor_id, vaqt desc);

create table if not exists public.t2_agent_shaxsiy_sozlama (
  actor_id bigint primary key,
  til text not null default 'auto' check (til in ('auto','uz','ru')),
  uslub text not null default 'qisqa' check (uslub in ('qisqa','batafsil')),
  ishonch text not null default 'jiddiy' check (ishonch in ('sora','jiddiy','avto')),
  yangilandi timestamptz not null default now()
);

create table if not exists public.t2_agent_harakat (
  id bigint generated always as identity primary key,
  jurnal_id bigint references public.t2_agent_jurnal(id) on delete set null,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  actor_id bigint not null,
  amal text not null check (amal in ('ombor_kirim','ombor_chiqim','grafik_foiz','eslatma')),
  parametrlar jsonb not null,
  tushuntirish text check (tushuntirish is null or length(tushuntirish) <= 400),
  xavf text not null check (xavf in ('past','orta','yuqori')),
  avto boolean not null default false,
  ogohlantirish text,
  holat text not null default 'kutilmoqda' check (holat in ('kutilmoqda','tasdiqlandi','rad','bajarildi','xato')),
  natija jsonb,
  yaratildi timestamptz not null default now(),
  qaror_vaqt timestamptz
);
create index if not exists t2_agent_harakat_actor_ix on public.t2_agent_harakat (actor_id, yaratildi desc);

alter table public.t2_agent_jurnal enable row level security;
alter table public.t2_agent_shaxsiy_sozlama enable row level security;
alter table public.t2_agent_harakat enable row level security;
revoke all on public.t2_agent_jurnal, public.t2_agent_shaxsiy_sozlama, public.t2_agent_harakat from public, anon, authenticated;

create or replace function public.t2_agent_shaxsiy_v1(p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare z public.t2_agent_shaxsiy_sozlama%rowtype;
begin
  if p_actor_id is null or p_actor_id <= 0 or not exists (select 1 from t2_foydalanuvchi where id = p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  select * into z from t2_agent_shaxsiy_sozlama where actor_id = p_actor_id;
  return jsonb_build_object('ok', true, 'til', coalesce(z.til, 'auto'), 'uslub', coalesce(z.uslub, 'qisqa'), 'ishonch', coalesce(z.ishonch, 'jiddiy'));
end $$;

create or replace function public.t2_agent_shaxsiy_saqla_v1(p_actor_id bigint, p_til text, p_uslub text, p_ishonch text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or p_actor_id <= 0 or not exists (select 1 from t2_foydalanuvchi where id = p_actor_id) then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if p_til not in ('auto','uz','ru') or p_uslub not in ('qisqa','batafsil') or p_ishonch not in ('sora','jiddiy','avto') then return jsonb_build_object('ok', false, 'code', 'SOZLAMA_INVALID'); end if;
  insert into t2_agent_shaxsiy_sozlama (actor_id, til, uslub, ishonch) values (p_actor_id, p_til, p_uslub, p_ishonch)
  on conflict (actor_id) do update set til = excluded.til, uslub = excluded.uslub, ishonch = excluded.ishonch, yangilandi = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_agent_jurnal_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sessiya uuid, p_profil text, p_rol text, p_tur text, p_savol text, p_javob text,
  p_qadamlar jsonb, p_toifalar text[], p_model text, p_kirish integer, p_chiqish integer, p_ms integer, p_rad boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_id bigint;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null or p_tur not in ('savol','rad','salom','xato') then return jsonb_build_object('ok', false, 'code', 'JURNAL_INVALID'); end if;
  insert into t2_agent_jurnal (sessiya, kompaniya_id, actor_id, profil_kod, rol, tur, savol, javob, qadamlar, toifalar, model, kirish_token, chiqish_token, ms, rad)
  values (coalesce(p_sessiya, gen_random_uuid()), p_kompaniya_id, p_actor_id, left(p_profil, 40), left(p_rol, 30), p_tur, left(p_savol, 600), left(p_javob, 2000),
          case when jsonb_typeof(p_qadamlar) = 'array' and length(p_qadamlar::text) <= 8000 then p_qadamlar else '[]'::jsonb end,
          coalesce(p_toifalar, '{}'), left(p_model, 120), greatest(coalesce(p_kirish, 0), 0), greatest(coalesce(p_chiqish, 0), 0), p_ms, coalesce(p_rad, false)) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- O'z jurnali; admin/boss/director — butun kompaniya jurnali (kim so'ragani bilan)
create or replace function public.t2_agent_jurnal_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_hamma boolean default false, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb; v_hamma boolean;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  v_hamma := coalesce(p_hamma, false) and public._t2_agent_qaror_rol_ok(g->>'rol');
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]') into v from (
    select j.id, j.vaqt, j.profil_kod, j.rol, j.tur, j.savol, j.javob, j.qadamlar, j.toifalar, j.model, j.kirish_token, j.chiqish_token, j.ms, j.rad,
           case when v_hamma then f.login end as kim,
           (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'amal', h.amal, 'xavf', h.xavf, 'holat', h.holat, 'tushuntirish', h.tushuntirish) order by h.id), '[]') from t2_agent_harakat h where h.jurnal_id = j.id) as harakatlar
      from t2_agent_jurnal j left join t2_foydalanuvchi f on f.id = j.actor_id
     where j.kompaniya_id = p_kompaniya_id and (v_hamma or j.actor_id = p_actor_id)
     order by j.id desc limit greatest(1, least(coalesce(p_limit, 30), 100))) z;
  return jsonb_build_object('ok', true, 'hamma', v_hamma, 'natija', v);
end $$;

create or replace function public.t2_agent_harakat_taklif_v1(p_actor_id bigint, p_kompaniya_id bigint, p_jurnal bigint, p_amal text, p_param jsonb, p_tushuntirish text, p_aniq boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; k public.t2_agent_kasb%rowtype; sz public.t2_agent_shaxsiy_sozlama%rowtype;
  v_p jsonb; v_xavf text; v_avto boolean := false; v_ogoh text; v_id bigint; v_ob bigint; v_nomi text; v_bir text; v_hajm numeric; v_sana date; v_q numeric; v_gq public.t2_grafik_qator%rowtype; v_foiz numeric; v_kalit text; v_mazmun text;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  if not found or not (p_amal = any(k.harakatlar)) then return jsonb_build_object('ok', false, 'code', 'HARAKAT_RUXSATSIZ', 'xabar', 'Bu harakat sizning lavozimingiz uchun ruxsat etilmagan'); end if;
  if p_param is null or jsonb_typeof(p_param) <> 'object' then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID'); end if;
  if p_jurnal is not null and not exists (select 1 from t2_agent_jurnal where id = p_jurnal and actor_id = p_actor_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'JURNAL_BEGONA'); end if;

  if p_amal in ('ombor_kirim', 'ombor_chiqim') then
    begin v_ob := (p_param->>'obyekt_id')::bigint; v_hajm := (p_param->>'obyomi')::numeric; v_sana := coalesce(nullif(p_param->>'sana', '')::date, current_date);
    exception when others then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Qiymatlar noto''g''ri formatda'); end;
    v_nomi := btrim(coalesce(p_param->>'nomi', '')); v_bir := btrim(coalesce(p_param->>'birligi', ''));
    if not exists (select 1 from t2_obyekt where id = v_ob and kompaniya_id = p_kompaniya_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA', 'xabar', 'Obyekt topilmadi'); end if;
    if length(v_nomi) not between 2 and 120 or length(v_bir) not between 1 and 20 or v_hajm is null or v_hajm <= 0 or v_hajm > 10000000 or v_sana < current_date - 60 or v_sana > current_date + 1 then
      return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Nomi, birligi, miqdori (>0) va sanasi (oxirgi 60 kun) to''g''ri bo''lishi kerak');
    end if;
    v_p := jsonb_build_object('obyekt_id', v_ob, 'turi', coalesce(nullif(btrim(p_param->>'turi'), ''), 'material'), 'nomi', v_nomi, 'birligi', v_bir, 'obyomi', v_hajm, 'sana', v_sana, 'izoh', left(nullif(btrim(coalesce(p_param->>'izoh', '')), ''), 300));
    v_xavf := 'orta';
    if p_amal = 'ombor_chiqim' then
      select coalesce(sum(case when operatsiya = 'prixod' then obyomi else -obyomi end), 0) into v_q from t2_sklad_harakat
       where kompaniya_id = p_kompaniya_id and obyekt_id = v_ob and lower(nomi) = lower(v_nomi) and lower(birligi) = lower(v_bir) and coalesce(holat, 'faol') <> 'bekor';
      if v_hajm > v_q then v_xavf := 'yuqori'; v_ogoh := format('Omborda %s %s qolgan, siz %s %s chiqim qilmoqchisiz — qoldiq manfiy bo''ladi', v_q, v_bir, v_hajm, v_bir); end if;
    end if;
  elsif p_amal = 'grafik_foiz' then
    begin v_foiz := (p_param->>'foiz')::numeric; exception when others then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID'); end;
    select * into v_gq from t2_grafik_qator where id = nullif(p_param->>'grafik_id', '')::bigint and kompaniya_id = p_kompaniya_id and coalesce(faol, true);
    if not found or v_foiz is null or v_foiz < 0 or v_foiz > 100 then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Grafik qatori topilmadi yoki foiz 0–100 emas'); end if;
    v_p := jsonb_build_object('grafik_id', v_gq.id, 'nom', v_gq.nom, 'eski_foiz', v_gq.foiz, 'foiz', v_foiz, 'kutilgan_versiya', v_gq.versiya);
    v_xavf := 'orta';
    if v_foiz < coalesce(v_gq.foiz, 0) then v_ogoh := format('Foiz kamaytirilmoqda: %s → %s', coalesce(v_gq.foiz, 0), v_foiz); end if;
  else
    v_kalit := lower(btrim(coalesce(p_param->>'kalit', ''))); v_mazmun := btrim(coalesce(p_param->>'mazmun', ''));
    if v_kalit !~ '^[a-z0-9_.-]{2,80}$' or length(v_mazmun) not between 1 and 1000 then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Eslatma kaliti va matni kerak'); end if;
    v_p := jsonb_build_object('kalit', v_kalit, 'mazmun', v_mazmun);
    v_xavf := 'past';
  end if;

  select * into sz from t2_agent_shaxsiy_sozlama where actor_id = p_actor_id;
  -- Ishonch: 'sora' — hech qachon avto; 'jiddiy' (standart) — faqat past xavf; 'avto' — past va o'rta (faqat aniq so'rovda). Yuqori xavf — HAR DOIM so'raladi.
  v_avto := coalesce(p_aniq, false) and v_ogoh is null and case coalesce(sz.ishonch, 'jiddiy') when 'avto' then v_xavf in ('past', 'orta') when 'jiddiy' then v_xavf = 'past' else false end;
  insert into t2_agent_harakat (jurnal_id, kompaniya_id, actor_id, amal, parametrlar, tushuntirish, xavf, avto, ogohlantirish)
  values (p_jurnal, p_kompaniya_id, p_actor_id, p_amal, v_p, left(p_tushuntirish, 400), v_xavf, v_avto, v_ogoh) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'amal', p_amal, 'parametrlar', v_p, 'xavf', v_xavf, 'avto', v_avto, 'ogohlantirish', v_ogoh, 'tushuntirish', left(p_tushuntirish, 400));
end $$;

create or replace function public.t2_agent_harakat_qaror_v1(p_actor_id bigint, p_id bigint, p_qaror text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.t2_agent_harakat%rowtype;
begin
  if p_qaror not in ('tasdiqlash', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_INVALID'); end if;
  select * into h from t2_agent_harakat where id = p_id for update;
  if not found or h.actor_id <> p_actor_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if h.holat <> 'kutilmoqda' then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_KORIB_CHIQILGAN'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(h.kompaniya_id, p_actor_id);
  update t2_agent_harakat set holat = case when p_qaror = 'tasdiqlash' then 'tasdiqlandi' else 'rad' end, qaror_vaqt = now() where id = p_id;
  return jsonb_build_object('ok', true, 'holat', case when p_qaror = 'tasdiqlash' then 'tasdiqlandi' else 'rad' end);
end $$;

-- Avto-bajariladigan (past xavf, foydalanuvchi ruxsat bergan) harakatni mijoz 'tasdiqlandi' qilmasdan natijasini yozadi; qolganlar faqat tasdiqdan keyin
create or replace function public.t2_agent_harakat_natija_v1(p_actor_id bigint, p_id bigint, p_ok boolean, p_natija jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.t2_agent_harakat%rowtype;
begin
  select * into h from t2_agent_harakat where id = p_id for update;
  if not found or h.actor_id <> p_actor_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if not (h.holat = 'tasdiqlandi' or (h.holat = 'kutilmoqda' and h.avto)) then return jsonb_build_object('ok', false, 'code', 'TASDIQSIZ'); end if;
  update t2_agent_harakat set holat = case when coalesce(p_ok, false) then 'bajarildi' else 'xato' end, natija = case when p_natija is null or length(p_natija::text) > 2000 then null else p_natija end, qaror_vaqt = coalesce(qaror_vaqt, now()) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_agent_harakat_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.id desc), '[]') into v from (
    select id, amal, parametrlar, tushuntirish, xavf, avto, ogohlantirish, holat, natija, yaratildi from t2_agent_harakat
     where kompaniya_id = p_kompaniya_id and actor_id = p_actor_id order by id desc limit greatest(1, least(coalesce(p_limit, 30), 100))) z;
  return jsonb_build_object('ok', true, 'natija', v);
end $$;

revoke all on function public.t2_agent_shaxsiy_v1(bigint), public.t2_agent_shaxsiy_saqla_v1(bigint, text, text, text),
  public.t2_agent_jurnal_yoz_v1(bigint, bigint, uuid, text, text, text, text, text, jsonb, text[], text, integer, integer, integer, boolean),
  public.t2_agent_jurnal_royxat_v1(bigint, bigint, boolean, integer), public.t2_agent_harakat_taklif_v1(bigint, bigint, bigint, text, jsonb, text, boolean),
  public.t2_agent_harakat_qaror_v1(bigint, bigint, text), public.t2_agent_harakat_natija_v1(bigint, bigint, boolean, jsonb),
  public.t2_agent_harakat_royxat_v1(bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.t2_agent_shaxsiy_v1(bigint), public.t2_agent_shaxsiy_saqla_v1(bigint, text, text, text),
  public.t2_agent_jurnal_yoz_v1(bigint, bigint, uuid, text, text, text, text, text, jsonb, text[], text, integer, integer, integer, boolean),
  public.t2_agent_jurnal_royxat_v1(bigint, bigint, boolean, integer), public.t2_agent_harakat_taklif_v1(bigint, bigint, bigint, text, jsonb, text, boolean),
  public.t2_agent_harakat_qaror_v1(bigint, bigint, text), public.t2_agent_harakat_natija_v1(bigint, bigint, boolean, jsonb),
  public.t2_agent_harakat_royxat_v1(bigint, bigint, integer) to service_role;
