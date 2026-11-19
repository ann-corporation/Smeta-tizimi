-- 20270119000100 - TEXNADZOR TEKSHIRUVI TIZIM ICHIDA (egasi 2026-11-19): F-2 dagi QR -> tekshiruv paneli.
-- Haqiqiy ish tartibi: PTO F-2 yuboradi; texnadzor qatorlarni belgilaydi (rang, izoh, hajm, "olib tashlansin", "hujjat kerak"), qator qo'shishni TAKLIF qiladi;
-- PTO har taklifni alohida hal qiladi. TEXNADZOR F-2 GA TO'G'RIDAN-TO'G'RI YOZMAYDI: hammasi shu yerdagi TAKLIF yozuvlari (asl smeta va F-2 qoralama o'zgarmaydi).
-- Mavjud mexanizmlar KENGAYADI (parallel yo'l yo'q):
--   * QR/token = t2_nashr (har eksportdagi manba QR, /t/<token>); bu yerda nashr -> (akt, akt VERSIYASI) bog'lanishi (t2_tekshiruv_bog), alohida token yo'q.
--   * Ruxsat = a'zolik (PTO) | _t2_imzo_grant_v1 (buyurtmachi/texnadzor tomon granti, vakil shoxi bilan) | PTO bergan BIR MARTALIK kod (t2_tekshiruv_ruxsat).
--   * Yozuv F-2 ga FAQAT PTO qarori orqali, mavjud preview->tasdiq yo'lida (/api/f2-buyruq); bu migratsiya F-2 jadvallariga YOZMAYDI.
-- RPC lar faqat service_role (shlyuz /api/tekshiruv aktorni sessiyadan qo'yadi). Hisob/summa YO'Q: panelda faqat hajm (pul qatlami o'zgarmaydi).

-- ===== jadvallar =====
create table if not exists public.t2_tekshiruv_bog (
  id bigint generated always as identity primary key,
  nashr_id bigint not null unique references public.t2_nashr(id),
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  akt_id bigint not null references public.t2_akt(id),
  akt_versiya integer not null,
  yaratgan_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now()
);
create index if not exists t2_tekshiruv_bog_akt_ix on public.t2_tekshiruv_bog (akt_id, id desc);

create table if not exists public.t2_tekshiruv_ruxsat (
  id bigint generated always as identity primary key,
  bog_id bigint not null references public.t2_tekshiruv_bog(id),
  kod_xesh text not null unique check (kod_xesh ~ '^[0-9a-f]{64}$'),
  tekshiruvchi_ism text check (tekshiruvchi_ism is null or length(tekshiruvchi_ism) <= 120),
  muddat timestamptz not null,
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id),
  ishlatildi timestamptz,
  bekor timestamptz,
  yaratgan_id bigint not null references public.t2_foydalanuvchi(id),
  yaratildi timestamptz not null default now()
);
create index if not exists t2_tekshiruv_ruxsat_bog_ix on public.t2_tekshiruv_ruxsat (bog_id);

create table if not exists public.t2_tekshiruv (
  id bigint generated always as identity primary key,
  bog_id bigint not null references public.t2_tekshiruv_bog(id),
  tekshiruvchi_id bigint not null references public.t2_foydalanuvchi(id),
  holat text not null default 'qoralama' check (holat in ('qoralama', 'korib_chiqildi', 'qaytarildi', 'qabul')),
  izoh text check (izoh is null or length(izoh) <= 2000),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (bog_id, tekshiruvchi_id)
);

create table if not exists public.t2_tekshiruv_taklif (
  id bigint generated always as identity primary key,
  tekshiruv_id bigint not null references public.t2_tekshiruv(id),
  qator_id bigint not null references public.t2_qator(id),
  bayroq text check (bayroq is null or bayroq in ('olib_tashlansin', 'hajm_notogri', 'hujjat_kerak', 'qabul')),
  izoh text check (izoh is null or length(izoh) <= 1000),
  taklif_hajm numeric check (taklif_hajm is null or taklif_hajm >= 0),
  rang text check (rang is null or rang in ('qizil', 'sariq', 'yashil', 'kok')),
  hujjat_turi text check (hujjat_turi is null or length(hujjat_turi) <= 80),
  qosh boolean not null default false,                           -- F-2 da yo'q qator: smetadan qo'shish TAKLIFI
  qaror text not null default 'kutilmoqda' check (qaror in ('kutilmoqda', 'qabul', 'rad', 'keyinroq')),
  qaror_sabab text check (qaror_sabab is null or length(qaror_sabab) <= 1000),
  qaror_id bigint references public.t2_foydalanuvchi(id),
  qaror_vaqt timestamptz,
  hm_fayl_id bigint references public.t2_hm_fayl(id),   -- "hujjat kerak" talabiga PTO biriktirgan Disk fayli
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (tekshiruv_id, qator_id),
  check (bayroq is not null or izoh is not null or taklif_hajm is not null or qosh),
  check (bayroq is distinct from 'hujjat_kerak' or hujjat_turi is not null)
);
create index if not exists t2_tekshiruv_taklif_qator_ix on public.t2_tekshiruv_taklif (qator_id);

do $r$ declare t text; begin
  foreach t in array array['t2_tekshiruv_bog', 't2_tekshiruv_ruxsat', 't2_tekshiruv', 't2_tekshiruv_taklif'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $r$;
comment on table public.t2_tekshiruv_taklif is 'Texnadzor takliflari (F-2 qatori bo''yicha). F-2 ga yozilmaydi; PTO qarori mavjud preview->tasdiq yo''lida.';

-- ===== ruxsat yordamchisi =====
-- 'pto' - hujjat kompaniyasi a'zosi; 'tekshiruvchi' - buyurtmachi/texnadzor tomon granti yoki PTO bergan faol kod; aks holda NULL.
create or replace function public._t2_tekshiruv_rol_v1(p_actor bigint, p_bog_id bigint) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype;
begin
  if p_actor is null or p_actor <= 0 then return null; end if;
  select * into b from public.t2_tekshiruv_bog where id = p_bog_id;
  if not found then return null; end if;
  if not exists (select 1 from public.t2_foydalanuvchi u where u.id = p_actor and u.holat = 'faol') then return null; end if;
  if exists (select 1 from public.t2_azolik a where a.kompaniya_id = b.kompaniya_id and a.foydalanuvchi_id = p_actor and a.holat = 'faol') then return 'pto'; end if;
  if public._t2_imzo_grant_v1(p_actor, b.kompaniya_id, b.obyekt_id) then return 'tekshiruvchi'; end if;
  if exists (select 1 from public.t2_tekshiruv_ruxsat r where r.bog_id = b.id and r.foydalanuvchi_id = p_actor and r.bekor is null and r.muddat > now()) then return 'tekshiruvchi'; end if;
  return null;
end $$;

-- token -> bog (nashr tokeni orqali)
create or replace function public._t2_tekshiruv_bog_token_v1(p_token text) returns public.t2_tekshiruv_bog
language sql stable security definer set search_path = public, pg_temp as $$
  select b.* from public.t2_tekshiruv_bog b join public.t2_nashr n on n.id = b.nashr_id where n.token = p_token and p_token ~ '^[A-Za-z0-9_-]{22}$'
$$;

-- ===== bog'lash: nashr tokeni -> (akt, versiya). Eksport qiluvchi (kompaniya a'zosi) chaqiradi; takror - mavjud bog' =====
create or replace function public.t2_tekshiruv_bog_v1(p_actor_id bigint, p_token text, p_akt_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.t2_nashr%rowtype; a public.t2_akt%rowtype; b public.t2_tekshiruv_bog%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' or p_akt_id is null or p_akt_id <= 0 then return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI'); end if;
  select * into n from public.t2_nashr where token = p_token;
  if not found or p_actor_id is null or not exists (select 1 from public.t2_azolik z where z.kompaniya_id = n.kompaniya_id and z.foydalanuvchi_id = p_actor_id and z.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  select * into a from public.t2_akt where id = p_akt_id;
  if not found or a.kompaniya_id is distinct from n.kompaniya_id or a.tur <> 'f2' or a.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'AKT_TOPILMADI'); end if;
  select * into b from public.t2_tekshiruv_bog where nashr_id = n.id;
  if found then
    if b.akt_id <> a.id then return jsonb_build_object('ok', false, 'code', 'TOKEN_BAND'); end if;
    return jsonb_build_object('ok', true, 'bog_id', b.id, 'akt_versiya', b.akt_versiya, 'yangi', false);
  end if;
  insert into public.t2_tekshiruv_bog (nashr_id, kompaniya_id, obyekt_id, akt_id, akt_versiya, yaratgan_id)
  values (n.id, a.kompaniya_id, a.obyekt_id, a.id, a.versiya, p_actor_id) returning * into b;
  return jsonb_build_object('ok', true, 'bog_id', b.id, 'akt_versiya', b.akt_versiya, 'yangi', true);
end $$;

-- ===== panelni ochish: F-2 qatorlari smeta tartibida (bo'lim bilan) + takliflar =====
create or replace function public.t2_tekshiruv_ochish_v1(p_actor_id bigint, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype; v_rol text; a public.t2_akt%rowtype; v_ob text; v_komp text; v_qat jsonb; v_tak jsonb; v_tek jsonb;
begin
  b := public._t2_tekshiruv_bog_token_v1(p_token);
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_rol := public._t2_tekshiruv_rol_v1(p_actor_id, b.id);
  if v_rol is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select * into a from public.t2_akt where id = b.akt_id;
  select nom into v_ob from public.t2_obyekt where id = b.obyekt_id;
  select nom into v_komp from public.t2_kompaniya where id = b.kompaniya_id;
  select coalesce(jsonb_agg(jsonb_build_object('akt_qator_id', x.aid, 'qator_id', x.qid, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'tur', x.tur,
           'ota_id', x.ota_id, 'bolim', x.bolim, 'hajm', x.hajm) order by x.tartib nulls last, x.qid), '[]'::jsonb) into v_qat
    from (select aq.id aid, q.id qid, q.kod, q.nom, q.birlik, q.tur, q.ota_id, q.tartib, coalesce(aq.certified_quantity, aq.hajm) hajm,
                 (with recursive z(id, ota_id, tur, nom, d) as (
                    select q.id, q.ota_id, q.tur, q.nom, 0
                    union all select p.id, p.ota_id, p.tur, p.nom, z.d + 1 from z join public.t2_qator p on p.id = z.ota_id where z.d < 6 and z.tur <> 'rz')
                  select z.nom from z where z.tur = 'rz' limit 1) bolim
            from public.t2_akt_qator aq join public.t2_qator q on q.id = aq.qator_id
           where aq.akt_id = b.akt_id and aq.manba_akt_qator_id is null order by q.tartib nulls last, q.id limit 5000) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tekshiruvchi_id', t.tekshiruvchi_id, 'tekshiruvchi', left(coalesce(nullif(btrim(u.ism), ''), u.login), 120),
           'holat', t.holat, 'izoh', t.izoh, 'yangilandi', t.yangilandi, 'meniki', t.tekshiruvchi_id = p_actor_id) order by t.id), '[]'::jsonb) into v_tek
    from public.t2_tekshiruv t join public.t2_foydalanuvchi u on u.id = t.tekshiruvchi_id
   where t.bog_id = b.id and (v_rol = 'pto' or t.tekshiruvchi_id = p_actor_id);
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'tekshiruv_id', k.tekshiruv_id, 'qator_id', k.qator_id, 'bayroq', k.bayroq, 'izoh', k.izoh,
           'taklif_hajm', k.taklif_hajm, 'rang', k.rang, 'hujjat_turi', k.hujjat_turi, 'qosh', k.qosh, 'qaror', k.qaror, 'qaror_sabab', k.qaror_sabab, 'hujjat_bor', k.hm_fayl_id is not null,
           'nom', case when k.qosh then q.nom end, 'kod', case when k.qosh then q.kod end, 'birlik', case when k.qosh then q.birlik end) order by k.id), '[]'::jsonb) into v_tak
    from public.t2_tekshiruv_taklif k join public.t2_tekshiruv t on t.id = k.tekshiruv_id join public.t2_qator q on q.id = k.qator_id
   where t.bog_id = b.id and (v_rol = 'pto' or t.tekshiruvchi_id = p_actor_id);
  return jsonb_build_object('ok', true, 'rol', v_rol,
    'bog', jsonb_build_object('id', b.id, 'akt_versiya', b.akt_versiya),
    'akt', jsonb_build_object('id', a.id, 'raqam', a.raqam, 'oy', a.oy, 'holat', a.holat, 'versiya', a.versiya, 'eskirgan', a.versiya is distinct from b.akt_versiya),
    'obyekt', jsonb_build_object('id', b.obyekt_id, 'nom', v_ob), 'kompaniya', v_komp, 'kompaniya_id', b.kompaniya_id,
    'qatorlar', v_qat, 'tekshiruvlar', v_tek, 'takliflar', v_tak);
