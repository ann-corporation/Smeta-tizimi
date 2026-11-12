-- 20261216300000 - SUBPUDRATCHI TOMONI (ekotizim): bosh pudratchi ishni subpudratchiga topshiradi, subpudratchi o'z hajmini kiritib akt yuboradi,
-- bosh pudratchi qabul qiladi -> hajm BIR MARTA faktga tushadi + bitta subpudrat xarajati. Yangi inbox/hujjat registri YO'Q:
--   * kompaniyalararo ulanish = t2_tomon_aloqa (taklif_rol/qabul_rol = 'subpudratchi'), ko'rinish = t2_tomon_grant (resurs 'sub_ish', doira = obyekt);
--   * yuborish = t2_tomon_taqdim (resurs 'sub_akt', manba_jadval 't2_sub_akt'), voqealar = t2_tomon_hodisa;
--   * qaror = t2_sub_akt_qaror_v1 (bosh pudratchi PTO ham qaror chiqaradi; _t2_tomon_rol_ok O'ZGARMAYDI). Umumiy t2_tomon_qaror_v1 bu taqdimga tegmasligi
--     uchun trigger (t2_sub_taqdim_qorovul): sub_akt taqdimining holatini faqat t2_sub_akt_qaror_v1 / t2_sub_akt_yubor_v1 o'zgartiradi.
-- Yangi jadvallar (lean): t2_sub_topshiriq (topshirilgan qator: hajm + KELISHILGAN narx), t2_sub_akt + t2_sub_akt_qator (subpudratchi aktining manba hujjati).
-- Pul qoidalari: birlik narxi QQS siz; narx noma'lum = NULL (0 emas); smeta (t2_qator) O'ZGARMAYDI; subpudratchi bosh pudratchining smeta narxi/ustamasini KO'RMAYDI.
-- Ikki marta hisoblanmaydi: bir ish = bitta fakt. Qabul qilingan sub hajmi t2_fakt_yoz_v2 orqali (deterministik operation_id) bir marta yoziladi;
--   topshirilgan qatorda: bosh pudratchining qo'lda faktini + qabul qilingan sub hajmini jami topshirilgan hajmdan oshirib bo'lmaydi (ORTIQCHA).
-- Rollback: *.rollback.sql. Acceptance: *.acceptance.sql (sintetik, BEGIN..ROLLBACK).

-- 1. Resurslar
insert into public.t2_tomon_resurs (kalit, nom, nom_ru, guruh, amallar, taqdim_mumkin, faol, tartib, izoh) values
  ('sub_ish', 'Subpudratchiga topshirilgan ishlar', 'Переданные субподрядчику работы', 'jadval', array['korish'], false, true, 80,
   'Bosh pudratchi topshirgan qatorlar: faqat hajm va kelishilgan narx (smeta narxi ko''rinmaydi)'),
  ('sub_akt', 'Subpudratchi akti', 'Акт субподрядчика', 'hujjat', array['korish','tafsilot'], true, true, 81,
   'Subpudratchi bajargan ish akti: bosh pudratchi qabul qiladi yoki tuzatishga qaytaradi')
on conflict (kalit) do update set nom = excluded.nom, nom_ru = excluded.nom_ru, guruh = excluded.guruh, amallar = excluded.amallar,
  taqdim_mumkin = excluded.taqdim_mumkin, faol = true, izoh = excluded.izoh;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.t2_tomon_taqdim'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba_jadval%' loop
    execute format('alter table public.t2_tomon_taqdim drop constraint %I', c.conname);
  end loop;
  alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_manba_jadval_check
    check (manba_jadval in ('t2_akt', 't2_aosr', 't2_chizma_revizya', 't2_document_registry', 't2_sub_akt'));
end $$;

-- 2. Jadvallar
create table if not exists public.t2_sub_topshiriq (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  sub_kompaniya_id bigint not null references public.t2_kompaniya(id),
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  qator_id bigint not null references public.t2_qator(id),
  shartnoma_id bigint references public.t2_shartnoma(id),
  hajm numeric not null check (hajm > 0),
  narx numeric check (narx is null or narx >= 0),
  qqs_foiz numeric not null default 12 check (qqs_foiz >= 0 and qqs_foiz <= 100),
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  versiya integer not null default 1,
  kim_actor bigint not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (sub_kompaniya_id <> kompaniya_id)
);
comment on table public.t2_sub_topshiriq is 'Bosh pudratchi subpudratchiga topshirgan smeta qatori: hajm + KELISHILGAN narx (QQS siz, NULL = noma''lum). Smeta qatori o''zgarmaydi.';
create unique index if not exists t2_sub_topshiriq_qator_faol_uq on public.t2_sub_topshiriq (qator_id) where holat = 'faol';
create index if not exists t2_sub_topshiriq_sub_idx on public.t2_sub_topshiriq (sub_kompaniya_id, holat);
create index if not exists t2_sub_topshiriq_obyekt_idx on public.t2_sub_topshiriq (kompaniya_id, obyekt_id) where holat = 'faol';
create index if not exists t2_sub_topshiriq_aloqa_idx on public.t2_sub_topshiriq (aloqa_id);

create table if not exists public.t2_sub_akt (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  sub_kompaniya_id bigint not null references public.t2_kompaniya(id),
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  oy date not null check (extract(day from oy) = 1),
  raqam text check (raqam is null or length(raqam) <= 60),
  izoh text check (izoh is null or length(izoh) <= 1000),
  holat text not null default 'qoralama' check (holat in ('qoralama', 'yuborilgan', 'qabul', 'tuzatish', 'bekor')),
  taqdim_id bigint references public.t2_tomon_taqdim(id),
  fakt_akt_id bigint references public.t2_akt(id),
  xarajat_id bigint references public.t2_xarajat(id),
  versiya integer not null default 1,
  operation_id uuid,
  kim_actor bigint not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (sub_kompaniya_id <> kompaniya_id)
);
comment on table public.t2_sub_akt is 'Subpudratchining bosh pudratchiga aktı (uning F2 si): qoralama -> yuborilgan (t2_tomon_taqdim) -> qabul | tuzatish.';
create unique index if not exists t2_sub_akt_operation_uq on public.t2_sub_akt (sub_kompaniya_id, operation_id) where operation_id is not null;
create unique index if not exists t2_sub_akt_oy_uq on public.t2_sub_akt (sub_kompaniya_id, aloqa_id, obyekt_id, oy) where holat <> 'bekor';
create index if not exists t2_sub_akt_gc_idx on public.t2_sub_akt (kompaniya_id, holat);
create index if not exists t2_sub_akt_fakt_idx on public.t2_sub_akt (fakt_akt_id) where fakt_akt_id is not null;
create index if not exists t2_sub_akt_aloqa_idx on public.t2_sub_akt (aloqa_id);

create table if not exists public.t2_sub_akt_qator (
  id bigint generated always as identity primary key,
  sub_akt_id bigint not null references public.t2_sub_akt(id) on delete cascade,
  topshiriq_id bigint not null references public.t2_sub_topshiriq(id),
  hajm numeric not null check (hajm > 0),
  narx numeric check (narx is null or narx >= 0),
  izoh text check (izoh is null or length(izoh) <= 500),
  unique (sub_akt_id, topshiriq_id)
);
comment on column public.t2_sub_akt_qator.narx is 'Yuborish paytidagi kelishilgan narx nusxasi (QQS siz); qoralamada NULL.';
create index if not exists t2_sub_akt_qator_topshiriq_idx on public.t2_sub_akt_qator (topshiriq_id);

alter table public.t2_sub_topshiriq enable row level security;
alter table public.t2_sub_akt enable row level security;
alter table public.t2_sub_akt_qator enable row level security;
revoke all on table public.t2_sub_topshiriq, public.t2_sub_akt, public.t2_sub_akt_qator from public, anon, authenticated;

-- 3. Yordamchilar
create or replace function public._t2_sub_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'fakt' then p_rol in ('superadmin','admin','boss','rahbar','director','pto','prorab','brigadir','usta')
    when 'korish' then p_rol is not null
    else false end
$$;

create or replace function public._t2_sub_azo(p_actor_id bigint, p_kompaniya_id bigint, p_amal text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not public._t2_sub_rol_ok(v_rol, p_amal) then
    raise exception 'TOMON_ROL_YETARLI_EMAS: % roli "%" amalini bajara olmaydi', v_rol, p_amal using errcode = '42501';
  end if;
  return v_rol;
end $$;

-- Bosh pudratchi tomonidan: faol aloqada qarshi tomon subpudratchi bo'lsa uning kompaniya id si, aks holda NULL.
create or replace function public._t2_sub_qarshi_sub(p_aloqa_id bigint, p_gc bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select case when a.taklif_kompaniya_id = p_gc and lower(a.qabul_rol) = 'subpudratchi' then a.qabul_kompaniya_id
              when a.qabul_kompaniya_id = p_gc and lower(a.taklif_rol) = 'subpudratchi' then a.taklif_kompaniya_id end
    from public.t2_tomon_aloqa a where a.id = p_aloqa_id and a.holat = 'faol'
$$;

-- Subpudratchi tomonidan: faol aloqada men subpudratchi bo'lsam, bosh pudratchi kompaniya id si, aks holda NULL.
create or replace function public._t2_sub_qarshi_gc(p_aloqa_id bigint, p_sub bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select case when a.taklif_kompaniya_id = p_sub and lower(a.taklif_rol) = 'subpudratchi' then a.qabul_kompaniya_id
              when a.qabul_kompaniya_id = p_sub and lower(a.qabul_rol) = 'subpudratchi' then a.taklif_kompaniya_id end
    from public.t2_tomon_aloqa a where a.id = p_aloqa_id and a.holat = 'faol'
$$;

-- Yuborilgan/qabul qilingan aktlarda shu topshiriq bo'yicha jami hajm (p_istisno_akt_id aktdan tashqari).
create or replace function public._t2_sub_ishlatilgan(p_topshiriq_id bigint, p_istisno_akt_id bigint) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(l.hajm), 0) from public.t2_sub_akt_qator l join public.t2_sub_akt s on s.id = l.sub_akt_id
   where l.topshiriq_id = p_topshiriq_id and s.holat in ('yuborilgan', 'qabul') and s.id is distinct from p_istisno_akt_id
$$;

-- Bosh pudratchining O'Z (sub aktlaridan kelmagan) qo'lda fakt hajmi shu smeta qatori bo'yicha.
create or replace function public._t2_sub_gc_fakt(p_qator_id bigint) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(aq.hajm), 0) from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
   where aq.qator_id = p_qator_id and a.tur = 'fakt' and a.holat <> 'bekor'
     and not exists (select 1 from public.t2_sub_akt s where s.fakt_akt_id = a.id)
$$;

-- Akt qatorlarining butunlik xeshi (yuborilgandan keyin o'zgarmaganini tekshirish).
create or replace function public._t2_sub_akt_xesh(p_sub_akt_id bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select md5(coalesce(string_agg(l.topshiriq_id::text || ':' || l.hajm::text || ':' || coalesce(l.narx::text, '-'), '|' order by l.topshiriq_id), ''))
    from public.t2_sub_akt_qator l where l.sub_akt_id = p_sub_akt_id
$$;

-- 4. Qorovul: sub_akt taqdimining holatini faqat t2_sub_akt_qaror_v1 / t2_sub_akt_yubor_v1 o'zgartiradi (umumiy qaror yo'li fakt/xarajatni aylanib o'tmasin).
create or replace function public._t2_sub_taqdim_qorovul() returns trigger
language plpgsql as $$
begin
  if old.resurs = 'sub_akt' and new.holat is distinct from old.holat and coalesce(current_setting('t2.sub_qaror', true), '') <> '1' then
    raise exception 'SUB_AKT_QAROR_BOSHQA_YOL: subpudratchi aktiga qarorni faqat subpudratchi bo''limidan chiqaring' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t2_sub_taqdim_qorovul on public.t2_tomon_taqdim;
create trigger t2_sub_taqdim_qorovul before update of holat on public.t2_tomon_taqdim
  for each row execute function public._t2_sub_taqdim_qorovul();

-- 5. BOSH PUDRATCHI: ishni topshirish (qatorlar ro'yxati yoki butun bo'lim). Idempotent: shu qator shu subga qayta topshirilsa yangilanadi.
create or replace function public.t2_sub_topshir_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_obyekt_id bigint, p_qatorlar jsonb,
  p_bolim_id bigint default null, p_shartnoma_id bigint default null, p_qqs_foiz numeric default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sub bigint; v_bad jsonb; v_yangi integer := 0; v_yang integer := 0; r record; v_ex public.t2_sub_topshiriq; v_grant boolean := false;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id and o.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi');
  end if;
  v_sub := public._t2_sub_qarshi_sub(p_aloqa_id, p_kompaniya_id);
  if v_sub is null then
    return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'error', 'Faol subpudratchi aloqasi topilmadi (qarshi tomon roli: subpudratchi)');
  end if;
  if p_shartnoma_id is not null and not exists (select 1 from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_YOQ', 'error', 'Shartnoma topilmadi');
  end if;
  if p_qqs_foiz is not null and (p_qqs_foiz < 0 or p_qqs_foiz > 100) then
    return jsonb_build_object('ok', false, 'code', 'QQS_NOTOGRI', 'error', 'QQS foizi 0 dan 100 gacha');
  end if;
  if p_qatorlar is not null and jsonb_typeof(p_qatorlar) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI', 'error', 'qatorlar ro''yxat bo''lishi kerak');
  end if;

  drop table if exists _t2_sub_kir;
  create temp table _t2_sub_kir on commit drop as
  with recursive d(id) as (
    select q.id from public.t2_qator q where q.id = p_bolim_id and q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
    union all
    select c.id from public.t2_qator c join d on c.ota_id = d.id where c.obyekt_id = p_obyekt_id and c.versiya_holat = 'faol'
  ), kir as (
    select (e->>'qator_id')::bigint as qator_id, nullif(e->>'hajm', '')::numeric as hajm, nullif(e->>'narx', '')::numeric as narx, (e ? 'narx') as narx_bor, true as aniq
      from jsonb_array_elements(coalesce(p_qatorlar, '[]'::jsonb)) e
    union all
    select d.id, null::numeric, null::numeric, false, false
      from d join public.t2_qator q on q.id = d.id where p_bolim_id is not null and q.tur in ('bl', 'mat', 'ob') and coalesce(q.hajm, 0) > 0
  )
  select distinct on (k.qator_id) k.qator_id, k.hajm, k.narx, k.narx_bor from kir k order by k.qator_id, k.aniq desc;

  if not exists (select 1 from _t2_sub_kir) then
    return jsonb_build_object('ok', false, 'code', 'BOSH', 'error', 'Topshiriladigan qator topilmadi');
  end if;

  -- 1-o'tish: tekshiruv (hech narsa yozilmaydi)
  select jsonb_agg(jsonb_build_object('qator_id', z.qator_id, 'sabab', z.sabab)) into v_bad from (
    select k.qator_id,
           case when q.id is null or q.obyekt_id <> p_obyekt_id or q.kompaniya_id <> p_kompaniya_id then 'QATOR_BEGONA'
                when q.tur not in ('bl', 'mat', 'ob') then 'TUR'
                when k.narx_bor and k.narx is not null and k.narx < 0 then 'NARX_MANFIY'
                when coalesce(k.hajm, t.hajm, q.hajm) is null or coalesce(k.hajm, t.hajm, q.hajm) <= 0 then 'HAJM'
                when q.hajm is not null and coalesce(k.hajm, t.hajm, q.hajm) > q.hajm then 'HAJM_ORTIQ'
                when t.id is not null and t.sub_kompaniya_id <> v_sub then 'QATOR_BAND'
                when t.id is not null and coalesce(k.hajm, t.hajm, q.hajm) < public._t2_sub_ishlatilgan(t.id, null) then 'HAJM_PAST'
                when t.id is not null and k.narx_bor and k.narx is distinct from t.narx and public._t2_sub_ishlatilgan(t.id, null) > 0 then 'NARX_QULF'
           end as sabab
      from _t2_sub_kir k
      left join public.t2_qator q on q.id = k.qator_id
      left join public.t2_sub_topshiriq t on t.qator_id = k.qator_id and t.holat = 'faol') z
   where z.sabab is not null;
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI', 'error', 'Ba''zi qatorlarni topshirib bo''lmaydi', 'qatorlar', v_bad);
  end if;

  -- 2-o'tish: yozish
  for r in select k.qator_id, k.hajm, k.narx, k.narx_bor, q.hajm as q_hajm from _t2_sub_kir k join public.t2_qator q on q.id = k.qator_id loop
    select * into v_ex from public.t2_sub_topshiriq where qator_id = r.qator_id and holat = 'faol' for update;
    if found then
      update public.t2_sub_topshiriq
         set hajm = coalesce(r.hajm, hajm), narx = case when r.narx_bor then r.narx else narx end,
             shartnoma_id = coalesce(p_shartnoma_id, shartnoma_id), qqs_foiz = coalesce(p_qqs_foiz, qqs_foiz),
             aloqa_id = p_aloqa_id, versiya = versiya + 1, yangilandi = now()
       where id = v_ex.id;
      v_yang := v_yang + 1;
    else
      insert into public.t2_sub_topshiriq (kompaniya_id, sub_kompaniya_id, aloqa_id, obyekt_id, qator_id, shartnoma_id, hajm, narx, qqs_foiz, kim_actor)
      values (p_kompaniya_id, v_sub, p_aloqa_id, p_obyekt_id, r.qator_id, p_shartnoma_id, coalesce(r.hajm, r.q_hajm), case when r.narx_bor then r.narx end, coalesce(p_qqs_foiz, 12), p_actor_id);
      v_yangi := v_yangi + 1;
    end if;
  end loop;

  -- Ko'rinish: obyekt doirasidagi 'sub_ish' granti (bo'lmasa yaratiladi; bekor qilinsa subpudratchi hammasini ko'rmay qoladi).
  if not exists (select 1 from public.t2_tomon_grant g where g.aloqa_id = p_aloqa_id and g.beruvchi_kompaniya_id = p_kompaniya_id and g.oluvchi_kompaniya_id = v_sub
                  and g.resurs = 'sub_ish' and g.obyekt_id = p_obyekt_id and g.holat = 'faol') then
    insert into public.t2_tomon_grant (aloqa_id, beruvchi_kompaniya_id, oluvchi_kompaniya_id, resurs, amallar, obyekt_id, berdi_actor_id)
    values (p_aloqa_id, p_kompaniya_id, v_sub, 'sub_ish', array['korish'], p_obyekt_id, p_actor_id);
    v_grant := true;
  end if;
  perform public._t2_tomon_hodisa_yoz(p_aloqa_id, null, p_kompaniya_id, p_actor_id, 'grant', 'Subpudratchiga ish topshirildi',
    jsonb_build_object('resurs', 'sub_ish', 'obyekt_id', p_obyekt_id, 'yangi', v_yangi, 'yangilandi', v_yang));
  return jsonb_build_object('ok', true, 'yangi', v_yangi, 'yangilandi', v_yang, 'grant_yaratildi', v_grant, 'sub_kompaniya_id', v_sub);
end $$;
comment on function public.t2_sub_topshir_v1(bigint, bigint, bigint, bigint, jsonb, bigint, bigint, numeric) is 'versiya: tarix - smeta qatori o''zgarmaydi; bo''lim kengaytmasi faqat faol qatorlar (versiya_holat = faol).';

create or replace function public.t2_sub_topshiriq_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_topshiriq_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_sub_topshiriq;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select * into t from public.t2_sub_topshiriq where id = p_topshiriq_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Topshiriq topilmadi'); end if;
  if t.holat = 'bekor' then return jsonb_build_object('ok', true, 'qayta', true); end if;
  if public._t2_sub_ishlatilgan(t.id, null) > 0 then
    return jsonb_build_object('ok', false, 'code', 'ISHLATILGAN', 'error', 'Bu qator bo''yicha akt yuborilgan yoki qabul qilingan - bekor qilib bo''lmaydi');
  end if;
  delete from public.t2_sub_akt_qator l using public.t2_sub_akt s where l.topshiriq_id = t.id and s.id = l.sub_akt_id and s.holat in ('qoralama', 'tuzatish');
  update public.t2_sub_topshiriq set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- 6. BOSH PUDRATCHI: obyektdagi topshiriqlar + marja kirishlari (smeta narx/hajm, kelishilgan narx; pul hisobi mijozda hisob-yadro orqali)
create or replace function public.t2_sub_boshqaruv_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'korish');
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi');
  end if;
  select coalesce(jsonb_agg(r order by (r->>'tartib')::integer, (r->>'id')::bigint), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', t.id, 'aloqa_id', t.aloqa_id, 'sub_kompaniya_id', t.sub_kompaniya_id, 'sub_nom', k.nom, 'shartnoma_id', t.shartnoma_id,
      'qator_id', q.id, 'tartib', q.tartib, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'tur', q.tur, 'kat', q.kat,
      'smeta_hajm', q.hajm, 'smeta_narx', q.narx,
      'hajm', t.hajm, 'narx', t.narx, 'qqs_foiz', t.qqs_foiz,
      'qabul_hajm', (select coalesce(sum(l.hajm), 0) from public.t2_sub_akt_qator l join public.t2_sub_akt s on s.id = l.sub_akt_id where l.topshiriq_id = t.id and s.holat = 'qabul'),
      'kutilayotgan_hajm', (select coalesce(sum(l.hajm), 0) from public.t2_sub_akt_qator l join public.t2_sub_akt s on s.id = l.sub_akt_id where l.topshiriq_id = t.id and s.holat = 'yuborilgan'),
      'gc_fakt_hajm', public._t2_sub_gc_fakt(t.qator_id)) as r
      from public.t2_sub_topshiriq t
      join public.t2_qator q on q.id = t.qator_id
      join public.t2_kompaniya k on k.id = t.sub_kompaniya_id
     where t.kompaniya_id = p_kompaniya_id and t.obyekt_id = p_obyekt_id and t.holat = 'faol'
     limit 500) z;
  return jsonb_build_object('ok', true, 'topshiriqlar', v);
end $$;
comment on function public.t2_sub_boshqaruv_v1(bigint, bigint, bigint) is 'versiya: tarix - topshirilgan qatorlarni id bo''yicha o''qiydi (topshiriq o''zi qator versiyasiga bog''liq emas).';

-- 7. SUBPUDRATCHI: menga topshirilgan ishlar. FAQAT hajm va kelishilgan narx; smeta narxi/summasi/ustamasi chiqmaydi.
create or replace function public.t2_sub_ishlarim_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(r order by (r->>'obyekt_id')::bigint, (r->>'tartib')::integer, (r->>'id')::bigint), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', t.id, 'aloqa_id', t.aloqa_id, 'gc_kompaniya_id', t.kompaniya_id, 'gc_nom', k.nom, 'obyekt_id', t.obyekt_id, 'obyekt_nom', o.nom,
      'tartib', q.tartib, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
      'hajm', t.hajm, 'narx', t.narx, 'qqs_foiz', t.qqs_foiz,
      'qabul_hajm', (select coalesce(sum(l.hajm), 0) from public.t2_sub_akt_qator l join public.t2_sub_akt s on s.id = l.sub_akt_id where l.topshiriq_id = t.id and s.holat = 'qabul'),
      'kutilayotgan_hajm', (select coalesce(sum(l.hajm), 0) from public.t2_sub_akt_qator l join public.t2_sub_akt s on s.id = l.sub_akt_id where l.topshiriq_id = t.id and s.holat = 'yuborilgan'),
      'qoralama_hajm', (select coalesce(sum(l.hajm), 0) from public.t2_sub_akt_qator l join public.t2_sub_akt s on s.id = l.sub_akt_id where l.topshiriq_id = t.id and s.holat in ('qoralama', 'tuzatish'))) as r
      from public.t2_sub_topshiriq t
      join public.t2_qator q on q.id = t.qator_id
      join public.t2_kompaniya k on k.id = t.kompaniya_id
      join public.t2_obyekt o on o.id = t.obyekt_id
     where t.sub_kompaniya_id = p_kompaniya_id and t.holat = 'faol'
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, t.kompaniya_id, 'sub_ish', 'korish', t.obyekt_id)
     limit 500) z;
  return jsonb_build_object('ok', true, 'ishlar', v);
