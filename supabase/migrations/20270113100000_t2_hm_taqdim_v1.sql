-- Hujjat maydoni - 2-faza: TAQDIM (tomonlararo o'zgarmas surat). Egasi 2026-11-18 (5-qaror): tomonlararo yozuvchi umumiy papka YO'Q;
-- pudratchi / sub / buyurtmachiga fayl yoki papka faqat TAQDIM bilan beriladi.
-- Naqsh: t2_tomon_taqdim (faol aloqa t2_tomon_aloqa, a'zolik roli t2_tomon rol qoidasi, o'zgarmas jurnal t2_tomon_hodisa) QAYTA ISHLATILADI;
-- t2_tomon_taqdim ga tegilmaydi (u F2/registry hujjatlari uchun, tekshiruv-qaror oqimi bilan). Bu yerda: «ko'rsatish» surati, qaror oqimi yo'q.
--  * Taqdim = o'sha paytdagi JORIY versiyalarning surati (fayl, yoki papka daraxti <= 200 fayl). Yuboruvchi keyin faylni almashtirsa ham,
--    oluvchi taqdim qilingan versiyani ko'radi; o'zgarmaydi.
--  * Taqdim faol ekan, shu fayllar (versiyalari) tozalashdan HIMOYALANADI (savat 30 kun, eski versiyalarni o'chirish, abadiy o'chirish).
--  * Oluvchi tomon FAQAT o'qiydi (ko'rish / yuklab olish). Qaytarish (bekor) - yuboruvchi; aloqa yopilsa ham ko'rinish yopiladi.
--  * Audit: t2_tomon_hodisa (o'zgarmas) + t2_hm_faoliyat (ikkala kompaniya lentasi) + t2_outbox (oluvchiga bildirishnoma).
-- Shaxsiy fayl taqdim qilinmaydi (kompaniya subyekti yo'q). Hamma RPC faqat service_role (Cloudflare Functions, sessiya aktori).

create table if not exists public.t2_hm_taqdim (
  id bigint generated always as identity primary key,
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  yuboruvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  qabul_kompaniya_id bigint not null references public.t2_kompaniya(id),
  nishon_turi text not null check (nishon_turi in ('fayl', 'papka')),
  nom text not null check (length(btrim(nom)) between 1 and 300),
  fayl_soni integer not null check (fayl_soni between 1 and 200),
  jami_bayt bigint not null check (jami_bayt >= 0),
  izoh text check (izoh is null or length(izoh) <= 1000),
  holat text not null default 'faol' check (holat in ('faol', 'qaytarilgan')),
  taqdim_actor_id bigint not null,
  taqdim_vaqti timestamptz not null default now(),
  qaytardi_actor_id bigint,
  qaytarildi timestamptz,
  qaytarish_sababi text check (qaytarish_sababi is null or length(qaytarish_sababi) <= 500),
  operation_id uuid,
  check (yuboruvchi_kompaniya_id <> qabul_kompaniya_id)
);
create unique index if not exists t2_hm_taqdim_operation_uq on public.t2_hm_taqdim(yuboruvchi_kompaniya_id, operation_id) where operation_id is not null;
create index if not exists t2_hm_taqdim_qabul_ix on public.t2_hm_taqdim(qabul_kompaniya_id, taqdim_vaqti desc);
create index if not exists t2_hm_taqdim_yuboruvchi_ix on public.t2_hm_taqdim(yuboruvchi_kompaniya_id, taqdim_vaqti desc);

-- Surat qatorlari: baytlar R2 da (mavjud versiya obyektlari), bu yerda faqat metama'lumot. fayl/versiya o'chsa ham surat qatori (nom, sha256) qoladi.
create table if not exists public.t2_hm_taqdim_el (
  id bigint generated always as identity primary key,
  taqdim_id bigint not null references public.t2_hm_taqdim(id) on delete cascade,
  yol text not null default '',
  nom text not null,
  fayl_id bigint references public.t2_hm_fayl(id) on delete set null,
  versiya_id bigint references public.t2_hm_versiya(id) on delete set null,
  raqam integer not null,
  r2_kalit text not null,
  bayt bigint not null,
  sha256 text not null,
  mime text not null
);
create index if not exists t2_hm_taqdim_el_taqdim_ix on public.t2_hm_taqdim_el(taqdim_id);
create index if not exists t2_hm_taqdim_el_fayl_ix on public.t2_hm_taqdim_el(fayl_id) where fayl_id is not null;
create index if not exists t2_hm_taqdim_el_versiya_ix on public.t2_hm_taqdim_el(versiya_id) where versiya_id is not null;
alter table public.t2_hm_taqdim enable row level security;
alter table public.t2_hm_taqdim_el enable row level security;
revoke all on table public.t2_hm_taqdim, public.t2_hm_taqdim_el from anon, authenticated;

-- ---------------------------------------------------------------- himoya (pin)
create or replace function public._t2_hm_pinli_fayl_v1(p_fayl bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_hm_taqdim_el e join public.t2_hm_taqdim t on t.id = e.taqdim_id where e.fayl_id = p_fayl and t.holat = 'faol') $$;
create or replace function public._t2_hm_pinli_versiya_v1(p_versiya bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_hm_taqdim_el e join public.t2_hm_taqdim t on t.id = e.taqdim_id where e.versiya_id = p_versiya and t.holat = 'faol') $$;

-- a'zolik + rol qoidasi (t2_tomon naqshi); a'zo emas yoki rol yetmasa NULL
create or replace function public._t2_hm_taqdim_rol_v1(p_actor bigint, p_kompaniya bigint, p_amal text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select a.rol from public.t2_azolik a
   where a.kompaniya_id = p_kompaniya and a.foydalanuvchi_id = p_actor and a.holat = 'faol' and public._t2_tomon_rol_ok(a.rol, p_amal) limit 1 $$;

-- Nishon (fayl yoki papka daraxti) -> taqdim qatorlari. Faqat savatda emas, joriy 'tayyor' versiyali fayllar; chegara 201 (chaqiruvchi >200 ni rad etadi).
create or replace function public._t2_hm_taqdim_yig_v1(p_turi text, p_id bigint)
returns table (yol text, nom text, fayl_id bigint, versiya_id bigint, raqam integer, r2_kalit text, bayt bigint, sha256 text, mime text)
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive z(id, yol) as (
    select p.id, p.nom from public.t2_fayl_papka p where p_turi = 'papka' and p.id = p_id
    union all
    select c.id, z.yol || '/' || c.nom from public.t2_fayl_papka c join z on c.ota_id = z.id
  )
  select coalesce(z.yol, ''), f.nom, f.id, v.id, v.raqam, v.r2_kalit, v.bayt, v.sha256, v.mime
    from public.t2_hm_fayl f
    join public.t2_hm_versiya v on v.id = f.joriy_versiya_id and v.holat = 'tayyor'
    left join z on z.id = f.papka_id
   where f.savatda is null
     and ((p_turi = 'fayl' and f.id = p_id) or (p_turi = 'papka' and f.papka_id in (select id from z)))
   order by 1, f.nom limit 201 $$;

-- ---------------------------------------------------------------- RPC
-- Qayerga yuborish mumkin: kompaniyaning FAOL aloqalari (qarshi tomon nomi va roli bilan).
create or replace function public.t2_hm_taqdim_nishon_v1(p_actor bigint, p_kompaniya bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public._t2_hm_taqdim_rol_v1(p_actor, p_kompaniya, 'taqdim') is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('aloqa_id', a.id, 'kompaniya_id', q.id, 'nom', q.nom,
        'rol', case when a.taklif_kompaniya_id = p_kompaniya then a.qabul_rol else a.taklif_rol end, 'turi', a.turi) order by q.nom, a.id)
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya q on q.id = case when a.taklif_kompaniya_id = p_kompaniya then a.qabul_kompaniya_id else a.taklif_kompaniya_id end
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya or a.qabul_kompaniya_id = p_kompaniya)), '[]'::jsonb));
end $$;