end $$;

comment on function public.t2_tekshiruv_ochish_v1(bigint, text) is 'versiya: tarix - F-2 qatorlari akt orqali (akt_qator), shu aktga yozilgan eski versiya qatori ham ko''rinadi; smeta asosi emas.';

-- ===== taklif saqlash (qator bo'yicha upsert; hammasi bo'sh bo'lsa - o'chiriladi, qaror qo'yilmagan bo'lsa) =====
create or replace function public.t2_tekshiruv_saqla_v1(p_actor_id bigint, p_token text, p_qator_id bigint, p_bayroq text, p_izoh text,
  p_taklif_hajm numeric, p_rang text, p_hujjat_turi text, p_qosh boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype; v_rol text; t public.t2_tekshiruv%rowtype; k public.t2_tekshiruv_taklif%rowtype;
        v_izoh text := nullif(btrim(coalesce(p_izoh, '')), ''); v_ht text := nullif(btrim(coalesce(p_hujjat_turi, '')), ''); v_bosh boolean;
begin
  b := public._t2_tekshiruv_bog_token_v1(p_token);
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_rol := public._t2_tekshiruv_rol_v1(p_actor_id, b.id);
  if v_rol is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_qator_id is null or p_qator_id <= 0 or length(coalesce(v_izoh, '')) > 1000 or length(coalesce(v_ht, '')) > 80
     or (p_bayroq is not null and p_bayroq not in ('olib_tashlansin', 'hajm_notogri', 'hujjat_kerak', 'qabul'))
     or (p_rang is not null and p_rang not in ('qizil', 'sariq', 'yashil', 'kok')) or (p_taklif_hajm is not null and p_taklif_hajm < 0)
     or (p_bayroq = 'hujjat_kerak' and v_ht is null) then
    return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI');
  end if;
  -- qator shu F-2 da bo'lishi shart; "qo'shish" taklifida - shu obyekt smetasida bo'lib, F-2 da YO'Q bo'lishi shart
  if coalesce(p_qosh, false) then
    if not exists (select 1 from public.t2_qator q where q.id = p_qator_id and q.obyekt_id = b.obyekt_id and coalesce(q.versiya_holat, 'faol') = 'faol')
       or exists (select 1 from public.t2_akt_qator aq where aq.akt_id = b.akt_id and aq.qator_id = p_qator_id) then
      return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI');
    end if;
  elsif not exists (select 1 from public.t2_akt_qator aq where aq.akt_id = b.akt_id and aq.qator_id = p_qator_id and aq.manba_akt_qator_id is null) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI');
  end if;
  insert into public.t2_tekshiruv (bog_id, tekshiruvchi_id) values (b.id, p_actor_id) on conflict (bog_id, tekshiruvchi_id) do nothing;
  select * into t from public.t2_tekshiruv where bog_id = b.id and tekshiruvchi_id = p_actor_id for update;
  v_bosh := p_bayroq is null and v_izoh is null and p_taklif_hajm is null and not coalesce(p_qosh, false);
  select * into k from public.t2_tekshiruv_taklif where tekshiruv_id = t.id and qator_id = p_qator_id for update;
  if found and k.qaror <> 'kutilmoqda' then return jsonb_build_object('ok', false, 'code', 'QAROR_QOYILGAN'); end if;   -- PTO hal qilgan taklif o'zgarmaydi
  if v_bosh then
    if found then delete from public.t2_tekshiruv_taklif where id = k.id; end if;
    return jsonb_build_object('ok', true, 'ochirildi', true);
  end if;
  if found then
    update public.t2_tekshiruv_taklif set bayroq = p_bayroq, izoh = v_izoh, taklif_hajm = p_taklif_hajm, rang = p_rang, hujjat_turi = v_ht, qosh = coalesce(p_qosh, false), yangilandi = now() where id = k.id returning * into k;
  else
    insert into public.t2_tekshiruv_taklif (tekshiruv_id, qator_id, bayroq, izoh, taklif_hajm, rang, hujjat_turi, qosh)
    values (t.id, p_qator_id, p_bayroq, v_izoh, p_taklif_hajm, p_rang, v_ht, coalesce(p_qosh, false)) returning * into k;
  end if;
  -- yangi o'zgarish - umumiy holat qoralamaga qaytadi (PTO "Ko'rib chiqildi" ni qayta ko'rsin)
  update public.t2_tekshiruv set holat = case when holat = 'qoralama' then holat else 'qoralama' end, yangilandi = now() where id = t.id;
  return jsonb_build_object('ok', true, 'id', k.id);
end $$;

-- ===== umumiy holat: Ko'rib chiqildi / Qaytarildi / Qabul qilindi =====
create or replace function public.t2_tekshiruv_holat_v1(p_actor_id bigint, p_token text, p_holat text, p_izoh text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype; v_rol text; t public.t2_tekshiruv%rowtype;
begin
  b := public._t2_tekshiruv_bog_token_v1(p_token);
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_rol := public._t2_tekshiruv_rol_v1(p_actor_id, b.id);
  if v_rol is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_holat is null or p_holat not in ('qoralama', 'korib_chiqildi', 'qaytarildi', 'qabul') or length(coalesce(p_izoh, '')) > 2000 then return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI'); end if;
  insert into public.t2_tekshiruv (bog_id, tekshiruvchi_id) values (b.id, p_actor_id) on conflict (bog_id, tekshiruvchi_id) do nothing;
  update public.t2_tekshiruv set holat = p_holat, izoh = nullif(btrim(coalesce(p_izoh, '')), ''), yangilandi = now()
   where bog_id = b.id and tekshiruvchi_id = p_actor_id returning * into t;
  return jsonb_build_object('ok', true, 'holat', t.holat, 'tekshiruv_id', t.id);
end $$;

-- ===== smetadan qidirish (qator qo'shishni taklif qilish uchun): faqat nom/kod/birlik, PUL YO'Q =====
create or replace function public.t2_tekshiruv_qidir_v1(p_actor_id bigint, p_token text, p_q text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype; v_q text := btrim(coalesce(p_q, ''));
begin
  b := public._t2_tekshiruv_bog_token_v1(p_token);
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if public._t2_tekshiruv_rol_v1(p_actor_id, b.id) is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if length(v_q) < 2 or length(v_q) > 80 then return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI'); end if;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return jsonb_build_object('ok', true, 'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('qator_id', x.id, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'tur', x.tur) order by x.tartib nulls last, x.id)
    from (select q.id, q.kod, q.nom, q.birlik, q.tur, q.tartib from public.t2_qator q
           where q.obyekt_id = b.obyekt_id and coalesce(q.versiya_holat, 'faol') = 'faol' and q.tur in ('bl', 'mat', 'rs', 'ob')
             and (q.nom ilike '%' || v_q || '%' or q.kod ilike '%' || v_q || '%')
             and not exists (select 1 from public.t2_akt_qator aq where aq.akt_id = b.akt_id and aq.qator_id = q.id)
           order by q.tartib nulls last, q.id limit 20) x), '[]'::jsonb));