end $$;
comment on function public.t2_sub_ishlarim_v1(bigint, bigint) is 'versiya: tarix - topshirilgan qator nomi/birligi id bo''yicha; smeta narxi chiqmaydi.';

-- 8. SUBPUDRATCHI: o'z faktini (akt qoralamasi) kiritish/yangilash. Hajm tarmoqda bir marta: yuborilgan/qabul qilingan aktlar bilan topshirilgan hajmdan oshmaydi.
create or replace function public.t2_sub_akt_yoz_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_obyekt_id bigint, p_oy date, p_qatorlar jsonb,
  p_akt_id bigint default null, p_raqam text default null, p_izoh text default null, p_operation_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gc bigint; v_id bigint; v_a public.t2_sub_akt; v_oy date; v_bad jsonb; r record;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'fakt');
  v_gc := public._t2_sub_qarshi_gc(p_aloqa_id, p_kompaniya_id);
  if v_gc is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'error', 'Faol subpudrat aloqasi topilmadi'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI', 'error', 'qatorlar ro''yxat bo''lishi kerak');
  end if;

  if p_akt_id is not null then
    select * into v_a from public.t2_sub_akt where id = p_akt_id and sub_kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Akt topilmadi'); end if;
    if v_a.holat not in ('qoralama', 'tuzatish') then
      return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Yuborilgan yoki qabul qilingan aktni tahrirlab bo''lmaydi');
    end if;
    if v_a.aloqa_id <> p_aloqa_id or not public.t2_tomon_ruxsat_bor(p_kompaniya_id, v_gc, 'sub_ish', 'korish', v_a.obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ', 'error', 'Bu obyektdagi ishlar sizga ochilmagan');
    end if;
    v_id := v_a.id;
  else
    if p_oy is null then return jsonb_build_object('ok', false, 'code', 'OY_KERAK', 'error', 'Hisobot oyi kerak'); end if;
    v_oy := date_trunc('month', p_oy)::date;
    if p_operation_id is not null then
      select id into v_id from public.t2_sub_akt where sub_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
      if found then return jsonb_build_object('ok', true, 'id', v_id, 'qayta', true); end if;
    end if;
    if not public.t2_tomon_ruxsat_bor(p_kompaniya_id, v_gc, 'sub_ish', 'korish', p_obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ', 'error', 'Bu obyektdagi ishlar sizga ochilmagan');
    end if;
    select id into v_id from public.t2_sub_akt where sub_kompaniya_id = p_kompaniya_id and aloqa_id = p_aloqa_id and obyekt_id = p_obyekt_id and oy = v_oy and holat <> 'bekor';
    if found then return jsonb_build_object('ok', false, 'code', 'AKT_BOR', 'error', 'Bu oy uchun akt allaqachon bor', 'id', v_id); end if;
    insert into public.t2_sub_akt (kompaniya_id, sub_kompaniya_id, aloqa_id, obyekt_id, oy, raqam, izoh, operation_id, kim_actor)
    values (v_gc, p_kompaniya_id, p_aloqa_id, p_obyekt_id, v_oy, nullif(btrim(coalesce(p_raqam, '')), ''), nullif(btrim(coalesce(p_izoh, '')), ''), p_operation_id, p_actor_id)
    returning id into v_id;
    select * into v_a from public.t2_sub_akt where id = v_id;
  end if;

  drop table if exists _t2_sub_akt_kir;
  create temp table _t2_sub_akt_kir on commit drop as
  select (e->>'topshiriq_id')::bigint as topshiriq_id, nullif(e->>'hajm', '')::numeric as hajm, nullif(btrim(coalesce(e->>'izoh', '')), '') as izoh
    from jsonb_array_elements(p_qatorlar) e;

  select jsonb_agg(jsonb_build_object('topshiriq_id', z.topshiriq_id, 'sabab', z.sabab)) into v_bad from (
    select k.topshiriq_id,
           case when t.id is null or t.sub_kompaniya_id <> p_kompaniya_id or t.aloqa_id <> v_a.aloqa_id or t.obyekt_id <> v_a.obyekt_id or t.holat <> 'faol' then 'TOPSHIRIQ_BEGONA'
                when k.hajm is null or k.hajm <= 0 then 'HAJM'
                when k.hajm > t.hajm - public._t2_sub_ishlatilgan(t.id, v_a.id) + 0.000001 then 'HAJM_ORTIQ'
           end as sabab
      from _t2_sub_akt_kir k left join public.t2_sub_topshiriq t on t.id = k.topshiriq_id) z
   where z.sabab is not null;
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI', 'error', 'Ba''zi qatorlar noto''g''ri yoki topshirilgan hajmdan oshadi', 'qatorlar', v_bad, 'id', v_id);
  end if;
  if exists (select 1 from _t2_sub_akt_kir group by topshiriq_id having count(*) > 1) then
    return jsonb_build_object('ok', false, 'code', 'TAKROR', 'error', 'Bir qator ikki marta kiritilgan', 'id', v_id);
  end if;

  delete from public.t2_sub_akt_qator l where l.sub_akt_id = v_id and l.topshiriq_id not in (select topshiriq_id from _t2_sub_akt_kir);
  for r in select * from _t2_sub_akt_kir loop
    insert into public.t2_sub_akt_qator (sub_akt_id, topshiriq_id, hajm, izoh) values (v_id, r.topshiriq_id, r.hajm, r.izoh)
    on conflict (sub_akt_id, topshiriq_id) do update set hajm = excluded.hajm, izoh = excluded.izoh;
  end loop;
  update public.t2_sub_akt
     set raqam = case when p_raqam is not null then nullif(btrim(p_raqam), '') else raqam end,
         izoh = case when p_izoh is not null then nullif(btrim(p_izoh), '') else izoh end,
         versiya = versiya + 1, yangilandi = now()
   where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'qator_soni', (select count(*) from _t2_sub_akt_kir));
end $$;

-- 9. SUBPUDRATCHI: aktni bosh pudratchiga yuborish (t2_tomon_taqdim, snapshot + xesh)
create or replace function public.t2_sub_akt_yubor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sub_akt_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.t2_sub_akt; v_gc bigint; v_old public.t2_tomon_taqdim; v_id bigint; v_oldingi bigint; v_jami numeric; v_narxsiz integer; v_soni integer;
  v_snap jsonb; v_xesh text; v_shart bigint; v_nom text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_taqdim where taqdim_etuvchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  select * into a from public.t2_sub_akt where id = p_sub_akt_id and sub_kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Akt topilmadi'); end if;
  if a.holat not in ('qoralama', 'tuzatish') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat qoralama yoki tuzatishga qaytarilgan akt yuboriladi');
  end if;
  v_gc := public._t2_sub_qarshi_gc(a.aloqa_id, p_kompaniya_id);
  if v_gc is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'error', 'Aloqa faol emas'); end if;
  select count(*), count(*) filter (where t.narx is null) into v_soni, v_narxsiz
    from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = a.id;
  if v_soni = 0 then return jsonb_build_object('ok', false, 'code', 'BOSH', 'error', 'Aktda bironta qator yo''q'); end if;
  if v_narxsiz > 0 then
    return jsonb_build_object('ok', false, 'code', 'NARX_KERAK', 'error', 'Ba''zi qatorlarda kelishilgan narx yo''q - bosh pudratchidan narx belgilashni so''rang', 'narxsiz_qator', v_narxsiz);
  end if;
  if exists (select 1 from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id
              where l.sub_akt_id = a.id and (t.holat <> 'faol' or l.hajm > t.hajm - public._t2_sub_ishlatilgan(t.id, a.id) + 0.000001)) then
    return jsonb_build_object('ok', false, 'code', 'HAJM_ORTIQ', 'error', 'Ba''zi qatorlar bekor qilingan yoki topshirilgan hajmdan oshadi');
  end if;
  update public.t2_sub_akt_qator l set narx = t.narx from public.t2_sub_topshiriq t where t.id = l.topshiriq_id and l.sub_akt_id = a.id;
  select sum(l.hajm * l.narx) into v_jami from public.t2_sub_akt_qator l where l.sub_akt_id = a.id;
  select case when count(distinct t.shartnoma_id) = 1 and bool_and(t.shartnoma_id is not null) then max(t.shartnoma_id) end into v_shart
    from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = a.id;
  v_xesh := public._t2_sub_akt_xesh(a.id);
  v_snap := jsonb_build_object('tur', 'sub_akt', 'sub_akt_id', a.id, 'oy', a.oy, 'raqam', a.raqam, 'jami_qqs_siz', v_jami, 'qator_soni', v_soni,
    'qatorlar', (select coalesce(jsonb_agg(jsonb_build_object('topshiriq_id', l.topshiriq_id, 'qator_id', t.qator_id, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
                   'hajm', l.hajm, 'narx', l.narx) order by q.tartib, l.id), '[]'::jsonb)
                   from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id join public.t2_qator q on q.id = t.qator_id where l.sub_akt_id = a.id));
  v_nom := 'Subpudratchi akti № ' || coalesce(nullif(a.raqam, ''), a.id::text) || ' (' || to_char(a.oy, 'YYYY-MM') || ')';
  select id into v_oldingi from public.t2_tomon_taqdim where aloqa_id = a.aloqa_id and manba_jadval = 't2_sub_akt' and manba_id = a.id and holat in ('tuzatish', 'rad') order by id desc limit 1;
  begin
    insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, shartnoma_id, nom, oy, summa,
                                        snapshot, snapshot_xesh, oldingi_taqdim_id, taqdim_actor_id, taqdim_izoh, operation_id)
    values (a.aloqa_id, p_kompaniya_id, v_gc, 'sub_akt', 't2_sub_akt', a.id, a.obyekt_id, v_shart, v_nom, a.oy, v_jami, v_snap, v_xesh, v_oldingi, p_actor_id,
            nullif(btrim(coalesce(p_izoh, '')), ''), p_operation_id)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON', 'error', 'Bu akt allaqachon yuborilgan');
  end;
  update public.t2_sub_akt set holat = 'yuborilgan', taqdim_id = v_id, versiya = versiya + 1, yangilandi = now() where id = a.id;
  perform public._t2_tomon_hodisa_yoz(a.aloqa_id, v_id, p_kompaniya_id, p_actor_id, 'taqdim', p_izoh, jsonb_build_object('resurs', 'sub_akt', 'manba_id', a.id, 'xesh', v_xesh));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'yuborilgan');