create or replace function public.t2_hm_taqdim_yarat_v1(p_actor bigint, p_nishon_turi text, p_nishon_id bigint, p_aloqa_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.t2_hm_fayl%rowtype; p public.t2_fayl_papka%rowtype; a public.t2_tomon_aloqa%rowtype; v_k bigint; v_qarshi bigint; v_nom text; v_fayl bigint;
  v_soni integer; v_bayt bigint; v_id bigint; v_old public.t2_hm_taqdim%rowtype; v_izoh text := nullif(btrim(coalesce(p_izoh, '')), ''); v_users bigint[]; v_qn text;
begin
  if p_nishon_turi not in ('fayl', 'papka') or p_nishon_id is null then return jsonb_build_object('ok', false, 'code', 'NISHON_TOPILMADI'); end if;
  if v_izoh is not null and length(v_izoh) > 1000 then v_izoh := left(v_izoh, 1000); end if;
  if p_nishon_turi = 'fayl' then
    select * into f from public.t2_hm_fayl where id = p_nishon_id;
    if not found or f.savatda is not null then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    if f.kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'TAQDIM_SHAXSIY'); end if;
    v_k := f.kompaniya_id; v_nom := f.nom; v_fayl := f.id;
    if public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  else
    select * into p from public.t2_fayl_papka where id = p_nishon_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'PAPKA_TOPILMADI'); end if;
    if p.kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'TAQDIM_SHAXSIY'); end if;
    v_k := p.kompaniya_id; v_nom := p.nom;
    if public._t2_hm_daraja_v1(p_actor, p.kompaniya_id, p.egasi_foydalanuvchi_id, p.id, null) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  end if;
  if public._t2_hm_taqdim_rol_v1(p_actor, v_k, 'taqdim') is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;

  if p_operation_id is not null then
    select * into v_old from public.t2_hm_taqdim where yuboruvchi_kompaniya_id = v_k and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'takror', true); end if;
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id and holat = 'faol' and (taklif_kompaniya_id = v_k or qabul_kompaniya_id = v_k);
  if not found then return jsonb_build_object('ok', false, 'code', 'TAQDIM_ALOQA_YOQ'); end if;
  v_qarshi := public._t2_tomon_qarshi(a, v_k);
  if v_qarshi is null then return jsonb_build_object('ok', false, 'code', 'TAQDIM_ALOQA_YOQ'); end if;

  select count(*), coalesce(sum(y.bayt), 0) into v_soni, v_bayt from public._t2_hm_taqdim_yig_v1(p_nishon_turi, p_nishon_id) y;
  if v_soni = 0 then return jsonb_build_object('ok', false, 'code', 'TAQDIM_BOSH'); end if;
  if v_soni > 200 then return jsonb_build_object('ok', false, 'code', 'TAQDIM_KO_P'); end if;

  insert into public.t2_hm_taqdim(aloqa_id, yuboruvchi_kompaniya_id, qabul_kompaniya_id, nishon_turi, nom, fayl_soni, jami_bayt, izoh, taqdim_actor_id, operation_id)
  values (a.id, v_k, v_qarshi, p_nishon_turi, left(v_nom, 300), v_soni, v_bayt, v_izoh, p_actor, p_operation_id) returning id into v_id;
  insert into public.t2_hm_taqdim_el(taqdim_id, yol, nom, fayl_id, versiya_id, raqam, r2_kalit, bayt, sha256, mime)
  select v_id, y.yol, y.nom, y.fayl_id, y.versiya_id, y.raqam, y.r2_kalit, y.bayt, y.sha256, y.mime from public._t2_hm_taqdim_yig_v1(p_nishon_turi, p_nishon_id) y;

  select q.nom into v_qn from public.t2_kompaniya q where q.id = v_qarshi;
  perform public._t2_tomon_hodisa_yoz(a.id, null, v_k, p_actor, 'taqdim', v_izoh,
    jsonb_build_object('hm_taqdim_id', v_id, 'nishon_turi', p_nishon_turi, 'nom', left(v_nom, 120), 'fayl_soni', v_soni, 'jami_bayt', v_bayt));
  perform public._t2_hm_log_v1(v_k, null, v_fayl, p_actor, 'taqdim', left(v_nom, 120) || ' -> ' || coalesce(v_qn, '?'));
  perform public._t2_hm_log_v1(v_qarshi, null, null, p_actor, 'taqdim_keldi', left(v_nom, 120));
  select array_agg(m.foydalanuvchi_id) into v_users from public.t2_azolik m
   where m.kompaniya_id = v_qarshi and m.holat = 'faol' and public._t2_tomon_rol_ok(m.rol, 'qaror');
  perform public._t2_hm_bildir_v1(v_qarshi, 'fayl.taqdim', coalesce(v_fayl, 0), v_users, p_actor,
    jsonb_build_object('taqdim_id', v_id, 'nom', left(v_nom, 120), 'fayl_soni', v_soni, 'kimdan_kompaniya_id', v_k));
  return jsonb_build_object('ok', true, 'id', v_id, 'fayl_soni', v_soni, 'jami_bayt', v_bayt);