end $$;

-- ===== PTO bergan BIR MARTALIK kirish kodi (tizimda hisobi bor tashqi tekshiruvchi uchun) =====
create or replace function public.t2_tekshiruv_kod_ber_v1(p_actor_id bigint, p_token text, p_kod_xesh text, p_ism text, p_soat integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype;
begin
  b := public._t2_tekshiruv_bog_token_v1(p_token);
  if b.id is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if public._t2_tekshiruv_rol_v1(p_actor_id, b.id) is distinct from 'pto' then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_kod_xesh is null or p_kod_xesh !~ '^[0-9a-f]{64}$' or p_soat is null or p_soat not between 1 and 336 or length(coalesce(p_ism, '')) > 120 then return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI'); end if;
  insert into public.t2_tekshiruv_ruxsat (bog_id, kod_xesh, tekshiruvchi_ism, muddat, yaratgan_id)
  values (b.id, p_kod_xesh, nullif(btrim(coalesce(p_ism, '')), ''), now() + make_interval(hours => p_soat), p_actor_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_tekshiruv_kod_ol_v1(p_actor_id bigint, p_token text, p_kod_xesh text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype; r public.t2_tekshiruv_ruxsat%rowtype;
begin
  b := public._t2_tekshiruv_bog_token_v1(p_token);
  if b.id is null or p_actor_id is null or p_kod_xesh is null or p_kod_xesh !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from public.t2_foydalanuvchi u where u.id = p_actor_id and u.holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'KOD_YAROQSIZ'); end if;
  select * into r from public.t2_tekshiruv_ruxsat where bog_id = b.id and kod_xesh = p_kod_xesh for update;
  if not found or r.bekor is not null or r.muddat <= now() then return jsonb_build_object('ok', false, 'code', 'KOD_YAROQSIZ'); end if;
  if r.foydalanuvchi_id is not null and r.foydalanuvchi_id <> p_actor_id then return jsonb_build_object('ok', false, 'code', 'KOD_ISHLATILGAN'); end if;
  if r.foydalanuvchi_id is null then update public.t2_tekshiruv_ruxsat set foydalanuvchi_id = p_actor_id, ishlatildi = now() where id = r.id; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ===== huquqlar: faqat service_role =====
do $g$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 't2\_tekshiruv\_%' or p.proname like '\_t2\_tekshiruv\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $g$;
