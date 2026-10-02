begin;

-- T2-PTO-TIJORAT-002 — token narxi v2 + qo'lda to'lov (egasi, 2026-10-02):
--  "bitta F2 30 000–100 000 so'm atrofida; ishlatilgan xarajatdan tannarx hisoblanib, superadmin qo'ygan foyda foizi
--   qo'shilib narx avtomatik chiqsin; hech kimning haqqi qolmasin; token nimaga va nima sababdan ishlatilgani ko'rinsin".
-- Formula (har amal): yakuniy_som = clamp((asos_som + ceil(n / birlik) × birlik_som) × (1 + foyda% / 100), min_som, max_som)
--                     token      = ceil(yakuniy_som / token_som)
-- Halollik: har sarfga to'liq hisob (o'sha paytdagi narxlar) yoziladi; bir xil hujjat (xesh) qayta — bepul;
-- ma'lumot kiritish bepul, pul hujjat chiqqanda; xato bo'lsa — qaytarish (v1 dan).

-- ═══ 1. Global sozlama ═══
create table if not exists public.t2_token_sozlama (
  id int primary key default 1 check (id = 1),
  token_som numeric(12,2) not null default 100 check (token_som > 0),
  foyda_foiz numeric(6,2) not null default 30 check (foyda_foiz >= 0),
  royxat_bonus_token numeric(12,2) not null default 500 check (royxat_bonus_token >= 0),
  usd_kurs numeric(12,2) not null default 12700 check (usd_kurs > 0),
  tolov_rekvizit text,
  yangilandi timestamptz not null default now());
alter table public.t2_token_sozlama enable row level security;
revoke all on public.t2_token_sozlama from anon, authenticated;
insert into public.t2_token_sozlama(id) values (1) on conflict (id) do nothing;

-- ═══ 2. Narx jadvali — so'mdagi tannarx ustunlari ═══
alter table public.t2_token_narx add column if not exists asos_som numeric(14,2) not null default 0;
alter table public.t2_token_narx add column if not exists birlik_som numeric(14,4) not null default 0;
alter table public.t2_token_narx add column if not exists min_som numeric(14,2) not null default 0;
alter table public.t2_token_narx add column if not exists max_som numeric(14,2);
alter table public.t2_token_narx add column if not exists foyda_foiz numeric(6,2);
alter table public.t2_token_narx add column if not exists izoh text;

insert into public.t2_token_narx(amal, nom, tur, narx, birlik, minimum) values
  ('f2_hujjat', 'F2 hujjati (Excel / ko''rish)', 'yacheyka', 0, 100, 0)
on conflict (amal) do nothing;

update public.t2_token_narx n set asos_som = v.asos, birlik = v.birlik, birlik_som = v.bsom, min_som = v.mn, max_som = v.mx, izoh = v.izoh, yangilandi = now()
from (values
  ('f2_hujjat',      20000::numeric, 100, 1000::numeric, 30000::numeric, 100000::numeric, 'F2 hujjati: asosiy + har 100 yacheyka'),
  ('hujjat',         10000, 100, 500,  10000, 60000, 'Boshqa hujjatlar (nakopitelniy, F3, M-29, akt…)'),
  ('smeta_import',   5000, 1000, 500,  5000, 50000, 'Smeta yuklash: faylidagi to''ldirilgan yacheykalar'),
  ('f2_import',      5000, 1000, 500,  5000, 50000, 'Tayyor F2 faylini o''qish'),
  ('katalog_import', 2000, 10000, 500, 2000, 30000, 'Narx katalogi yuklash'),
  ('f2_qoralama',    0, 100, 0, 0, null, 'Maʼlumot kiritish — bepul (pul hujjat chiqqanda)'),
  ('ai_kirish',      0, 1000, 38.1, 0, null, 'AI kiruvchi matn: 1000 LLM token tannarxi (≈ $0.003 × kurs)'),
  ('ai_chiqish',     0, 1000, 190.5, 0, null, 'AI javobi: 1000 LLM token tannarxi (≈ $0.015 × kurs)')
) as v(amal, asos, birlik, bsom, mn, mx, izoh)
where n.amal = v.amal;