end $$;

-- Ro'yxat: yonalish 'kelgan' (oluvchi) | 'yuborilgan'. Oluvchi faqat faol aloqadagi FAOL taqdimlarni ko'radi (qaytarilgani - sarlavha, ichisiz).
create or replace function public.t2_hm_taqdim_royxat_v1(p_actor bigint, p_kompaniya bigint, p_yonalish text default 'kelgan')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_kelgan boolean := coalesce(p_yonalish, 'kelgan') <> 'yuborilgan';
begin
  if public._t2_hm_taqdim_rol_v1(p_actor, p_kompaniya, 'korish') is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'yonalish', case when v_kelgan then 'kelgan' else 'yuborilgan' end, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'nom', t.nom, 'nishon_turi', t.nishon_turi, 'fayl_soni', t.fayl_soni, 'jami_bayt', t.jami_bayt, 'izoh', t.izoh,
        'holat', t.holat, 'vaqt', t.taqdim_vaqti, 'kompaniya', q.nom, 'kim', u.ism, 'qaytarildi', t.qaytarildi, 'sabab', t.qaytarish_sababi) order by t.id desc)
      from (select * from public.t2_hm_taqdim x
             where (v_kelgan and x.qabul_kompaniya_id = p_kompaniya) or (not v_kelgan and x.yuboruvchi_kompaniya_id = p_kompaniya)
             order by x.id desc limit 100) t
      join public.t2_kompaniya q on q.id = case when v_kelgan then t.yuboruvchi_kompaniya_id else t.qabul_kompaniya_id end
      left join public.t2_foydalanuvchi u on u.id = t.taqdim_actor_id), '[]'::jsonb));