end $$;
comment on function public.t2_sub_akt_yubor_v1(bigint, bigint, bigint, text, uuid) is 'versiya: tarix - akt qatorlari nomi/birligi id bo''yicha snapshotga yoziladi.';

-- 10. BOSH PUDRATCHI: qaror. qabul -> fakt (bir marta) + subpudrat xarajati (bir qator); tuzatish/rad -> subpudratchiga qaytadi.
create or replace function public.t2_sub_akt_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.t2_tomon_taqdim; a public.t2_sub_akt; v_yangi text; v_bad jsonb; v_sana date; v_res jsonb; v_fakt bigint; v_xid bigint; v_summa numeric; v_shart bigint; v_op uuid;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id and resurs = 'sub_akt' for update;
  if not found or q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi');
  end if;
  v_yangi := case p_qaror when 'korilmoqda' then 'ko_rilmoqda' when 'qabul' then 'qabul' when 'rad' then 'rad' when 'tuzatish' then 'tuzatish' end;
  if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: korilmoqda | qabul | rad | tuzatish'); end if;
  select * into a from public.t2_sub_akt where id = q.manba_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_YOQ', 'error', 'Akt topilmadi'); end if;
  if q.holat = 'qabul' and v_yangi = 'qabul' then
    return jsonb_build_object('ok', true, 'id', q.id, 'holat', 'qabul', 'qayta', true, 'fakt_akt_id', a.fakt_akt_id, 'xarajat_id', a.xarajat_id);
  end if;
  if not exists (select 1 from public.t2_tomon_aloqa where id = q.aloqa_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS', 'error', 'Aloqa faol emas');
  end if;
  if q.holat not in ('yuborilgan', 'ko_rilmoqda') or a.holat <> 'yuborilgan' then
    return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu akt bo''yicha qaror allaqachon chiqarilgan');
  end if;
  if v_yangi in ('rad', 'tuzatish') and length(btrim(coalesce(p_izoh, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad etish yoki tuzatish so''rash uchun izoh yozing');
  end if;

  if v_yangi = 'qabul' then
    if public._t2_sub_akt_xesh(a.id) is distinct from q.snapshot_xesh then
      return jsonb_build_object('ok', false, 'code', 'BUTUNLIK', 'error', 'Yuborilgandan keyin akt o''zgargan - subpudratchidan qayta yuborishni so''rang');
    end if;
    -- Bir ish = bitta fakt: bosh pudratchining qo'lda faktini + boshqa qabul qilingan sub hajmini topshirilgan hajmdan oshirib bo'lmaydi.
    select jsonb_agg(jsonb_build_object('topshiriq_id', z.id, 'qator_id', z.qator_id, 'sabab', z.sabab, 'qolgan_hajm', z.qolgan)) into v_bad from (
      select t.id, t.qator_id,
             case when t.holat <> 'faol' then 'TOPSHIRIQ_BEKOR' else 'ORTIQCHA' end as sabab,
             t.hajm - public._t2_sub_gc_fakt(t.qator_id)
               - (select coalesce(sum(l2.hajm), 0) from public.t2_sub_akt_qator l2 join public.t2_sub_akt s2 on s2.id = l2.sub_akt_id where l2.topshiriq_id = t.id and s2.holat = 'qabul' and s2.id <> a.id) as qolgan,
             l.hajm as hajm
        from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = a.id) z
     where z.sabab = 'TOPSHIRIQ_BEKOR' or z.hajm > z.qolgan + 0.000001;
    if v_bad is not null then
      return jsonb_build_object('ok', false, 'code', 'ORTIQCHA', 'error', 'Bu hajm allaqachon faktda yoki topshirilgan hajmdan oshadi - ikki marta hisoblanmaydi', 'qatorlar', v_bad);
    end if;
    v_sana := least((date_trunc('month', a.oy) + interval '1 month' - interval '1 day')::date, current_date);
    v_op := md5('sub_akt_fakt:' || a.id::text)::uuid;
    v_res := public.t2_fakt_yoz_v2(a.obyekt_id, v_sana,
      (select jsonb_agg(jsonb_build_object('qator_id', t.qator_id, 'hajm', l.hajm, 'izoh', 'Subpudratchi akti № ' || a.id::text) order by l.id)
         from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = a.id),
      p_actor_id, v_op, 'Subpudratchi akti № ' || a.id::text, null, 'sub_akt:' || a.id::text);
    if not coalesce((v_res->>'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'code', 'FAKT_YOZILMADI', 'error', 'Faktga yozib bo''lmadi', 'fakt', v_res);
    end if;
    v_fakt := (v_res->>'akt_id')::bigint;
    select sum(l.hajm * l.narx) into v_summa from public.t2_sub_akt_qator l where l.sub_akt_id = a.id;
    select case when count(distinct t.shartnoma_id) = 1 and bool_and(t.shartnoma_id is not null) then max(t.shartnoma_id) end into v_shart
      from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = a.id;
    if v_summa is not null and v_summa <> 0 then
      insert into public.t2_xarajat (kompaniya_id, sana, toifa, summa, izoh, holat, operation_id, kim, obyekt_id, shartnoma_id, kat, manba, hujjat_ref)
      values (p_kompaniya_id, v_sana, 'subpudrat', v_summa, 'Subpudratchi akti № ' || a.id::text, 'faol', md5('sub_akt_xarajat:' || a.id::text)::uuid,
              'actor:' || p_actor_id::text, a.obyekt_id, v_shart, 'SUB', 'qolda', 'sub_akt:' || a.id::text)
      on conflict (operation_id) where operation_id is not null do nothing
      returning id into v_xid;
      if v_xid is null then select id into v_xid from public.t2_xarajat where operation_id = md5('sub_akt_xarajat:' || a.id::text)::uuid; end if;
    end if;
    update public.t2_sub_akt set holat = 'qabul', fakt_akt_id = v_fakt, xarajat_id = v_xid, versiya = versiya + 1, yangilandi = now() where id = a.id;
  elsif v_yangi in ('rad', 'tuzatish') then
    update public.t2_sub_akt set holat = 'tuzatish', versiya = versiya + 1, yangilandi = now() where id = a.id;
  end if;

  perform set_config('t2.sub_qaror', '1', true);
  update public.t2_tomon_taqdim
     set holat = v_yangi, versiya = versiya + 1, yangilandi = now(),
         qaror_actor_id = case when v_yangi = 'ko_rilmoqda' then qaror_actor_id else p_actor_id end,
         qaror_vaqti = case when v_yangi = 'ko_rilmoqda' then qaror_vaqti else now() end,
         qaror_izoh = case when v_yangi = 'ko_rilmoqda' then qaror_izoh else nullif(btrim(coalesce(p_izoh, '')), '') end
   where id = q.id;
  perform set_config('t2.sub_qaror', '', true);
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, p_kompaniya_id, p_actor_id, case when v_yangi = 'ko_rilmoqda' then 'korilmoqda' else 'qaror' end, p_izoh, jsonb_build_object('qaror', v_yangi));
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', v_yangi, 'fakt_akt_id', v_fakt, 'xarajat_id', v_xid);
end $$;
comment on function public.t2_sub_akt_qaror_v1(bigint, bigint, bigint, text, text) is 'versiya: tarix - fakt t2_fakt_yoz_v2 orqali; topshiriq qatori id bo''yicha.';

-- 11. Ro'yxat (ikki tomon): 'kelgan' = bosh pudratchi uchun (qoralamalarsiz), 'yuborilgan' = subpudratchi uchun (hammasi)
create or replace function public.t2_sub_akt_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text default 'yuborilgan')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_kelgan boolean := (p_yonalish = 'kelgan');
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(r order by (r->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', s.id, 'aloqa_id', s.aloqa_id, 'obyekt_id', s.obyekt_id, 'obyekt_nom', o.nom, 'oy', s.oy, 'raqam', s.raqam, 'holat', s.holat, 'taqdim_id', s.taqdim_id,
      'taqdim_holat', tq.holat, 'qaror_izoh', tq.qaror_izoh, 'taqdim_vaqti', tq.taqdim_vaqti, 'qaror_vaqti', tq.qaror_vaqti,
      'sub_nom', ks.nom, 'gc_nom', kg.nom, 'fakt_akt_id', s.fakt_akt_id, 'xarajat_id', s.xarajat_id,
      'qator_soni', j.soni, 'jami_qqs_siz', case when j.narxsiz = 0 then j.jami end) as r
      from public.t2_sub_akt s
      join public.t2_obyekt o on o.id = s.obyekt_id
      join public.t2_kompaniya ks on ks.id = s.sub_kompaniya_id
      join public.t2_kompaniya kg on kg.id = s.kompaniya_id
      left join public.t2_tomon_taqdim tq on tq.id = s.taqdim_id
      cross join lateral (
        select count(*) as soni, count(*) filter (where coalesce(l.narx, t.narx) is null) as narxsiz, sum(l.hajm * coalesce(l.narx, t.narx)) as jami
          from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = s.id) j
     where ((v_kelgan and s.kompaniya_id = p_kompaniya_id and s.holat in ('yuborilgan', 'qabul', 'tuzatish'))
         or (not v_kelgan and s.sub_kompaniya_id = p_kompaniya_id and s.holat <> 'bekor'))
     order by s.id desc limit 200) z;
  return jsonb_build_object('ok', true, 'aktlar', v);
end $$;

create or replace function public.t2_sub_akt_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sub_akt_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_sub_akt; v_qat jsonb; v_hod jsonb; tq public.t2_tomon_taqdim; v_narxsiz integer; v_jami numeric;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into a from public.t2_sub_akt where id = p_sub_akt_id;
  if not found or (a.sub_kompaniya_id <> p_kompaniya_id and not (a.kompaniya_id = p_kompaniya_id and a.holat in ('yuborilgan', 'qabul', 'tuzatish'))) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Akt topilmadi');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('topshiriq_id', t.id, 'qator_id', q.id, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', l.hajm,
           'narx', coalesce(l.narx, t.narx), 'topshirilgan_hajm', t.hajm, 'qqs_foiz', t.qqs_foiz, 'izoh', l.izoh) order by q.tartib, l.id), '[]'::jsonb),
         count(*) filter (where coalesce(l.narx, t.narx) is null), sum(l.hajm * coalesce(l.narx, t.narx))
    into v_qat, v_narxsiz, v_jami
    from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id join public.t2_qator q on q.id = t.qator_id where l.sub_akt_id = a.id;
  select * into tq from public.t2_tomon_taqdim where id = a.taqdim_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'tur', e.tur, 'matn', e.matn, 'vaqt', e.vaqt, 'meni', e.kompaniya_id = p_kompaniya_id,
           'kompaniya_nom', (select nom from public.t2_kompaniya where id = e.kompaniya_id)) order by e.id), '[]'::jsonb)
    into v_hod from public.t2_tomon_hodisa e where e.taqdim_id = a.taqdim_id;
  return jsonb_build_object('ok', true,
    'akt', jsonb_build_object('id', a.id, 'aloqa_id', a.aloqa_id, 'obyekt_id', a.obyekt_id, 'obyekt_nom', (select nom from public.t2_obyekt where id = a.obyekt_id), 'oy', a.oy, 'raqam', a.raqam,
      'izoh', a.izoh, 'holat', a.holat, 'taqdim_id', a.taqdim_id, 'taqdim_holat', tq.holat, 'qaror_izoh', tq.qaror_izoh, 'qaror_vaqti', tq.qaror_vaqti,
      'sub_nom', (select nom from public.t2_kompaniya where id = a.sub_kompaniya_id), 'gc_nom', (select nom from public.t2_kompaniya where id = a.kompaniya_id),
      'fakt_akt_id', a.fakt_akt_id, 'xarajat_id', a.xarajat_id, 'meniki', a.sub_kompaniya_id = p_kompaniya_id),
    'qatorlar', v_qat, 'narxsiz_qator', v_narxsiz, 'jami_qqs_siz', case when v_narxsiz = 0 then v_jami end, 'hodisalar', v_hod);
