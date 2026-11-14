-- T2-OSUVCHI-HALQA-001: «O'rganish halqasi» v1 — foydalanuvchi ishidan o'rganish (tajriba) + ishqalanish sensori + takliflar navbati.
-- ADDITIV: faqat yangi jadval/funksiyalar. BEGIN/COMMIT yo'q. Hech bir mavjud jadval/funksiya o'zgarmaydi.
--
-- HAJM (Supabase FREE 466/500 MB — byudjet deyarli yo'q; hammasi ataylab kichik):
--   t2_tajriba           ~150 B/qator, foydalanuvchi boshiga ≤1500 qator (oshsa eng past ballilar o'chadi); real: 100-300 qator = ~50 KB
--   t2_tajriba_sozlama   kompaniya boshiga 1 qator (~100 B)
--   t2_tajriba_tizim     faqat egasi qabul qilgan (o'nlab qator)
--   t2_osuvchi_taklif    egasi navbati; yangi = hafta boshiga ≤~20 qator (~300 B), qaror qilinganlar saqlanadi
--   t2_friksiya          KUNLIK sanagich (hodisa-qator EMAS): kompaniya-kun boshiga ≤100 kalit (+≤5 «*» to'lib-toshish qatori), 7 kun saqlanadi
--   t2_friksiya_hafta    haftalik yig'ma: 12 hafta saqlanadi; odatda ~10-100 KB, eng yomon ~0.7 MB/kompaniya
--   t2_osuvchi_op        idempotentlik (operation_id/partiya), 3 kun saqlanadi, ~40 B/qator
-- JAMI real ko'rinishda o'nlab KB; jadvallar o'sishi retention (_t2_friksiya_tozala) bilan chegaralangan. R2 kerak emas.
--
-- DARAJALAR: user = t2_tajriba (foydalanuvchining o'z tanlovi); kompaniya = shu jadvaldan HOSILA yig'ma
--   (≥2 turli foydalanuvchi va ≥3 tasdiq, ism ko'rsatilmaydi); tizim = t2_tajriba_tizim (faqat egasi taklifni QABUL qilsa).
-- QOIDA: taklif hech qachon pul/yuridik hujjatga o'zi qo'llanmaydi — mijoz «taklif (tajribadan)» deb ko'rsatadi, foydalanuvchi tasdiqlaydi.
-- MAXFIYLIK: tizim takliflarida kompaniya id/nom/summa YO'Q; faqat domen ro'yxatidan (lugat, ustun, birlik) va faqat hissa=true kompaniyalardan.
set local statement_timeout = '300s';

-- ---------------------------------------------------------------- jadvallar
create table if not exists public.t2_tajriba_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  oqish boolean not null default true,   -- tajribadan o'rganish (foydalanuvchi + kompaniya darajasi)
  hissa boolean not null default false,  -- anonim hissa: tizim darajasiga TAKLIF (opt-in)
  yangilagan_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yangilandi timestamptz not null default now()
);

create table if not exists public.t2_tajriba (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  domen text not null check (domen ~ '^[a-z0-9_]{2,30}$' and domen not in ('summa', 'narx', 'pul', 'parol', 'token')),
  kalit text not null check (length(kalit) between 1 and 160),
  qiymat text not null check (length(qiymat) between 1 and 600),
  tasdiq integer not null default 0 check (tasdiq >= 0),
  rad integer not null default 0 check (rad >= 0),
  oxirgi timestamptz not null default now(),
  yaratildi timestamptz not null default now()
);
create unique index if not exists t2_tajriba_uq on public.t2_tajriba (foydalanuvchi_id, kompaniya_id, domen, kalit, qiymat);
create index if not exists t2_tajriba_kalit_idx on public.t2_tajriba (kompaniya_id, domen, kalit);

create table if not exists public.t2_tajriba_tizim (
  domen text not null,
  kalit text not null,
  qiymat text not null,
  taklif_id bigint,
  qabul_vaqti timestamptz not null default now(),
  primary key (domen, kalit)
);

create table if not exists public.t2_osuvchi_taklif (
  id bigint generated always as identity primary key,
  tur text not null check (tur in ('tajriba', 'friksiya')),
  domen text not null,
  kalit text not null,
  qiymat text not null default '',
  dalil jsonb not null default '{}'::jsonb check (length(dalil::text) <= 2000),  -- faqat sonlar; kompaniya id/nom/summa YO'Q
  holat text not null default 'yangi' check (holat in ('yangi', 'qabul', 'rad', 'keyin')),
  yaratildi timestamptz not null default now(),
  hal_etildi timestamptz,
  hal_etgan_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  unique (tur, domen, kalit, qiymat)
);

create table if not exists public.t2_friksiya (
  kun date not null,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  rol text not null,
  sahifa text not null,
  amal text not null,
  hodisa text not null check (hodisa in ('boshlandi', 'tugadi', 'tashlandi', 'xato', 'nol_qidiruv')),
  kod text not null default '',
  soni bigint not null default 0,
  odam bigint not null default 0,
  primary key (kun, kompaniya_id, rol, sahifa, amal, hodisa, kod)
);

create table if not exists public.t2_friksiya_hafta (
  hafta date not null,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  rol text not null,
  sahifa text not null,
  amal text not null,
  hodisa text not null,
  kod text not null default '',
  soni bigint not null default 0,
  odam bigint not null default 0,
  primary key (hafta, kompaniya_id, rol, sahifa, amal, hodisa, kod)
);

create table if not exists public.t2_osuvchi_op (
  op_id uuid primary key,
  kun date not null default current_date
);
create index if not exists t2_osuvchi_op_kun_idx on public.t2_osuvchi_op (kun);

do $rls$ declare t text; begin
  foreach t in array array['t2_tajriba_sozlama', 't2_tajriba', 't2_tajriba_tizim', 't2_osuvchi_taklif', 't2_friksiya', 't2_friksiya_hafta', 't2_osuvchi_op'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $rls$;

-- ---------------------------------------------------------------- yordamchi funksiyalar
-- Qiymat/kalit xavfsizlik filtri: uzun raqam (INN/hisob/summa) yoki e-pochta saqlanmaydi.
create or replace function public._t2_tajriba_toza(p_x text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_x is not null and p_x !~ '[0-9]{8,}' and position('@' in p_x) = 0;
$$;

-- Eng yaxshi taklif: user (≥2 tasdiq, ball≥1) → kompaniya (≥2 foydalanuvchi, ≥3 tasdiq) → tizim.
-- ball = tasdiq·0.5^(kun/180) − 2·rad. Tuzatish eski qiymatga rad+2 beradi, shuning uchun u darhol o'chadi.
create or replace function public._t2_tajriba_taklif(p_k bigint, p_a bigint, p_domen text, p_kalit text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_oqish boolean; r record;
begin
  select coalesce((select s.oqish from public.t2_tajriba_sozlama s where s.kompaniya_id = p_k), true) into v_oqish;
  if v_oqish then
    select x.qiymat, x.tasdiq, x.rad into r from (
      select t.qiymat, t.tasdiq, t.rad, t.oxirgi,
             t.tasdiq * power(0.5, greatest(extract(epoch from (now() - t.oxirgi)) / 86400.0, 0) / 180.0) - 2 * t.rad as ball
        from public.t2_tajriba t
       where t.foydalanuvchi_id = p_a and t.kompaniya_id = p_k and t.domen = p_domen and t.kalit = p_kalit) x
     where x.tasdiq >= 2 and x.ball >= 1 order by x.ball desc, x.oxirgi desc limit 1;
    if found then
      return jsonb_build_object('daraja', 'user', 'qiymat', r.qiymat, 'tasdiq', r.tasdiq, 'rad', r.rad);
    end if;
    select y.qiymat, y.users, y.tasdiq, y.rad into r from (
      select t.qiymat, count(distinct t.foydalanuvchi_id) filter (where t.tasdiq >= 1) as users,
             sum(t.tasdiq)::integer as tasdiq, sum(t.rad)::integer as rad, max(t.oxirgi) as oxirgi
        from public.t2_tajriba t
       where t.kompaniya_id = p_k and t.domen = p_domen and t.kalit = p_kalit group by t.qiymat) y
     where y.users >= 2 and y.tasdiq >= 3 and y.tasdiq - 2 * y.rad >= 1
     order by (y.tasdiq - 2 * y.rad) desc, y.oxirgi desc limit 1;
    if found then
      return jsonb_build_object('daraja', 'kompaniya', 'qiymat', r.qiymat, 'tasdiq', r.tasdiq, 'rad', r.rad, 'foydalanuvchi_soni', r.users);
    end if;
  end if;
  select z.qiymat into r from public.t2_tajriba_tizim z where z.domen = p_domen and z.kalit = p_kalit;
  if found then return jsonb_build_object('daraja', 'tizim', 'qiymat', r.qiymat); end if;
  return jsonb_build_object('daraja', null);
end $$;

-- Tuzatish turi (taklif qilinadigan dori) — faqat sanoq bo'yicha, taxmin emas.
create or replace function public._t2_friksiya_dori(p_bosh bigint, p_tash bigint, p_xat bigint, p_nol bigint, p_odam bigint, p_sekin bigint, p_top text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when coalesce(p_top, '') like 'funksiya_yoq%' then 'funksiya'
    when p_nol > 0 and p_nol >= p_xat and p_nol >= p_tash then 'default'
    when p_xat > 0 and p_xat >= p_tash then 'ui'
    when p_tash > 0 and p_sekin * 2 > greatest(p_bosh - p_tash, 1) then 'ui'
    when p_tash > 0 and p_odam >= 3 then 'dars'
    else 'ui' end;
$$;

-- Reyting: ball = odam × nuqson. kompaniya null = hamma kompaniya (faqat platforma egasi chaqiradi).
create or replace function public._t2_friksiya_reyting(p_kompaniya_id bigint, p_kunlar integer, p_lim integer)
returns table (o_sahifa text, o_amal text, o_bosh bigint, o_tug bigint, o_tash bigint, o_xat bigint, o_nol bigint, o_odam bigint,
               o_nuqson numeric, o_ball numeric, o_top text, o_top_h text, o_sekin bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (
    select f.sahifa, f.amal, f.hodisa, f.kod, f.soni, f.odam from public.t2_friksiya f
     where f.kun >= current_date - p_kunlar and (p_kompaniya_id is null or f.kompaniya_id = p_kompaniya_id)
    union all
    select h.sahifa, h.amal, h.hodisa, h.kod, h.soni, h.odam from public.t2_friksiya_hafta h
     where h.hafta >= current_date - p_kunlar - 6 and (p_kompaniya_id is null or h.kompaniya_id = p_kompaniya_id)
  ), g as (
    select b.sahifa, b.amal,
           coalesce(sum(b.soni) filter (where b.hodisa = 'boshlandi'), 0)::bigint as bosh,
           coalesce(sum(b.soni) filter (where b.hodisa = 'tugadi'), 0)::bigint as tug,
           coalesce(sum(b.soni) filter (where b.hodisa = 'tashlandi'), 0)::bigint as tash,
           coalesce(sum(b.soni) filter (where b.hodisa = 'xato'), 0)::bigint as xat,
           coalesce(sum(b.soni) filter (where b.hodisa = 'nol_qidiruv'), 0)::bigint as nol,
           greatest(coalesce(sum(b.odam) filter (where b.hodisa = 'tashlandi'), 0), coalesce(sum(b.odam) filter (where b.hodisa = 'xato'), 0),
                    coalesce(sum(b.odam) filter (where b.hodisa = 'nol_qidiruv'), 0))::bigint as odam,
           coalesce(sum(b.soni) filter (where b.hodisa = 'tugadi' and b.kod in ('t3', 't4')), 0)::bigint as sekin
      from b group by b.sahifa, b.amal
  )
  select g.sahifa, g.amal, g.bosh, g.tug, g.tash, g.xat, g.nol, g.odam,
         round(least(1::numeric, (g.tash + g.xat + g.nol)::numeric / greatest(g.bosh, g.tug + g.tash, 1)), 3),
         round(g.odam * least(1::numeric, (g.tash + g.xat + g.nol)::numeric / greatest(g.bosh, g.tug + g.tash, 1)), 3),
         (select b2.kod from b b2 where b2.sahifa = g.sahifa and b2.amal = g.amal and b2.hodisa in ('xato', 'nol_qidiruv') and b2.kod <> ''
           group by b2.kod, b2.hodisa order by sum(b2.soni) desc limit 1),
         (select b2.hodisa from b b2 where b2.sahifa = g.sahifa and b2.amal = g.amal and b2.hodisa in ('xato', 'nol_qidiruv') and b2.kod <> ''
           group by b2.kod, b2.hodisa order by sum(b2.soni) desc limit 1),
         g.sekin
    from g where g.tash + g.xat + g.nol > 0
   order by 10 desc, 8 desc, 1, 2
   limit greatest(p_lim, 1);
$$;

-- Retention: 7 kundan eski kunlik → haftalik (boshlandi kodi yig'iladi), 12 haftadan eskisi o'chadi, eski op'lar o'chadi. Idempotent.
create or replace function public._t2_friksiya_tozala() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ko integer; v_ho integer; v_op integer;
begin
  with d as (delete from public.t2_friksiya f where f.kun < current_date - 7 returning f.*),
       i as (insert into public.t2_friksiya_hafta (hafta, kompaniya_id, rol, sahifa, amal, hodisa, kod, soni, odam)
             select date_trunc('week', d.kun)::date, d.kompaniya_id, d.rol, d.sahifa, d.amal, d.hodisa,
                    case when d.hodisa in ('boshlandi', 'tashlandi') then ''::text else d.kod end, sum(d.soni), sum(d.odam)
               from d group by 1, 2, 3, 4, 5, 6, 7
             on conflict (hafta, kompaniya_id, rol, sahifa, amal, hodisa, kod)
             do update set soni = public.t2_friksiya_hafta.soni + excluded.soni, odam = public.t2_friksiya_hafta.odam + excluded.odam
             returning 1)
  select (select count(*) from d)::integer into v_ko;
  delete from public.t2_friksiya_hafta h where h.hafta < current_date - 7 * 12;
  get diagnostics v_ho = row_count;
  delete from public.t2_osuvchi_op o where o.kun < current_date - 3;
  get diagnostics v_op = row_count;
  return jsonb_build_object('ok', true, 'kunlik_haftalikka', v_ko, 'haftalik_ochdi', v_ho, 'op_ochdi', v_op);
end $$;

-- ---------------------------------------------------------------- yozish (bitta eshik)
create or replace function public.t2_osuvchi_yoz_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_amal text, p_yuk jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rol text; v_oqish boolean; v_dom text; v_kal text; v_qiy text; v_nat text; v_eski text; v_n integer := 0; v_id bigint; v_q text;
  e jsonb; v_r text; v_s text; v_a text; v_h text; v_kod text; v_cnt bigint; v_od bigint; v_cap integer := 0; v_qn integer;
  v_min integer; v_yan integer := 0; v_su boolean;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  if p_amal is null or p_amal not in ('tajriba_yoz', 'tajriba_unut', 'sozlama_saqla', 'friksiya_yubor', 'taklif_yigish', 'taklif_qaror') then
    return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
  end if;
  p_yuk := coalesce(p_yuk, '{}'::jsonb);
  if jsonb_typeof(p_yuk) <> 'object' then return jsonb_build_object('ok', false, 'code', 'YUK_NOTOGRI'); end if;
  v_su := coalesce(public.t2_platforma_superadmin(p_actor_id), false);
  if p_amal in ('tajriba_yoz', 'tajriba_unut', 'friksiya_yubor') then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.read');
  elsif p_amal = 'sozlama_saqla' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'control.company.write');
  elsif not v_su then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT');
  end if;
  -- idempotentlik: bir operation_id — bir marta
  insert into public.t2_osuvchi_op (op_id) values (p_operation_id) on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'takror', true); end if;

  if p_amal = 'tajriba_yoz' then
    select coalesce((select s.oqish from public.t2_tajriba_sozlama s where s.kompaniya_id = p_kompaniya_id), true) into v_oqish;
    if not v_oqish then return jsonb_build_object('ok', true, 'otkazildi', true); end if;
    v_dom := p_yuk ->> 'domen'; v_kal := btrim(coalesce(p_yuk ->> 'kalit', '')); v_qiy := btrim(coalesce(p_yuk ->> 'qiymat', ''));
    v_nat := p_yuk ->> 'natija'; v_eski := btrim(coalesce(p_yuk ->> 'taklif_qiymat', ''));
    if v_dom is null or v_dom !~ '^[a-z0-9_]{2,30}$' or v_dom in ('summa', 'narx', 'pul', 'parol', 'token') then return jsonb_build_object('ok', false, 'code', 'DOMEN_NOTOGRI'); end if;
    if length(v_kal) not between 1 and 160 or length(v_qiy) not between 1 and 600 or length(v_eski) > 600 then return jsonb_build_object('ok', false, 'code', 'MATN_NOTOGRI'); end if;
    if v_nat is null or v_nat not in ('tasdiq', 'rad', 'tuzatish') then return jsonb_build_object('ok', false, 'code', 'NATIJA_NOTOGRI'); end if;
    if not (public._t2_tajriba_toza(v_kal) and public._t2_tajriba_toza(v_qiy) and public._t2_tajriba_toza(v_eski)) then return jsonb_build_object('ok', false, 'code', 'MAXFIY_QIYMAT'); end if;
    if v_nat in ('tasdiq', 'tuzatish') then
      insert into public.t2_tajriba as t (kompaniya_id, foydalanuvchi_id, domen, kalit, qiymat, tasdiq) values (p_kompaniya_id, p_actor_id, v_dom, v_kal, v_qiy, 1)
      on conflict (foydalanuvchi_id, kompaniya_id, domen, kalit, qiymat) do update set tasdiq = t.tasdiq + 1, oxirgi = now();
      if v_nat = 'tuzatish' and v_eski <> '' and v_eski <> v_qiy then
        insert into public.t2_tajriba as t (kompaniya_id, foydalanuvchi_id, domen, kalit, qiymat, rad) values (p_kompaniya_id, p_actor_id, v_dom, v_kal, v_eski, 2)
        on conflict (foydalanuvchi_id, kompaniya_id, domen, kalit, qiymat) do update set rad = t.rad + 2, oxirgi = now();
      end if;
    else
      insert into public.t2_tajriba as t (kompaniya_id, foydalanuvchi_id, domen, kalit, qiymat, rad) values (p_kompaniya_id, p_actor_id, v_dom, v_kal, v_qiy, 1)
      on conflict (foydalanuvchi_id, kompaniya_id, domen, kalit, qiymat) do update set rad = t.rad + 1, oxirgi = now();
    end if;
    -- hajm chegarasi: foydalanuvchi boshiga ≤1500 (eng past ballilar o'chadi)
    select count(*) into v_n from public.t2_tajriba t where t.foydalanuvchi_id = p_actor_id and t.kompaniya_id = p_kompaniya_id;
    if v_n > 1500 then
      delete from public.t2_tajriba t where t.id in (select x.id from public.t2_tajriba x where x.foydalanuvchi_id = p_actor_id and x.kompaniya_id = p_kompaniya_id
        order by (x.tasdiq - 2 * x.rad) desc, x.oxirgi desc offset 1500);
    end if;
    return jsonb_build_object('ok', true, 'taklif', public._t2_tajriba_taklif(p_kompaniya_id, p_actor_id, v_dom, v_kal));

  elsif p_amal = 'tajriba_unut' then
    if (p_yuk ->> 'hammasi') = 'true' then
      delete from public.t2_tajriba t where t.foydalanuvchi_id = p_actor_id and t.kompaniya_id = p_kompaniya_id;
    elsif (p_yuk ->> 'id') ~ '^[0-9]{1,18}$' then
      delete from public.t2_tajriba t where t.id = (p_yuk ->> 'id')::bigint and t.foydalanuvchi_id = p_actor_id and t.kompaniya_id = p_kompaniya_id;
    else
      return jsonb_build_object('ok', false, 'code', 'ID_NOTOGRI');
    end if;
    get diagnostics v_n = row_count;
    return jsonb_build_object('ok', true, 'ochirildi', v_n);

  elsif p_amal = 'sozlama_saqla' then
    if (p_yuk ? 'oqish' and jsonb_typeof(p_yuk -> 'oqish') <> 'boolean') or (p_yuk ? 'hissa' and jsonb_typeof(p_yuk -> 'hissa') <> 'boolean') then
      return jsonb_build_object('ok', false, 'code', 'SOZLAMA_NOTOGRI');
    end if;
    insert into public.t2_tajriba_sozlama as s (kompaniya_id, oqish, hissa, yangilagan_id)
    values (p_kompaniya_id, coalesce((p_yuk ->> 'oqish')::boolean, true), coalesce((p_yuk ->> 'hissa')::boolean, false), p_actor_id)
    on conflict (kompaniya_id) do update set oqish = coalesce((p_yuk ->> 'oqish')::boolean, s.oqish), hissa = coalesce((p_yuk ->> 'hissa')::boolean, s.hissa),
      yangilagan_id = p_actor_id, yangilandi = now();
    return jsonb_build_object('ok', true);

  elsif p_amal = 'friksiya_yubor' then
    select coalesce((select s.oqish from public.t2_tajriba_sozlama s where s.kompaniya_id = p_kompaniya_id), true) into v_oqish;
    if not v_oqish then return jsonb_build_object('ok', true, 'otkazildi', true); end if;
    if jsonb_typeof(p_yuk -> 'qatorlar') is distinct from 'array' or jsonb_array_length(p_yuk -> 'qatorlar') > 60 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
    for e in select x.value from jsonb_array_elements(p_yuk -> 'qatorlar') as x(value) loop
      continue when jsonb_typeof(e) <> 'object';
      v_r := left(lower(v_rol), 20);
      v_s := lower(coalesce(e ->> 's', '')); v_a := lower(coalesce(e ->> 'a', '')); v_h := coalesce(e ->> 'h', '');
      v_kod := coalesce(e ->> 'k', '');
      continue when v_s !~ '^[a-z0-9_./-]{1,60}$' or v_a !~ '^[a-z0-9_./-]{1,40}$' or v_h not in ('boshlandi', 'tugadi', 'tashlandi', 'xato', 'nol_qidiruv');
      if coalesce(e ->> 'n', '') !~ '^[0-9]{1,4}$' then continue; end if;
      v_cnt := least((e ->> 'n')::bigint, 1000);
      v_od := case when (e ->> 'o') = '1' then 1 else 0 end;
      if v_h = 'tugadi' then v_kod := case when v_kod in ('t0', 't1', 't2', 't3', 't4') then v_kod else 't2' end;
      elsif v_h = 'xato' then v_kod := case when v_kod ~ '^[A-Za-z0-9_.:-]{1,40}$' then v_kod else 'NOMALUM' end;
      elsif v_h = 'nol_qidiruv' then
        v_kod := btrim(regexp_replace(regexp_replace(lower(v_kod), '[@:/\\<>"{}]+', ' ', 'g'), '\s+', ' ', 'g'));
        continue when length(v_kod) < 2 or length(v_kod) > 40 or v_kod ~ '[0-9]{5,}';
      else v_kod := ''; end if;
      -- kardinallik chegarasi: kompaniya-kun boshiga ≤100 kalit; undan ortig'i (*,*) ga yig'iladi
      select count(*) into v_qn from public.t2_friksiya f where f.kun = current_date and f.kompaniya_id = p_kompaniya_id;
      if v_qn >= 100 and not exists (select 1 from public.t2_friksiya f where f.kun = current_date and f.kompaniya_id = p_kompaniya_id
                                       and f.rol = v_r and f.sahifa = v_s and f.amal = v_a and f.hodisa = v_h and f.kod = v_kod) then
        v_s := '*'; v_a := '*'; v_kod := ''; v_cap := v_cap + 1;
      end if;
      insert into public.t2_friksiya as f (kun, kompaniya_id, rol, sahifa, amal, hodisa, kod, soni, odam)
      values (current_date, p_kompaniya_id, v_r, v_s, v_a, v_h, v_kod, v_cnt, v_od)
      on conflict (kun, kompaniya_id, rol, sahifa, amal, hodisa, kod) do update set soni = f.soni + excluded.soni, odam = f.odam + excluded.odam;
      v_n := v_n + 1;
    end loop;
    if exists (select 1 from public.t2_friksiya f where f.kun < current_date - 7 limit 1) then perform public._t2_friksiya_tozala(); end if;
    return jsonb_build_object('ok', true, 'qabul', v_n, 'tolib_toshdi', v_cap);

  elsif p_amal = 'taklif_yigish' then
    v_min := greatest(coalesce(nullif(p_yuk ->> 'min_kompaniya', '')::integer, 2), 1);
    insert into public.t2_osuvchi_taklif (tur, domen, kalit, qiymat, dalil)
    select 'tajriba', g.domen, g.kalit, g.qiymat,
           jsonb_build_object('kompaniya_soni', g.kk, 'foydalanuvchi_soni', g.uu, 'tasdiq', g.ts, 'rad', g.rr)
      from (select t.domen, t.kalit, t.qiymat, count(distinct t.kompaniya_id) as kk, count(distinct t.foydalanuvchi_id) as uu,
                   sum(t.tasdiq) as ts, sum(t.rad) as rr
              from public.t2_tajriba t join public.t2_tajriba_sozlama s on s.kompaniya_id = t.kompaniya_id and s.hissa and s.oqish
             where t.domen in ('lugat', 'ustun', 'birlik') and public._t2_tajriba_toza(t.kalit) and public._t2_tajriba_toza(t.qiymat)
             group by t.domen, t.kalit, t.qiymat) g
     where g.kk >= v_min and g.uu >= 2 and g.ts >= 3 and g.ts - 2 * g.rr >= 1
       and not exists (select 1 from public.t2_tajriba_tizim z where z.domen = g.domen and z.kalit = g.kalit)
    on conflict (tur, domen, kalit, qiymat) do update set dalil = excluded.dalil where public.t2_osuvchi_taklif.holat in ('yangi', 'keyin');
    get diagnostics v_n = row_count;
    insert into public.t2_osuvchi_taklif (tur, domen, kalit, qiymat, dalil)
    select 'friksiya', r.o_sahifa, r.o_sahifa::text || ':'::text || r.o_amal::text, ''::text,
           jsonb_build_object('dori', public._t2_friksiya_dori(r.o_bosh, r.o_tash, r.o_xat, r.o_nol, r.o_odam, r.o_sekin, r.o_top), 'odam', r.o_odam, 'nuqson', r.o_nuqson, 'boshlandi', r.o_bosh, 'tashlandi', r.o_tash, 'xato', r.o_xat, 'nol_qidiruv', r.o_nol, 'top_kod', r.o_top)
      from public._t2_friksiya_reyting(null, 30, 5) r where r.o_ball >= 1
    on conflict (tur, domen, kalit, qiymat) do update set dalil = excluded.dalil where public.t2_osuvchi_taklif.holat in ('yangi', 'keyin');
    get diagnostics v_yan = row_count;
    return jsonb_build_object('ok', true, 'tajriba_takliflari', v_n, 'friksiya_takliflari', v_yan);

  elsif p_amal = 'taklif_qaror' then
    v_q := p_yuk ->> 'qaror';
    if (p_yuk ->> 'id') !~ '^[0-9]{1,18}$' or v_q is null or v_q not in ('qabul', 'rad', 'keyin') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
    update public.t2_osuvchi_taklif k set holat = v_q,
           hal_etildi = case when v_q = 'keyin' then null else now() end, hal_etgan_id = p_actor_id
     where k.id = (p_yuk ->> 'id')::bigint returning k.id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
    if v_q = 'qabul' then
      insert into public.t2_tajriba_tizim as z (domen, kalit, qiymat, taklif_id)
      select k.domen, k.kalit, k.qiymat, k.id from public.t2_osuvchi_taklif k where k.id = v_id and k.tur = 'tajriba'
      on conflict (domen, kalit) do update set qiymat = excluded.qiymat, taklif_id = excluded.taklif_id, qabul_vaqti = now();
    end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'holat', v_q);
  end if;
  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $$;

-- ---------------------------------------------------------------- o'qish
create or replace function public.t2_osuvchi_ol_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dom text; v_kal text; s record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.read');
  p_filtr := coalesce(p_filtr, '{}'::jsonb);
  if p_bolim = 'taklif' then
    v_dom := p_filtr ->> 'domen'; v_kal := btrim(coalesce(p_filtr ->> 'kalit', ''));
    if v_dom is null or v_dom !~ '^[a-z0-9_]{2,30}$' or length(v_kal) not between 1 and 160 then return jsonb_build_object('ok', false, 'code', 'FILTR_NOTOGRI'); end if;
    return jsonb_build_object('ok', true, 'bolim', 'taklif', 'taklif', public._t2_tajriba_taklif(p_kompaniya_id, p_actor_id, v_dom, v_kal));
  elsif p_bolim = 'mening' then
    return jsonb_build_object('ok', true, 'bolim', 'mening', 'royxat',
      (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'domen', x.domen, 'kalit', x.kalit, 'qiymat', x.qiymat, 'tasdiq', x.tasdiq, 'rad', x.rad, 'oxirgi', x.oxirgi) order by x.oxirgi desc), '[]'::jsonb)
         from (select * from public.t2_tajriba t where t.foydalanuvchi_id = p_actor_id and t.kompaniya_id = p_kompaniya_id order by t.oxirgi desc limit 300) x));
  elsif p_bolim = 'sozlama' then
    select coalesce(s0.oqish, true) as oqish, coalesce(s0.hissa, false) as hissa into s
      from (select 1) d left join public.t2_tajriba_sozlama s0 on s0.kompaniya_id = p_kompaniya_id;
    return jsonb_build_object('ok', true, 'bolim', 'sozlama', 'oqish', s.oqish, 'hissa', s.hissa);
  elsif p_bolim = 'friksiya' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'control.company.read');
    return jsonb_build_object('ok', true, 'bolim', 'friksiya', 'royxat',
      (select coalesce(jsonb_agg(jsonb_build_object('sahifa', r.o_sahifa, 'amal', r.o_amal, 'boshlandi', r.o_bosh, 'tugadi', r.o_tug, 'tashlandi', r.o_tash, 'xato', r.o_xat,
          'nol_qidiruv', r.o_nol, 'odam', r.o_odam, 'nuqson', r.o_nuqson, 'ball', r.o_ball, 'top_kod', r.o_top, 'top_hodisa', r.o_top_h,
          'dori', public._t2_friksiya_dori(r.o_bosh, r.o_tash, r.o_xat, r.o_nol, r.o_odam, r.o_sekin, r.o_top)) order by r.o_ball desc), '[]'::jsonb)
         from public._t2_friksiya_reyting(p_kompaniya_id, 30, 30) r));
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_NOMALUM');
end $$;

-- Platforma egasi: hamma kompaniya, ANONIM (kompaniya id/nom/summa yo'q).
create or replace function public.t2_osuvchi_platforma_ol_v1(p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or p_actor_id <= 0 or not exists (select 1 from public.t2_foydalanuvchi u where u.id = p_actor_id and u.holat = 'faol')
     or not coalesce(public.t2_platforma_superadmin(p_actor_id), false) then
    raise exception 'faqat platforma egasi' using errcode = '42501';
  end if;
  if p_bolim = 'taklif' then
    return jsonb_build_object('ok', true, 'bolim', 'taklif', 'royxat',
      (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'tur', k.tur, 'domen', k.domen, 'kalit', k.kalit, 'qiymat', k.qiymat, 'dalil', k.dalil, 'holat', k.holat, 'yaratildi', k.yaratildi)
          order by k.yaratildi desc), '[]'::jsonb)
         from (select * from public.t2_osuvchi_taklif t where t.holat in ('yangi', 'keyin') or t.hal_etildi > now() - interval '30 days' order by t.yaratildi desc limit 100) k));
  elsif p_bolim = 'friksiya' then
    return jsonb_build_object('ok', true, 'bolim', 'friksiya', 'royxat',
      (select coalesce(jsonb_agg(jsonb_build_object('sahifa', r.o_sahifa, 'amal', r.o_amal, 'boshlandi', r.o_bosh, 'tugadi', r.o_tug, 'tashlandi', r.o_tash, 'xato', r.o_xat,
          'nol_qidiruv', r.o_nol, 'odam', r.o_odam, 'nuqson', r.o_nuqson, 'ball', r.o_ball,
          'top_kod', case when r.o_top_h = 'nol_qidiruv' and r.o_odam < 3 then null else r.o_top end, 'top_hodisa', r.o_top_h,
          'dori', public._t2_friksiya_dori(r.o_bosh, r.o_tash, r.o_xat, r.o_nol, r.o_odam, r.o_sekin, r.o_top)) order by r.o_ball desc), '[]'::jsonb)
         from public._t2_friksiya_reyting(null, 30, 30) r));
  elsif p_bolim = 'hafta' then
    return jsonb_build_object('ok', true, 'bolim', 'hafta',
      'yangi_tajriba', (select count(*) from public.t2_osuvchi_taklif k where k.tur = 'tajriba' and k.holat = 'yangi'),
      'yangi_friksiya', (select count(*) from public.t2_osuvchi_taklif k where k.tur = 'friksiya' and k.holat = 'yangi'),
      'bu_hafta', (select coalesce(jsonb_object_agg(z.kalit, z.n), '{}'::jsonb) from (select k.tur::text || ':'::text || k.domen::text as kalit, count(*) as n from public.t2_osuvchi_taklif k
                   where k.yaratildi > now() - interval '7 days' and k.holat in ('yangi', 'keyin') group by 1) z),
      'tizim_qoidalari', (select count(*) from public.t2_tajriba_tizim),
      'hajm_bayt', (select coalesce(sum(pg_total_relation_size(c.oid)), 0) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname in ('t2_tajriba', 't2_tajriba_sozlama', 't2_tajriba_tizim', 't2_osuvchi_taklif', 't2_friksiya', 't2_friksiya_hafta', 't2_osuvchi_op')));
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_NOMALUM');
end $$;

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_tajriba_toza(text)', 'public._t2_tajriba_taklif(bigint,bigint,text,text)',
    'public._t2_friksiya_dori(bigint,bigint,bigint,bigint,bigint,bigint,text)', 'public._t2_friksiya_reyting(bigint,integer,integer)',
    'public._t2_friksiya_tozala()', 'public.t2_osuvchi_yoz_v1(bigint,bigint,uuid,text,jsonb)',
    'public.t2_osuvchi_ol_v1(bigint,bigint,text,jsonb)', 'public.t2_osuvchi_platforma_ol_v1(bigint,text,jsonb)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $grant$;

-- ---------------------------------------------------------------- strukturaviy tasdiqlar
do $assert$ declare t text; f text; n integer; begin
  foreach t in array array['t2_tajriba_sozlama', 't2_tajriba', 't2_tajriba_tizim', 't2_osuvchi_taklif', 't2_friksiya', 't2_friksiya_hafta', 't2_osuvchi_op'] loop
    if to_regclass('public.' || t) is null then raise exception 'OSUVCHI assert: jadval yo''q %', t; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'OSUVCHI assert: RLS yoqilmagan %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select') then raise exception 'OSUVCHI assert: anon/authenticated ochiq %', t; end if;
    if not has_table_privilege('service_role', 'public.' || t, 'select') then raise exception 'OSUVCHI assert: service_role huquqi yo''q %', t; end if;
  end loop;
  foreach f in array array['t2_osuvchi_yoz_v1', 't2_osuvchi_ol_v1', 't2_osuvchi_platforma_ol_v1', '_t2_tajriba_taklif', '_t2_friksiya_reyting', '_t2_friksiya_tozala'] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = f;
    if n <> 1 then raise exception 'OSUVCHI assert: funksiya % soni=%', f, n; end if;
  end loop;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 't2_tajriba_uq') then raise exception 'OSUVCHI assert: t2_tajriba_uq yo''q'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 't2_osuvchi_taklif' and column_name in ('kompaniya_id', 'kompaniya_nom')) then
    raise exception 'OSUVCHI assert: tizim takliflarida kompaniya ustuni bo''lmasligi kerak';
  end if;
end $assert$;