end $$;

-- Tafsilot (suratdagi fayllar). Ikkala tomon a'zosi; oluvchi uchun faqat faol taqdim + faol aloqa.
create or replace function public.t2_hm_taqdim_tafsilot_v1(p_actor bigint, p_taqdim_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.t2_hm_taqdim%rowtype; v_oluvchi boolean;
begin
  select * into t from public.t2_hm_taqdim where id = p_taqdim_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TAQDIM_TOPILMADI'); end if;
  if public._t2_hm_taqdim_rol_v1(p_actor, t.yuboruvchi_kompaniya_id, 'korish') is not null then v_oluvchi := false;
  elsif public._t2_hm_taqdim_rol_v1(p_actor, t.qabul_kompaniya_id, 'korish') is not null then v_oluvchi := true;
  else return jsonb_build_object('ok', false, 'code', 'TAQDIM_TOPILMADI'); end if;
  return jsonb_build_object('ok', true, 'id', t.id, 'nom', t.nom, 'nishon_turi', t.nishon_turi, 'izoh', t.izoh, 'holat', t.holat, 'vaqt', t.taqdim_vaqti,
    'fayl_soni', t.fayl_soni, 'jami_bayt', t.jami_bayt, 'oluvchi', v_oluvchi,
    'qaytarish_mumkin', (not v_oluvchi) and t.holat = 'faol' and public._t2_hm_taqdim_rol_v1(p_actor, t.yuboruvchi_kompaniya_id, 'taqdim') is not null,
    'fayllar', case when t.holat = 'faol' and (not v_oluvchi or exists (select 1 from public.t2_tomon_aloqa a where a.id = t.aloqa_id and a.holat = 'faol')) then coalesce((
        select jsonb_agg(jsonb_build_object('id', e.id, 'yol', e.yol, 'nom', e.nom, 'raqam', e.raqam, 'bayt', e.bayt, 'mime', e.mime, 'sha256', e.sha256) order by e.yol, e.nom)
          from public.t2_hm_taqdim_el e where e.taqdim_id = t.id), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Yuklab olish: oluvchi (faol taqdim + faol aloqa) yoki yuboruvchi a'zosi. Trafik oluvchi kompaniyaga yoziladi; ikkala lentaga qator.
create or replace function public.t2_hm_taqdim_yuklab_v1(p_actor bigint, p_taqdim_id bigint, p_el_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_hm_taqdim%rowtype; e public.t2_hm_taqdim_el%rowtype; v_oluvchi boolean;
begin
  select * into t from public.t2_hm_taqdim where id = p_taqdim_id;
  if not found or t.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'TAQDIM_TOPILMADI'); end if;
  select * into e from public.t2_hm_taqdim_el where id = p_el_id and taqdim_id = t.id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  if public._t2_hm_taqdim_rol_v1(p_actor, t.yuboruvchi_kompaniya_id, 'korish') is not null then v_oluvchi := false;
  elsif public._t2_hm_taqdim_rol_v1(p_actor, t.qabul_kompaniya_id, 'korish') is not null then v_oluvchi := true;
  else return jsonb_build_object('ok', false, 'code', 'TAQDIM_TOPILMADI'); end if;
  if v_oluvchi and not exists (select 1 from public.t2_tomon_aloqa a where a.id = t.aloqa_id and a.holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'TAQDIM_TOPILMADI'); end if;
  if v_oluvchi then
    perform public._t2_hm_trafik_v1(t.qabul_kompaniya_id, null, 0, e.bayt);
    perform public._t2_hm_log_v1(t.qabul_kompaniya_id, null, null, p_actor, 'taqdim_ochildi', left(e.nom, 200));
    perform public._t2_hm_log_v1(t.yuboruvchi_kompaniya_id, null, e.fayl_id, p_actor, 'taqdim_ochildi', left(e.nom, 200));
  end if;
  return jsonb_build_object('ok', true, 'kalit', e.r2_kalit, 'nom', e.nom, 'mime', e.mime, 'bayt', e.bayt, 'sha256', e.sha256, 'raqam', e.raqam);
end $$;

-- Qaytarish (bekor): faqat yuboruvchi kompaniya (taqdim huquqi). Oluvchi ko'rinishi yopiladi, himoya (pin) olinadi; surat qatori audit uchun qoladi.
create or replace function public.t2_hm_taqdim_qaytar_v1(p_actor bigint, p_taqdim_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_hm_taqdim%rowtype; v_users bigint[]; v_s text := nullif(btrim(coalesce(p_sabab, '')), '');
begin
  select * into t from public.t2_hm_taqdim where id = p_taqdim_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TAQDIM_TOPILMADI'); end if;
  if public._t2_hm_taqdim_rol_v1(p_actor, t.yuboruvchi_kompaniya_id, 'taqdim') is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if t.holat <> 'faol' then return jsonb_build_object('ok', true, 'takror', true); end if;
  update public.t2_hm_taqdim set holat = 'qaytarilgan', qaytardi_actor_id = p_actor, qaytarildi = now(), qaytarish_sababi = left(v_s, 500) where id = t.id;
  perform public._t2_tomon_hodisa_yoz(t.aloqa_id, null, t.yuboruvchi_kompaniya_id, p_actor, 'qaytarish', v_s, jsonb_build_object('hm_taqdim_id', t.id, 'nom', left(t.nom, 120)));
  perform public._t2_hm_log_v1(t.yuboruvchi_kompaniya_id, null, null, p_actor, 'taqdim_qaytarildi', left(t.nom, 120));
  select array_agg(m.foydalanuvchi_id) into v_users from public.t2_azolik m
   where m.kompaniya_id = t.qabul_kompaniya_id and m.holat = 'faol' and public._t2_tomon_rol_ok(m.rol, 'qaror');
  perform public._t2_hm_bildir_v1(t.qabul_kompaniya_id, 'fayl.taqdim_qaytarildi', 0, v_users, p_actor, jsonb_build_object('taqdim_id', t.id, 'nom', left(t.nom, 120)));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- tozalash himoyasi (3 funksiya almashtiriladi: faqat "pinli emas" sharti qo'shildi)
create or replace function public.t2_hm_tozala_ol_v1(p_actor bigint default null, p_fayl_id bigint default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; v_f jsonb; v_v jsonb;
begin
  if p_fayl_id is not null then
    select * into f from public.t2_hm_fayl where id = p_fayl_id and savatda is not null;
    if not found then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
    if p_actor is not null and public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    if p_actor is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_KERAK'); end if;
    if public._t2_hm_pinli_fayl_v1(f.id) then return jsonb_build_object('ok', false, 'code', 'TAQDIMDA'); end if;
    select jsonb_build_array(jsonb_build_object('id', f.id, 'kalitlar', coalesce((select jsonb_agg(v.r2_kalit) from public.t2_hm_versiya v where v.fayl_id = f.id), '[]'::jsonb))) into v_f;
    return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', '[]'::jsonb);
  end if;
  if p_actor is not null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = x.id))), '[]'::jsonb) into v_f
    from (select id from public.t2_hm_fayl where savatda < now() - interval '30 days' and not public._t2_hm_pinli_fayl_v1(id) order by savatda limit least(greatest(coalesce(p_limit, 100), 1), 500)) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit)), '[]'::jsonb) into v_v
    from public.t2_hm_versiya v where v.holat = 'kutish' and v.yaratildi < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v);