-- ═══ 3. Hisob (sof, to'liq izoh bilan) ═══
create or replace function public.t2_token_hisobla_v2(p_amal text, p_birlik_soni numeric) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.t2_token_narx%rowtype; s public.t2_token_sozlama%rowtype; n numeric := greatest(coalesce(p_birlik_soni, 0), 0);
  v_qism numeric; v_tannarx numeric; v_foyda numeric; v_som numeric; v_token numeric;
begin
  select * into v from t2_token_narx where amal = p_amal and faol;
  if not found then return null; end if;
  select * into s from t2_token_sozlama where id = 1;
  v_qism := case when v.tur = 'ai' then n / v.birlik else ceil(n / v.birlik) end;
  v_tannarx := round(v.asos_som + v_qism * v.birlik_som, 2);
  v_foyda := coalesce(v.foyda_foiz, s.foyda_foiz);
  v_som := round(v_tannarx * (1 + v_foyda / 100), 2);
  if v_tannarx > 0 then v_som := greatest(v_som, v.min_som); end if;
  if v.max_som is not null then v_som := least(v_som, v.max_som); end if;
  v_token := case when v_som <= 0 then 0 else ceil(v_som / s.token_som) end;
  return jsonb_build_object('amal', v.amal, 'nom', v.nom, 'birlik_soni', n, 'birlik', v.birlik, 'qism', v_qism,
    'asos_som', v.asos_som, 'birlik_som', v.birlik_som, 'tannarx_som', v_tannarx, 'foyda_foiz', v_foyda,
    'min_som', v.min_som, 'max_som', v.max_som, 'yakuniy_som', v_som, 'token_som', s.token_som, 'token', v_token);
end $$;

-- Eski chaqiruvlar uchun moslik (holat, tahlil): token soni.
create or replace function public.t2_token_hisobla(p_amal text, p_birlik_soni numeric) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select (public.t2_token_hisobla_v2(p_amal, p_birlik_soni)->>'token')::numeric $$;

-- ═══ 4. Sarf v2: to'liq hisob, bir xil hujjat qayta — bepul ═══
create or replace function public.t2_token_sarfla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_amal text, p_birlik_soni numeric,
  p_operation_id uuid, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev public.t2_token_harakat%rowtype; v_h jsonb; v_narx numeric; v_balans numeric; v_xesh text := nullif(p_meta->>'xesh', '');
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v_prev from public.t2_token_harakat where operation_id = p_operation_id;
  if found then
    if v_prev.kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_BAND'); end if;
    return jsonb_build_object('ok', true, 'takror', true, 'sarflandi', -v_prev.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  v_h := public.t2_token_hisobla_v2(p_amal, p_birlik_soni);
  if v_h is null then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  v_narx := (v_h->>'token')::numeric;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
  -- Bir xil hujjat (mazmun xeshi) shu kompaniyada allaqachon to'langan va qaytarilmagan bo'lsa — qayta to'lov yo'q.
  if v_xesh is not null and exists (
       select 1 from public.t2_token_harakat h
        where h.kompaniya_id = p_kompaniya_id and h.tur = 'sarf' and h.amal = p_amal and h.meta->>'xesh' = v_xesh
          and not exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) then
    return jsonb_build_object('ok', true, 'sarflandi', 0, 'bepul_takror', true, 'hisob', v_h, 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  v_balans := public.t2_token_balans(p_kompaniya_id);
  if v_narx > 0 and v_balans < v_narx then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_YETMAYDI', 'kerak', v_narx, 'balans', v_balans, 'hisob', v_h);
  end if;
  if v_narx > 0 then
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, birlik_soni, meta, operation_id)
    values (p_kompaniya_id, p_actor_id, -v_narx, 'sarf', p_amal, p_birlik_soni, coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('hisob', v_h), p_operation_id);
  end if;
  return jsonb_build_object('ok', true, 'sarflandi', v_narx, 'hisob', v_h, 'balans', v_balans - v_narx);
end $$;

-- ═══ 5. Sinov bonusi (ro'yxat va Google) — bir martalik, sozlamadan ═══
create or replace function public._t2_sinov_bonus(p_kompaniya_id bigint, p_foydalanuvchi_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v numeric;
begin
  select royxat_bonus_token into v from t2_token_sozlama where id = 1;
  if coalesce(v, 0) > 0 then
    insert into t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
    values (p_kompaniya_id, p_foydalanuvchi_id, v, 'bonus', 'Sinov bonusi (bir marta)', md5('t2_sinov_bonus:' || p_kompaniya_id)::uuid)
    on conflict (operation_id) do nothing;
  end if;
end $$;
revoke all on function public._t2_sinov_bonus(bigint, bigint) from public, anon, authenticated;

-- Tariflar: oylik token = narx / token_som + chegirma; bepul — oylik token yo'q (faqat sinov bonusi).
update public.t2_tarif set nom = 'Bepul sinov', oylik_token = 0 where kod = 'free';
update public.t2_tarif set narx_som = 299000, oylik_token = 3300 where kod = 'pto_start';
update public.t2_tarif set narx_som = 799000, oylik_token = 9200 where kod = 'pto_pro';
update public.t2_tarif set narx_som = 1999000, oylik_token = 24000 where kod = 'pto_expert';
-- Bepul obunada oylik harakat yozilmasin (obuna_belgila: oylik_token > 0 sharti bor).

-- ═══ 6. Token paketlari va to'lov so'rovlari (hozir — qo'lda tasdiq; Payme/Click — shu jadvalga avtomatik) ═══
create table if not exists public.t2_token_paket (
  kod text primary key, nom text not null, token numeric(12,2) not null check (token > 0), narx_som numeric(14,2) not null check (narx_som > 0),
  faol boolean not null default true, tartib int not null default 0);
alter table public.t2_token_paket enable row level security;
revoke all on public.t2_token_paket from anon, authenticated;
insert into public.t2_token_paket(kod, nom, token, narx_som, tartib) values
  ('p500', '500 token', 500, 50000, 1),
  ('p1100', '1 100 token (+10%)', 1100, 100000, 2),
  ('p3450', '3 450 token (+15%)', 3450, 300000, 3),
  ('p12000', '12 000 token (+20%)', 12000, 1000000, 4)
on conflict (kod) do nothing;

create table if not exists public.t2_tolov_sorov (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  foydalanuvchi_id bigint,
  paket_kod text references public.t2_token_paket(kod),
  token numeric(12,2) not null check (token > 0),
  summa_som numeric(14,2) not null check (summa_som > 0),
  usul text not null check (usul in ('otkazma', 'payme', 'click')),
  tolov_malumot text,
  holat text not null default 'kutilmoqda' check (holat in ('kutilmoqda', 'tasdiqlandi', 'rad', 'bekor')),
  tashqi_id text,
  operation_id uuid not null unique,
  kim_hal_qildi bigint, hal_qilindi timestamptz, sabab text,
  yaratildi timestamptz not null default now());
create index if not exists t2_tolov_sorov_holat_idx on public.t2_tolov_sorov(holat, id desc);
create unique index if not exists t2_tolov_sorov_tashqi_uq on public.t2_tolov_sorov(usul, tashqi_id) where tashqi_id is not null;
alter table public.t2_tolov_sorov enable row level security;
revoke all on public.t2_tolov_sorov from anon, authenticated;

create or replace function public.t2_tolov_sorov_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_paket_kod text, p_usul text, p_tolov_malumot text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p public.t2_token_paket%rowtype; v_id bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select id into v_id from t2_tolov_sorov where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'sorov_id', v_id); end if;
  if p_usul not in ('otkazma', 'payme', 'click') then return jsonb_build_object('ok', false, 'code', 'USUL_NOTOGRI'); end if;
  select * into v_p from t2_token_paket where kod = p_paket_kod and faol;
  if not found then return jsonb_build_object('ok', false, 'code', 'PAKET_YOQ'); end if;
  if p_usul = 'otkazma' and length(btrim(coalesce(p_tolov_malumot, ''))) < 4 then
    return jsonb_build_object('ok', false, 'code', 'TOLOV_MALUMOT_KERAK', 'xabar', 'Toʻlov maʼlumotini yozing (chek raqami, vaqt, karta oxirgi 4 raqami)');
  end if;
  if (select count(*) from t2_tolov_sorov where kompaniya_id = p_kompaniya_id and holat = 'kutilmoqda') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'KUTILAYOTGAN_KOP', 'xabar', 'Kutilayotgan soʻrovlar juda koʻp — avvalgilari koʻrib chiqilsin');
  end if;
  insert into t2_tolov_sorov(kompaniya_id, foydalanuvchi_id, paket_kod, token, summa_som, usul, tolov_malumot, operation_id)
  values (p_kompaniya_id, p_actor_id, v_p.kod, v_p.token, v_p.narx_som, p_usul, left(btrim(coalesce(p_tolov_malumot, '')), 300), p_operation_id)
  returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'tolov_sorov', 'token', null, format('sorov=%s paket=%s summa=%s usul=%s', v_id, v_p.kod, v_p.narx_som, p_usul), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'sorov_id', v_id);
end $$;

/* Superadmin: so'rovni tasdiqlash (tokenlar darhol yoziladi — idempotent) yoki rad etish. Payme/Click ham shu yerga keladi. */
create or replace function public.t2_tolov_hal_qil_v1(p_actor_id bigint, p_sorov_id bigint, p_qaror text, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_s public.t2_tolov_sorov%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if p_qaror not in ('tasdiqlandi', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
  select * into v_s from t2_tolov_sorov where id = p_sorov_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_s.holat = p_qaror then return jsonb_build_object('ok', true, 'takror', true); end if;
  if v_s.holat <> 'kutilmoqda' then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_HAL_QILINGAN', 'holat', v_s.holat); end if;
  if p_qaror = 'rad' and nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'IZOH_MAJBURIY'); end if;
  update t2_tolov_sorov set holat = p_qaror, kim_hal_qildi = p_actor_id, hal_qilindi = now(), sabab = left(p_sabab, 300) where id = v_s.id;
  if p_qaror = 'tasdiqlandi' then
    insert into t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, meta, operation_id)
    values (v_s.kompaniya_id, p_actor_id, v_s.token, 'toldirish',
      format('Toʻlov #%s: %s soʻm (%s)', v_s.id, v_s.summa_som, v_s.usul),
      jsonb_build_object('sorov_id', v_s.id, 'summa_som', v_s.summa_som, 'usul', v_s.usul, 'paket', v_s.paket_kod),
      md5('t2_tolov_sorov:' || v_s.id)::uuid)
    on conflict (operation_id) do nothing;
  end if;
  perform public.t2_audit_yoz(v_s.kompaniya_id, 'tolov_' || p_qaror, 'token', null, format('sorov=%s summa=%s token=%s sabab=%s', v_s.id, v_s.summa_som, v_s.token, coalesce(left(p_sabab, 200), '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'balans', public.t2_token_balans(v_s.kompaniya_id));
end $$;

-- Boshqaruv: so'rovlar ro'yxati; sozlama va narx saqlash (v2 ustunlari bilan).
create or replace function public.t2_boshqaruv_tolovlar_v1(p_actor_id bigint, p_holat text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', s.id, 'vaqt', s.yaratildi, 'kompaniya_id', s.kompaniya_id, 'kompaniya', k.nom, 'kim', f.login, 'paket', s.paket_kod,
        'token', s.token, 'summa_som', s.summa_som, 'usul', s.usul, 'tolov_malumot', s.tolov_malumot, 'holat', s.holat, 'sabab', s.sabab, 'hal_qilindi', s.hal_qilindi) x
      from t2_tolov_sorov s join t2_kompaniya k on k.id = s.kompaniya_id left join t2_foydalanuvchi f on f.id = s.foydalanuvchi_id
     where p_holat is null or s.holat = p_holat order by s.id desc limit 300) q);
end $$;

create or replace function public.t2_boshqaruv_sozlama_saqla_v1(p_actor_id bigint, p_token_som numeric, p_foyda_foiz numeric, p_royxat_bonus numeric, p_usd_kurs numeric, p_tolov_rekvizit text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_e public.t2_token_sozlama%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if p_token_som is null or p_token_som <= 0 or p_foyda_foiz is null or p_foyda_foiz < 0 or p_foyda_foiz > 1000
     or p_royxat_bonus is null or p_royxat_bonus < 0 or p_usd_kurs is null or p_usd_kurs <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI');
  end if;
  select * into v_e from t2_token_sozlama where id = 1;
  update t2_token_sozlama set token_som = p_token_som, foyda_foiz = p_foyda_foiz, royxat_bonus_token = p_royxat_bonus, usd_kurs = p_usd_kurs,
    tolov_rekvizit = nullif(btrim(left(coalesce(p_tolov_rekvizit, ''), 500)), ''), yangilandi = now() where id = 1;
  perform public.t2_audit_yoz(v_ak, 'token_sozlama', 'boshqaruv', null,
    format('token_som %s->%s foyda %s->%s bonus %s->%s kurs %s->%s', v_e.token_som, p_token_som, v_e.foyda_foiz, p_foyda_foiz, v_e.royxat_bonus_token, p_royxat_bonus, v_e.usd_kurs, p_usd_kurs), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_boshqaruv_narx_v2_saqla(p_actor_id bigint, p_amal text, p_asos_som numeric, p_birlik int, p_birlik_som numeric,
  p_min_som numeric, p_max_som numeric, p_foyda_foiz numeric, p_faol boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_e public.t2_token_narx%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  select * into v_e from t2_token_narx where amal = p_amal;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if p_asos_som is null or p_asos_som < 0 or p_birlik is null or p_birlik < 1 or p_birlik_som is null or p_birlik_som < 0
     or p_min_som is null or p_min_som < 0 or (p_max_som is not null and p_max_som < p_min_som) or (p_foyda_foiz is not null and (p_foyda_foiz < 0 or p_foyda_foiz > 1000)) then
    return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI');
  end if;
  update t2_token_narx set asos_som = p_asos_som, birlik = p_birlik, birlik_som = p_birlik_som, min_som = p_min_som, max_som = p_max_som,
    foyda_foiz = p_foyda_foiz, faol = coalesce(p_faol, true), yangilandi = now() where amal = p_amal;
  perform public.t2_audit_yoz(v_ak, 'token_narx', 'boshqaruv', null,
    format('%s: asos %s->%s, %s/%s yach %s->%s, min %s->%s, max %s->%s, foyda %s->%s', p_amal, v_e.asos_som, p_asos_som, v_e.birlik_som, v_e.birlik, p_birlik_som, p_birlik,
      v_e.min_som, p_min_som, coalesce(v_e.max_som::text, '-'), coalesce(p_max_som::text, '-'), coalesce(v_e.foyda_foiz::text, 'umumiy'), coalesce(p_foyda_foiz::text, 'umumiy')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ═══ 7. Holat v2: narxlar (v2), sozlama, paketlar, o'z so'rovlari, harakatlar (hisob bilan) ═══
create or replace function public.t2_token_holat_v1(p_kompaniya_id bigint, p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'balans', public.t2_token_balans(p_kompaniya_id),
    'obuna', (select jsonb_build_object('tarif', o.tarif_kod, 'nom', t.nom, 'oylik_token', t.oylik_token, 'boshlandi', o.boshlandi, 'tugaydi', o.tugaydi)
                from public.t2_obuna o join public.t2_tarif t on t.kod = o.tarif_kod
               where o.kompaniya_id = p_kompaniya_id and o.holat = 'faol' order by o.id desc limit 1),
    'tariflar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'oylik_token', oylik_token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_tarif where faol),
    'narxlar', (select coalesce(jsonb_agg(jsonb_build_object('amal', amal, 'nom', nom, 'tur', tur, 'narx', narx, 'birlik', birlik, 'minimum', minimum,
        'asos_som', asos_som, 'birlik_som', birlik_som, 'min_som', min_som, 'max_som', max_som, 'foyda_foiz', foyda_foiz, 'izoh', izoh, 'faol', faol) order by amal), '[]'::jsonb) from public.t2_token_narx),
    'sozlama', (select jsonb_build_object('token_som', token_som, 'foyda_foiz', foyda_foiz, 'royxat_bonus_token', royxat_bonus_token, 'usd_kurs', usd_kurs, 'tolov_rekvizit', tolov_rekvizit) from public.t2_token_sozlama where id = 1),
    'paketlar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'token', token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_token_paket where faol),
    'sorovlar', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'vaqt', yaratildi, 'paket', paket_kod, 'token', token, 'summa_som', summa_som, 'usul', usul, 'holat', holat, 'sabab', sabab) order by id desc), '[]'::jsonb)
                   from (select * from public.t2_tolov_sorov where kompaniya_id = p_kompaniya_id order by id desc limit 20) s),
    'harakatlar', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('id', h.id, 'miqdor', h.miqdor, 'tur', h.tur, 'amal', h.amal, 'birlik_soni', h.birlik_soni, 'izoh', h.izoh, 'yaratildi', h.yaratildi,
            'meta', h.meta, 'kim', f.login, 'qaytarilgan', exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) x
          from public.t2_token_harakat h left join public.t2_foydalanuvchi f on f.id = h.foydalanuvchi_id
         where h.kompaniya_id = p_kompaniya_id order by h.id desc limit 200) q),
    'superadmin', public.t2_platforma_superadmin(p_actor_id),
    'demo_obyekt_id', (select obyekt_id from public.t2_demo_manba where id = 1));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.t2_token_hisobla_v2(text, numeric)', 'public.t2_token_hisobla(text, numeric)',
    'public.t2_tolov_sorov_yarat_v1(bigint, bigint, text, text, text, uuid)', 'public.t2_tolov_hal_qil_v1(bigint, bigint, text, text)',
    'public.t2_boshqaruv_tolovlar_v1(bigint, text)', 'public.t2_boshqaruv_sozlama_saqla_v1(bigint, numeric, numeric, numeric, numeric, text)',
    'public.t2_boshqaruv_narx_v2_saqla(bigint, text, numeric, int, numeric, numeric, numeric, numeric, boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if f not like 'public.t2_token_hisobla%' then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
end $$;

-- ═══ 8. Ro'yxat va Google: sinov bonusi sozlamadan (bir marta) ═══
create or replace function public.t2_ozi_royxat_v1(p_login text, p_parol text, p_ism text, p_telefon text, p_kompaniya_nom text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_login text := lower(btrim(coalesce(p_login, ''))); v_uid bigint; v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_prev public.t2_ozi_royxat_log%rowtype;
  v_email text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_ozi_royxat_log where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'login', v_login, 'kompaniya_id', v_prev.kompaniya_id); end if;
  if v_login !~ '^[a-z0-9][a-z0-9_.@+-]{2,79}$' or v_login ~ '@.*@' then
    return jsonb_build_object('ok', false, 'code', 'LOGIN_NOTOGRI', 'xabar', 'Login yoki email: lotin harf, raqam, _ . - @ (3–80 belgi)');
  end if;
  v_email := case when v_login ~ '^[^@]+@[^@]+\.[a-z]{2,}$' then v_login end;
  if length(coalesce(p_parol, '')) < 8 then return jsonb_build_object('ok', false, 'code', 'PAROL_QISQA', 'xabar', 'Parol kamida 8 belgi'); end if;
  if length(btrim(coalesce(p_ism, ''))) < 2 then return jsonb_build_object('ok', false, 'code', 'ISM_KERAK'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  if exists (select 1 from public.t2_foydalanuvchi where lower(login) = v_login or (v_email is not null and lower(email) = v_email)) then
    return jsonb_build_object('ok', false, 'code', 'LOGIN_BAND', 'xabar', 'Bu login/email band');
  end if;
  insert into public.t2_foydalanuvchi(login, email, ism, holat, parol_hash, parol_yangilandi)
  values (v_login, v_email, btrim(p_ism), 'faol', extensions.crypt(p_parol, extensions.gen_salt('bf', 10)), now()) returning id into v_uid;
  v_k := public._t2_kompaniya_yarat_asosiy(v_uid, coalesce(nullif(btrim(p_kompaniya_nom), ''), btrim(p_ism) || ' — PTO'), null, nullif(btrim(coalesce(p_telefon, '')), ''));
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ozi_royxat');
  perform public._t2_sinov_bonus(v_kid, v_uid);
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_uid, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('login=%s', v_login), 'ozi_royxat', p_ip_belgi);
  return jsonb_build_object('ok', true, 'login', v_login, 'kompaniya_id', v_kid, 'demo_obyekt_id', v_demo);
end $$;

create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_rol text;
  v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if coalesce(btrim(p_sub), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));

  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by id limit 1;
    if found then
      if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
      -- O'zi ro'yxatdan (parol bilan) o'tgan hisobning emaili TASDIQLANMAGAN: begona odam birovning emailini login qilib
      -- oldindan band qilgan bo'lishi mumkin — avtomatik ulamaymiz (egasi qo'shgan a'zolar emaili — ishonchli).
      if exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN', 'xabar', 'Bu email parol bilan ro''yxatdan o''tgan. Login va parol bilan kiring.');
      end if;
      update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(email, v_email) where id = v_u.id;
    end if;
  end if;

  if v_u.id is not null then
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
    v_rol := public._t2_asosiy_rol(v_u.id);
    return jsonb_build_object('ok', true, 'yangi', false, 'login', v_u.login, 'foydalanuvchi_id', v_u.id, 'rol', coalesce(v_rol, 'kuzatuvchi'));
  end if;

  -- Yangi hisob: o'zi ro'yxat qoidalari (qurilma limiti, bepul tarif, demo).
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, google_sub)
  values (v_email, v_email, v_ism, 'faol', p_sub) returning * into v_u;
  v_k := public._t2_kompaniya_yarat_asosiy(v_u.id, v_ism || ' — PTO', null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'google');
  perform public._t2_sinov_bonus(v_kid, v_u.id);
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $$;

commit;