end $$;
comment on function public.t2_sub_akt_royxat_v1(bigint, bigint, text) is 'versiya: tarix - qator o''qimaydi (akt qatorlari t2_sub_akt_qator).';
comment on function public.t2_sub_akt_tafsilot_v1(bigint, bigint, bigint) is 'versiya: tarix - akt qatorlari nomi/birligi id bo''yicha; smeta narxi chiqmaydi.';

-- 12. SUBPUDRATCHI: to'lov holati (faqat bosh pudratchi 'tolov_holati' grant bergan bo'lsa; grant yo'q -> pul maydonlari NULL).
--     Qabul = qabul qilingan aktlar jami (QQS siz) shartnoma kesimida; to'langan = bosh pudratchining shu shartnomadagi to'lovlari. Qarz hisobi mijozda (hisob-yadro).
create or replace function public.t2_sub_tolov_holati_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_sub_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(r order by (r->>'akt_id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'akt_id', z.id, 'oy', z.oy, 'obyekt_nom', z.obyekt_nom, 'gc_nom', z.gc_nom, 'ruxsat', z.ruxsat,
      'jami_qqs_siz', z.jami, 'qqs_foiz', z.qqs,
      'shartnoma_id', case when z.ruxsat then z.sh end,
      'shartnoma_qabul_qqs_siz', case when z.ruxsat and z.sh is not null then z.sh_qabul end,
      'tolangan', case when z.ruxsat and z.sh is not null then z.tolangan end) as r
    from (
      select s.id, s.oy, o.nom as obyekt_nom, kg.nom as gc_nom,
             public.t2_tomon_ruxsat_bor(p_kompaniya_id, s.kompaniya_id, 'tolov_holati', 'korish', s.obyekt_id) as ruxsat,
             j.jami, j.qqs, j.sh,
             (select sum(l2.hajm * l2.narx) from public.t2_sub_akt s2 join public.t2_sub_akt_qator l2 on l2.sub_akt_id = s2.id join public.t2_sub_topshiriq t2x on t2x.id = l2.topshiriq_id
               where s2.sub_kompaniya_id = p_kompaniya_id and s2.holat = 'qabul' and t2x.shartnoma_id = j.sh) as sh_qabul,
             (select sum(case when tl.tur = 'qaytarim' then -tl.summa else tl.summa end) from public.t2_tolov tl
               where tl.kompaniya_id = s.kompaniya_id and tl.holat <> 'bekor' and tl.shartnoma_id = j.sh) as tolangan
        from public.t2_sub_akt s
        join public.t2_obyekt o on o.id = s.obyekt_id
        join public.t2_kompaniya kg on kg.id = s.kompaniya_id
        cross join lateral (
          select sum(l.hajm * l.narx) as jami, case when count(distinct t.qqs_foiz) = 1 then max(t.qqs_foiz) end as qqs,
                 case when count(distinct t.shartnoma_id) = 1 and bool_and(t.shartnoma_id is not null) then max(t.shartnoma_id) end as sh
            from public.t2_sub_akt_qator l join public.t2_sub_topshiriq t on t.id = l.topshiriq_id where l.sub_akt_id = s.id) j
       where s.sub_kompaniya_id = p_kompaniya_id and s.holat = 'qabul'
       order by s.id desc limit 100) z) y;
  return jsonb_build_object('ok', true, 'aktlar', v);