end $$;

create or replace function public.t2_hm_tozala_tasdiq_v1(p_fayl_idlar bigint[] default '{}', p_versiya_idlar bigint[] default '{}', p_eski_idlar bigint[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f integer; v_v integer; v_e integer;
begin
  -- eski versiyalar: joriy versiya va taqdimda turgan (pinli) versiya HECH QACHON o'chirilmaydi
  delete from public.t2_hm_versiya v where v.id = any (coalesce(p_eski_idlar, '{}')) and v.holat = 'tayyor'
     and not exists (select 1 from public.t2_hm_fayl f where f.joriy_versiya_id = v.id)
     and not public._t2_hm_pinli_versiya_v1(v.id);
  get diagnostics v_e = row_count;
  delete from public.t2_hm_ulashish where nishon_turi = 'fayl' and nishon_id in (select x from unnest(coalesce(p_fayl_idlar, '{}')) x where not public._t2_hm_pinli_fayl_v1(x));
  delete from public.t2_hm_fayl where id = any (coalesce(p_fayl_idlar, '{}')) and savatda is not null and not public._t2_hm_pinli_fayl_v1(id);
  get diagnostics v_f = row_count;
  delete from public.t2_hm_versiya where id = any (coalesce(p_versiya_idlar, '{}')) and holat = 'kutish';
  get diagnostics v_v = row_count;
  delete from public.t2_hm_fayl f where f.joriy_versiya_id is null and f.yaratildi < now() - interval '1 day' and not exists (select 1 from public.t2_hm_versiya x where x.fayl_id = f.id);
  return jsonb_build_object('ok', true, 'fayllar', v_f, 'versiyalar', v_v, 'eski', v_e);
end $$;

create or replace function public.t2_hm_bosh_ol_v1(p_actor bigint, p_kompaniya bigint, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e bigint := case when p_kompaniya is null then p_actor end;
begin
  if public._t2_hm_daraja_v1(p_actor, p_kompaniya, v_e, null, null) < 4 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_amal = 'savat' then
    return jsonb_build_object('ok', true, 'fayllar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kalitlar', (select coalesce(jsonb_agg(v.r2_kalit), '[]'::jsonb) from public.t2_hm_versiya v where v.fayl_id = f.id)))
        from public.t2_hm_fayl f where f.savatda is not null and f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e
         and not public._t2_hm_pinli_fayl_v1(f.id)), '[]'::jsonb),
      'eski', '[]'::jsonb);
  elsif p_amal = 'eski_versiyalar' then
    return jsonb_build_object('ok', true, 'fayllar', '[]'::jsonb, 'eski', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kalit', v.r2_kalit))
        from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id
       where f.kompaniya_id is not distinct from p_kompaniya and f.egasi_foydalanuvchi_id is not distinct from v_e and f.savatda is null
         and v.holat = 'tayyor' and v.id is distinct from f.joriy_versiya_id and not public._t2_hm_pinli_versiya_v1(v.id)), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
end $$;

-- ---------------------------------------------------------------- huquqlar
do $g$ declare s text; begin
  foreach s in array array[
    '_t2_hm_pinli_fayl_v1(bigint)', '_t2_hm_pinli_versiya_v1(bigint)', '_t2_hm_taqdim_rol_v1(bigint, bigint, text)', '_t2_hm_taqdim_yig_v1(text, bigint)',
    't2_hm_taqdim_nishon_v1(bigint, bigint)', 't2_hm_taqdim_yarat_v1(bigint, text, bigint, bigint, text, uuid)', 't2_hm_taqdim_royxat_v1(bigint, bigint, text)',
    't2_hm_taqdim_tafsilot_v1(bigint, bigint)', 't2_hm_taqdim_yuklab_v1(bigint, bigint, bigint)', 't2_hm_taqdim_qaytar_v1(bigint, bigint, text)',
    't2_hm_tozala_ol_v1(bigint, bigint, integer)', 't2_hm_tozala_tasdiq_v1(bigint[], bigint[], bigint[])', 't2_hm_bosh_ol_v1(bigint, bigint, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;