end $$;
comment on function public.t2_sub_tolov_holati_v1(bigint, bigint) is 'versiya: tarix - qator o''qimaydi (akt qatorlari t2_sub_akt_qator).';

-- 13. Ruxsatlar: faqat service_role (shlyuz /api/tomon)
revoke all on function public._t2_sub_rol_ok(text, text), public._t2_sub_azo(bigint, bigint, text), public._t2_sub_qarshi_sub(bigint, bigint), public._t2_sub_qarshi_gc(bigint, bigint),
  public._t2_sub_ishlatilgan(bigint, bigint), public._t2_sub_gc_fakt(bigint), public._t2_sub_akt_xesh(bigint), public._t2_sub_taqdim_qorovul() from public, anon, authenticated;
revoke all on function public.t2_sub_topshir_v1(bigint, bigint, bigint, bigint, jsonb, bigint, bigint, numeric) from public, anon, authenticated;
revoke all on function public.t2_sub_topshiriq_bekor_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_sub_boshqaruv_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_sub_ishlarim_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_sub_akt_yoz_v1(bigint, bigint, bigint, bigint, date, jsonb, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_sub_akt_yubor_v1(bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_sub_akt_qaror_v1(bigint, bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.t2_sub_akt_royxat_v1(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.t2_sub_akt_tafsilot_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_sub_tolov_holati_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_sub_topshir_v1(bigint, bigint, bigint, bigint, jsonb, bigint, bigint, numeric) to service_role;
grant execute on function public.t2_sub_topshiriq_bekor_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_sub_boshqaruv_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_sub_ishlarim_v1(bigint, bigint) to service_role;
grant execute on function public.t2_sub_akt_yoz_v1(bigint, bigint, bigint, bigint, date, jsonb, bigint, text, text, uuid) to service_role;
grant execute on function public.t2_sub_akt_yubor_v1(bigint, bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_sub_akt_qaror_v1(bigint, bigint, bigint, text, text) to service_role;
grant execute on function public.t2_sub_akt_royxat_v1(bigint, bigint, text) to service_role;
grant execute on function public.t2_sub_akt_tafsilot_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_sub_tolov_holati_v1(bigint, bigint) to service_role;
