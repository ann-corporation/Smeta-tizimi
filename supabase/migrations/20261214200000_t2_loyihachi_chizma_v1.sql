-- 20261214200000 - LOYIHACHI / MUALLIFLIK NAZORATI tomoni (ekotizim V3, tomon-loyihachi).
-- Egasi: loyihachi chizmalarni obyekt bo'yicha reyestrda yuritadi, yangi revizya chiqaradi (pudratchi va texnadzor xabar oladi),
-- pudratchi savol (RFI) beradi, mualliflik nazorati remark yozadi (muddat bilan), revizya smeta qatori / АОСР ga bog'lanadi,
-- loyiha o'zgarishi smeta o'zgarish taklifi (zamena/qo'shimcha) bo'lib PTO ga boradi.
--
-- Qayta ishlatiladi (parallel hujjat/pochta jadvali YO'Q):
--   * fayl - t2_document_registry (R2); bu yerda faqat ingichka metadata;
--   * ikki kompaniya orasida ko'rinish - t2_tomon_aloqa + t2_tomon_taqdim (resurs 'chizma'): chizma revizyasi chiqarilganda
--     har tanlangan aloqaga taqdim yaratiladi; qabul qiluvchi qaror chiqaradi. Grant kerak emas (taqdimning o'zi ruxsat);
--   * RFI va mualliflik remarki - mavjud t2_tomon_murojaat (turi 'savol' / 'mualliflik_remark', muddat, javob + dalil fayl);
--   * bildirishnoma - t2_outbox -> t2_bildirishnoma; smeta o'zgarishi - mavjud t2_smeta_ozgarish_yarat_v1.
-- Pul: bu migratsiya summa hisoblamaydi (taklifda narx YO'Q - narxni PTO smeta/manba orqali qo'yadi).
-- DB hajmi: ~ 1 KB / chizma varag'i + ~ 0.5 KB / revizya; 100 obyekt x 200 varaq x 3 revizya ~ 40 MB EMAS, ~ 14 MB umr bo'yi
-- (oyiga <1 MB). Fayllar R2 da.
-- Faqat additiv. Rollback: *.rollback.sql. Acceptance: *.acceptance.sql.

-- 1. Jadvallar ------------------------------------------------------------------------------------------------------------
create table if not exists public.t2_chizma_toplam (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- loyihachi tenanti (egasi)
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),              -- qaysi pudratchiga (asosiy)
  obyekt_id bigint not null references public.t2_obyekt(id),
  bosqich text not null check (bosqich in ('PD', 'RD')),
  marka text not null check (length(btrim(marka)) between 1 and 20),
  varaq text not null check (length(btrim(varaq)) between 1 and 40),
  nom text check (nom is null or length(nom) <= 300),
  holat text not null default 'faol' check (holat in ('faol', 'arxiv')),
  yaratdi_actor_id bigint not null,
  operation_id uuid,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_chizma_toplam_kalit_uq on public.t2_chizma_toplam
  (kompaniya_id, obyekt_id, bosqich, upper(btrim(marka)), lower(btrim(varaq)));
create index if not exists t2_chizma_toplam_obyekt_idx on public.t2_chizma_toplam (obyekt_id);
create index if not exists t2_chizma_toplam_aloqa_idx on public.t2_chizma_toplam (aloqa_id);
alter table public.t2_chizma_toplam enable row level security;
revoke all on table public.t2_chizma_toplam from anon, authenticated;

create table if not exists public.t2_chizma_revizya (
  id bigint generated always as identity primary key,
  toplam_id bigint not null references public.t2_chizma_toplam(id),
  revizya integer not null check (revizya >= 0),
  document_id bigint references public.t2_document_registry(id),
  holat text not null default 'qoralama' check (holat in ('qoralama', 'ruxsat', 'bekor')),
  ozgarish_izohi text check (ozgarish_izohi is null or length(ozgarish_izohi) <= 2000),
  taasir_izoh text check (taasir_izoh is null or length(taasir_izoh) <= 2000),
  bekor_sabab text check (bekor_sabab is null or length(bekor_sabab) <= 1000),
  chiqardi_actor_id bigint,
  ruxsat_vaqti timestamptz,
  yaratdi_actor_id bigint not null,
  operation_id uuid,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (toplam_id, revizya)
);
create index if not exists t2_chizma_revizya_hujjat_idx on public.t2_chizma_revizya (document_id) where document_id is not null;
alter table public.t2_chizma_revizya enable row level security;
revoke all on table public.t2_chizma_revizya from anon, authenticated;

-- Pudratchi tomoni: qaysi smeta qatori / АОСР qaysi chizma revizyasiga tayangan.
create table if not exists public.t2_chizma_boglanish (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),            -- pudratchi (bog'lovchi)
  toplam_id bigint not null references public.t2_chizma_toplam(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  qator_id bigint,
  aosr_id bigint,
  revizya integer not null check (revizya >= 0),                              -- ishlatilgan revizya
  actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (num_nonnulls(qator_id, aosr_id) = 1)
);
create unique index if not exists t2_chizma_boglanish_qator_uq on public.t2_chizma_boglanish (kompaniya_id, toplam_id, qator_id) where qator_id is not null;
create unique index if not exists t2_chizma_boglanish_aosr_uq on public.t2_chizma_boglanish (kompaniya_id, toplam_id, aosr_id) where aosr_id is not null;
create index if not exists t2_chizma_boglanish_obyekt_idx on public.t2_chizma_boglanish (kompaniya_id, obyekt_id);
alter table public.t2_chizma_boglanish enable row level security;
revoke all on table public.t2_chizma_boglanish from anon, authenticated;

-- Loyiha o'zgarishidan smeta o'zgarish TAKLIFI (loyihachi yozadi, PTO smeta o'zgarishiga aylantiradi yoki rad etadi). Narx YO'Q.
create table if not exists public.t2_chizma_taklif (
  id bigint generated always as identity primary key,
  revizya_id bigint not null references public.t2_chizma_revizya(id),
  tur text not null check (tur in ('qoshimcha', 'zamena', 'olib_tashlash', 'hajm')),
  nom text not null check (length(btrim(nom)) between 2 and 300),
  birlik text check (birlik is null or length(birlik) <= 20),
  hajm numeric,
  izoh text check (izoh is null or length(izoh) <= 1000),
  holat text not null default 'yangi' check (holat in ('yangi', 'ozgarishga', 'rad')),
  pto_kompaniya_id bigint references public.t2_kompaniya(id),
  pto_actor_id bigint,
  pto_vaqti timestamptz,
  pto_izoh text check (pto_izoh is null or length(pto_izoh) <= 1000),
  ozgarish_id bigint,
  yozdi_actor_id bigint not null,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_chizma_taklif_revizya_idx on public.t2_chizma_taklif (revizya_id, holat);
alter table public.t2_chizma_taklif enable row level security;
revoke all on table public.t2_chizma_taklif from anon, authenticated;

-- 2. Resurs katalogi + taqdim manbasi ------------------------------------------------------------------------------------------
insert into public.t2_tomon_resurs (kalit, nom, nom_ru, guruh, amallar, taqdim_mumkin, faol, tartib, izoh)
values ('chizma', 'Chizma revizyasi', 'Ревизия чертежа', 'hujjat', array['korish'], true, true, 45,
        'Loyihachi chiqargan chizma revizyasi: pudratchi/texnadzor qabul qiladi yoki tuzatish so''raydi')
on conflict (kalit) do update set faol = true, taqdim_mumkin = true;

do $c$
declare c record; v_list text[]; v_def text;
begin
  select conname, pg_get_constraintdef(oid) as def into c from pg_constraint
   where conrelid = 'public.t2_tomon_taqdim'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba_jadval%' limit 1;
  if c.conname is null then raise exception 'manba_jadval cheklovi topilmadi'; end if;
  -- Mavjud ruxsat etilgan qiymatlar saqlanadi (boshqa agentlar qo'shgan bo'lishi mumkin) + bizniki.
  select array_agg(distinct m[1]) into v_list from regexp_matches(c.def, '''([a-z0-9_]+)''', 'g') as m;
  v_list := array(select distinct x from unnest(v_list || array['t2_chizma_revizya']) x order by 1);
  select string_agg(quote_literal(x), ', ') into v_def from unnest(v_list) x;
  execute format('alter table public.t2_tomon_taqdim drop constraint %I', c.conname);
  execute format('alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_manba_jadval_check check (manba_jadval in (%s))', v_def);
end $c$;

-- 3. Rol -> amal: murojaat (RFI / mualliflik remarki) loyihachi va texnadzor uchun. Funksiya tanasi mavjud ko'rinishdan
--    olinadi (boshqa migratsiyalar qo'shgan rollar yo'qolmaydi). 'murojaat' tarmog'i bo'lmasa qo'shiladi.
do $r$
declare v text; n text;
begin
  v := pg_get_functiondef('public._t2_tomon_rol_ok(text,text)'::regprocedure);
  n := v;
  if n !~ 'when ''murojaat''' then
    n := regexp_replace(n, 'else\s+false\s+end',
      'when ''murojaat'' then p_rol in (''superadmin'',''admin'',''boss'',''rahbar'',''director'',''pto'',''prorab'',''buyurtmachi'',''inspektor'',''loyihachi'') else false end');
  elsif n !~ 'when ''murojaat''\s+then\s+p_rol\s+in\s*\([^)]*''loyihachi''' then
    n := regexp_replace(n, '(when ''murojaat''\s+then\s+p_rol\s+in\s*\()', '\1''loyihachi'', ');
  end if;
  if n is distinct from v then execute n; end if;
end $r$;

-- 4. Yordamchilar -------------------------------------------------------------------------------------------------------------
-- Obyekt aloqa tomonlaridan birining obyekti; qarshi tomon obyekti bo'lsa - u menga ko'rish ruxsatini bergan bo'lishi shart.
create or replace function public._t2_chizma_obyekt_ok(p_kompaniya_id bigint, p_aloqa public.t2_tomon_aloqa, p_obyekt_id bigint)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ob public.t2_obyekt; v_qarshi bigint := public._t2_tomon_qarshi(p_aloqa, p_kompaniya_id);
begin
  select * into v_ob from public.t2_obyekt where id = p_obyekt_id and holat = 'faol';
  if not found or v_ob.kompaniya_id not in (p_kompaniya_id, v_qarshi) then return false; end if;
  if v_ob.kompaniya_id = v_qarshi and not public.t2_tomon_ruxsat_bor(p_kompaniya_id, v_qarshi, 'obyekt_holat', 'korish', p_obyekt_id) then return false; end if;
  return true;
end $$;

-- Taqdim orqali revizya qabul qiluvchisi (faol aloqa): kompaniya shu toplamning biror revizyasini olgan.
create or replace function public._t2_chizma_oluvchi(p_kompaniya_id bigint, p_toplam_id bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_tomon_taqdim q
                   join public.t2_chizma_revizya r on q.manba_jadval = 't2_chizma_revizya' and r.id = q.manba_id
                   join public.t2_tomon_aloqa a on a.id = q.aloqa_id and a.holat = 'faol'
                  where r.toplam_id = p_toplam_id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat <> 'qaytarilgan')
$$;

-- Xabar: qabul qiluvchi kompaniyalar (umumiy rollar) + aniq a'zolar (loyihachi/inspektor/prorab) - t2_outbox -> t2_bildirishnoma.
create or replace function public._t2_chizma_xabar(p_kompaniya_id bigint, p_mavzu text, p_revizya_id bigint, p_obyekt_id bigint, p_aloqa_id bigint,
  p_actor_id bigint, p_qabul bigint[], p_rollar text[], p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_users bigint[];
begin
  select coalesce(array_agg(distinct a.foydalanuvchi_id), '{}') into v_users from public.t2_azolik a
   where a.kompaniya_id = any (p_qabul) and a.holat = 'faol' and a.rol = any (p_rollar) and a.foydalanuvchi_id is distinct from p_actor_id;
  perform public.t2_outbox_yoz(p_kompaniya_id, p_mavzu, 't2_chizma_revizya', p_revizya_id, coalesce(p_payload, '{}'::jsonb), p_actor_id, gen_random_uuid(),
    p_obyekt_id, p_aloqa_id, p_qabul, v_users);
exception when others then
  raise warning 'T2_CHIZMA_XABAR: % yozilmadi: %', p_mavzu, sqlerrm;
end $$;

-- 5. Loyihachi: toplam (chizma varag'i) -----------------------------------------------------------------------------------------
create or replace function public.t2_chizma_toplam_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aloqa_id bigint, p_obyekt_id bigint,
  p_bosqich text, p_marka text, p_varaq text, p_nom text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'design.write');
  if p_bosqich not in ('PD', 'RD') then return jsonb_build_object('ok', false, 'code', 'BOSQICH', 'error', 'Bosqich: PD (loyiha) yoki RD (ishchi hujjat)'); end if;
  if length(btrim(coalesce(p_marka, ''))) < 1 or length(btrim(coalesce(p_varaq, ''))) < 1 then
    return jsonb_build_object('ok', false, 'code', 'MARKA_VARAQ', 'error', 'Marka va varaq raqamini yozing');
  end if;
  select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;
  if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Aloqa topilmadi');
  end if;
  if a.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Aloqa faol emas'); end if;
  if not public._t2_chizma_obyekt_ok(p_kompaniya_id, a, p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOPIQ', 'error', 'Obyekt aloqa tomonlariga tegishli emas yoki sizga ochilmagan');
  end if;
  select id into v_id from public.t2_chizma_toplam
   where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and bosqich = p_bosqich
     and upper(btrim(marka)) = upper(btrim(p_marka)) and lower(btrim(varaq)) = lower(btrim(p_varaq));
  if found then
    update public.t2_chizma_toplam set nom = coalesce(nullif(btrim(coalesce(p_nom, '')), ''), nom), versiya = versiya + 1, yangilandi = now() where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'qayta', true);
  end if;
  insert into public.t2_chizma_toplam (kompaniya_id, aloqa_id, obyekt_id, bosqich, marka, varaq, nom, yaratdi_actor_id, operation_id)
  values (p_kompaniya_id, a.id, p_obyekt_id, p_bosqich, upper(btrim(p_marka)), btrim(p_varaq), nullif(btrim(coalesce(p_nom, '')), ''), p_actor_id, p_operation_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'qayta', false);
end $$;

-- 6. Loyihachi: yangi revizya (qoralama) ---------------------------------------------------------------------------------------
create or replace function public.t2_chizma_revizya_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_toplam_id bigint, p_document_id bigint,
  p_ozgarish_izohi text, p_taasir_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_chizma_toplam; v_n integer; v_id bigint; v_old public.t2_chizma_revizya;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'design.write');
  select * into t from public.t2_chizma_toplam where id = p_toplam_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Chizma varag''i topilmadi'); end if;
  if p_operation_id is not null then
    select * into v_old from public.t2_chizma_revizya where toplam_id = t.id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'revizya', v_old.revizya, 'qayta', true); end if;
  end if;
  if p_document_id is not null and not exists (select 1 from public.t2_document_registry d
        where d.id = p_document_id and d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored') then
    return jsonb_build_object('ok', false, 'code', 'FAYL', 'error', 'Fayl sizning kompaniyangizniki emas yoki hali to''liq saqlanmagan');
  end if;
  select coalesce(max(revizya), -1) + 1 into v_n from public.t2_chizma_revizya where toplam_id = t.id;
  insert into public.t2_chizma_revizya (toplam_id, revizya, document_id, ozgarish_izohi, taasir_izoh, yaratdi_actor_id, operation_id)
  values (t.id, v_n, p_document_id, nullif(btrim(coalesce(p_ozgarish_izohi, '')), ''), nullif(btrim(coalesce(p_taasir_izoh, '')), ''), p_actor_id, p_operation_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'revizya', v_n, 'qayta', false);
end $$;

-- Revizyani qoralamada tahrirlash (fayl, izoh) - chiqarilgan revizya o'zgarmaydi.
create or replace function public.t2_chizma_revizya_tahrir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_revizya_id bigint, p_document_id bigint,
  p_ozgarish_izohi text, p_taasir_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_chizma_revizya;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'design.write');
  select r2.* into r from public.t2_chizma_revizya r2 join public.t2_chizma_toplam t on t.id = r2.toplam_id and t.kompaniya_id = p_kompaniya_id
   where r2.id = p_revizya_id for update of r2;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Revizya topilmadi'); end if;
  if r.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Faqat qoralama revizya tahrirlanadi'); end if;
  if p_document_id is not null and not exists (select 1 from public.t2_document_registry d
        where d.id = p_document_id and d.kompaniya_id = p_kompaniya_id and d.canonical_storage_status = 'stored') then
    return jsonb_build_object('ok', false, 'code', 'FAYL', 'error', 'Fayl sizning kompaniyangizniki emas yoki hali to''liq saqlanmagan');
  end if;
  update public.t2_chizma_revizya set document_id = coalesce(p_document_id, document_id),
         ozgarish_izohi = coalesce(nullif(btrim(coalesce(p_ozgarish_izohi, '')), ''), ozgarish_izohi),
         taasir_izoh = coalesce(nullif(btrim(coalesce(p_taasir_izoh, '')), ''), taasir_izoh), versiya = versiya + 1, yangilandi = now()
   where id = r.id;
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

-- 7. Loyihachi: smeta o'zgarish taklifi qatori (narxsiz) ---------------------------------------------------------------------------
create or replace function public.t2_chizma_taklif_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_revizya_id bigint, p_tur text, p_nom text,
  p_birlik text, p_hajm numeric, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_chizma_revizya; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'design.write');
  select r2.* into r from public.t2_chizma_revizya r2 join public.t2_chizma_toplam t on t.id = r2.toplam_id and t.kompaniya_id = p_kompaniya_id where r2.id = p_revizya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Revizya topilmadi'); end if;
  if r.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bekor qilingan revizyaga taklif yozilmaydi'); end if;
  if p_tur not in ('qoshimcha', 'zamena', 'olib_tashlash', 'hajm') then return jsonb_build_object('ok', false, 'code', 'TUR', 'error', 'Taklif turi noto''g''ri'); end if;
  if length(btrim(coalesce(p_nom, ''))) < 2 then return jsonb_build_object('ok', false, 'code', 'NOM', 'error', 'Ish nomini yozing'); end if;
  if p_hajm is not null and p_hajm < 0 then return jsonb_build_object('ok', false, 'code', 'HAJM', 'error', 'Hajm manfiy bo''lmaydi'); end if;
  if (select count(*) from public.t2_chizma_taklif where revizya_id = r.id) >= 50 then
    return jsonb_build_object('ok', false, 'code', 'KOP', 'error', 'Bitta revizyaga ko''pi bilan 50 ta taklif'); end if;
  insert into public.t2_chizma_taklif (revizya_id, tur, nom, birlik, hajm, izoh, yozdi_actor_id)
  values (r.id, p_tur, btrim(p_nom), nullif(btrim(coalesce(p_birlik, '')), ''), p_hajm, nullif(btrim(coalesce(p_izoh, '')), ''), p_actor_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 8. Loyihachi: revizyani chiqarish (ishga ruxsat) + taqdim + xabar ------------------------------------------------------------------
create or replace function public.t2_chizma_chiqar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_revizya_id bigint, p_aloqa_idlar bigint[], p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_chizma_revizya; t public.t2_chizma_toplam; d public.t2_document_registry; a public.t2_tomon_aloqa;
  v_idlar bigint[]; v_id bigint; v_qarshi bigint; v_qabul bigint[] := '{}'; v_tq bigint; v_nom text; v_snap jsonb; v_xesh text;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'design.issue');
  select r2.* into r from public.t2_chizma_revizya r2 where r2.id = p_revizya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Revizya topilmadi'); end if;
  select * into t from public.t2_chizma_toplam where id = r.toplam_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Revizya topilmadi'); end if;
  if r.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu revizya allaqachon chiqarilgan yoki bekor qilingan'); end if;
  if r.revizya >= 1 and length(btrim(coalesce(r.ozgarish_izohi, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Nima o''zgarganini yozing - izohsiz yangi revizya chiqarilmaydi');
  end if;
  if exists (select 1 from public.t2_chizma_revizya x where x.toplam_id = t.id and x.holat = 'ruxsat' and x.revizya > r.revizya) then
    return jsonb_build_object('ok', false, 'code', 'ESKIRGAN', 'error', 'Bundan yuqori revizya allaqachon chiqarilgan');
  end if;
  select * into d from public.t2_document_registry where id = r.document_id and kompaniya_id = p_kompaniya_id;
  if not found or d.canonical_storage_status is distinct from 'stored' then
    return jsonb_build_object('ok', false, 'code', 'FAYL_KERAK', 'error', 'Chiqarishdan oldin chizma faylini (PDF/DWG) yuklang');
  end if;
  v_idlar := case when p_aloqa_idlar is null or cardinality(p_aloqa_idlar) = 0 then array[t.aloqa_id] else p_aloqa_idlar end;
  if cardinality(v_idlar) > 10 then return jsonb_build_object('ok', false, 'code', 'KOP', 'error', 'Ko''pi bilan 10 ta qabul qiluvchi'); end if;
  v_nom := 'Chizma ' || t.marka || '-' || t.varaq || ' (' || t.bosqich || '), rev. ' || r.revizya;
  v_snap := jsonb_build_object('tur', 'chizma', 'toplam_id', t.id, 'revizya_id', r.id, 'bosqich', t.bosqich, 'marka', t.marka, 'varaq', t.varaq, 'nom', t.nom,
    'revizya', r.revizya, 'ozgarish_izohi', r.ozgarish_izohi, 'taasir_izoh', r.taasir_izoh, 'document_id', d.id, 'fayl', d.original_filename, 'sha256', d.sha256);
  v_xesh := coalesce(d.sha256, md5(v_snap::text));
  foreach v_id in array v_idlar loop
    select * into a from public.t2_tomon_aloqa where id = v_id;
    if not found or (a.taklif_kompaniya_id <> p_kompaniya_id and a.qabul_kompaniya_id is distinct from p_kompaniya_id) or a.holat <> 'faol' then
      return jsonb_build_object('ok', false, 'code', 'ALOQA', 'error', 'Aloqa topilmadi yoki faol emas: ' || v_id);
    end if;
  end loop;
  update public.t2_chizma_revizya set holat = 'ruxsat', chiqardi_actor_id = p_actor_id, ruxsat_vaqti = now(), versiya = versiya + 1, yangilandi = now() where id = r.id;
  foreach v_id in array v_idlar loop
    select * into a from public.t2_tomon_aloqa where id = v_id;
    v_qarshi := public._t2_tomon_qarshi(a, p_kompaniya_id);
    insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, nom,
                                        snapshot, snapshot_xesh, taqdim_actor_id, taqdim_izoh)
    values (a.id, p_kompaniya_id, v_qarshi, 'chizma', 't2_chizma_revizya', r.id, t.obyekt_id, v_nom, v_snap, v_xesh, p_actor_id, nullif(btrim(coalesce(p_izoh, '')), ''))
    on conflict do nothing returning id into v_tq;
    v_qabul := v_qabul || v_qarshi;
  end loop;
  perform public._t2_chizma_xabar(p_kompaniya_id, 'chizma.chiqdi', r.id, t.obyekt_id, t.aloqa_id, p_actor_id, v_qabul,
    array['boss', 'admin', 'rahbar', 'director', 'pto', 'prorab', 'inspektor'],
    jsonb_build_object('revizya_id', r.id, 'toplam_id', t.id, 'marka', t.marka, 'varaq', t.varaq, 'revizya', r.revizya));
  perform public.t2_audit_yoz(p_kompaniya_id, 'chizma_chiqdi', 'chizma', null, format('toplam=%s revizya=%s taqdim_aloqa=%s', t.id, r.revizya, v_idlar), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', r.id, 'revizya', r.revizya, 'holat', 'ruxsat', 'qabul_soni', cardinality(v_qabul));
end $$;

create or replace function public.t2_chizma_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_revizya_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_chizma_revizya;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'design.issue');
  select r2.* into r from public.t2_chizma_revizya r2 join public.t2_chizma_toplam t on t.id = r2.toplam_id and t.kompaniya_id = p_kompaniya_id
   where r2.id = p_revizya_id for update of r2;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Revizya topilmadi'); end if;
  if r.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Allaqachon bekor qilingan'); end if;
  if length(btrim(coalesce(p_sabab, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK', 'error', 'Bekor qilish sababini yozing'); end if;
  update public.t2_chizma_revizya set holat = 'bekor', bekor_sabab = btrim(p_sabab), versiya = versiya + 1, yangilandi = now() where id = r.id;
  update public.t2_tomon_taqdim set holat = 'qaytarilgan', versiya = versiya + 1, yangilandi = now()
   where manba_jadval = 't2_chizma_revizya' and manba_id = r.id and holat in ('yuborilgan', 'ko_rilmoqda');
  return jsonb_build_object('ok', true, 'id', r.id, 'holat', 'bekor');
end $$;

-- 9. Reyestr (ikki tomon: loyihachi - o'ziniki; pudratchi/texnadzor - o'ziga chiqarilgan revizyalar) --------------------------------------
create or replace function public.t2_chizma_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(s.x order by s.x->>'marka', s.x->>'varaq'), '[]'::jsonb) into v from (
    select jsonb_build_object('id', t.id, 'bosqich', t.bosqich, 'marka', t.marka, 'varaq', t.varaq, 'nom', t.nom, 'obyekt_id', t.obyekt_id,
      'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = t.obyekt_id), 'aloqa_id', t.aloqa_id,
      'egasi', t.kompaniya_id = p_kompaniya_id, 'egasi_nom', (select k.nom from public.t2_kompaniya k where k.id = t.kompaniya_id),
      'boglanish_soni', (select count(*) from public.t2_chizma_boglanish b where b.toplam_id = t.id and b.kompaniya_id = p_kompaniya_id),
      'revizyalar', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'revizya', r.revizya, 'holat', r.holat, 'ozgarish_izohi', r.ozgarish_izohi, 'taasir_izoh', r.taasir_izoh,
            'document_id', r.document_id, 'fayl', (select dd.original_filename from public.t2_document_registry dd where dd.id = r.document_id),
            'ruxsat_vaqti', r.ruxsat_vaqti, 'taqdim_id', tq.id, 'taqdim_holat', tq.holat, 'qaror_izoh', tq.qaror_izoh, 'qaror_vaqti', tq.qaror_vaqti,
            'taklif_soni', (select count(*) from public.t2_chizma_taklif k where k.revizya_id = r.id),
            'taklif_yangi', (select count(*) from public.t2_chizma_taklif k where k.revizya_id = r.id and k.holat = 'yangi'))
          order by r.revizya)
          from public.t2_chizma_revizya r
          left join lateral (select q.* from public.t2_tomon_taqdim q
                              where q.manba_jadval = 't2_chizma_revizya' and q.manba_id = r.id
                                and (t.kompaniya_id = p_kompaniya_id or q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)
                              order by q.id desc limit 1) tq on true
         where r.toplam_id = t.id and (t.kompaniya_id = p_kompaniya_id or (tq.id is not null and tq.holat <> 'qaytarilgan'))), '[]'::jsonb)) x
      from public.t2_chizma_toplam t
     where (p_obyekt_id is null or t.obyekt_id = p_obyekt_id)
       and (t.kompaniya_id = p_kompaniya_id or public._t2_chizma_oluvchi(p_kompaniya_id, t.id))
     order by t.marka, t.varaq limit 400) s;
  return jsonb_build_object('ok', true, 'toplamlar', v);
end $$;

create or replace function public.t2_chizma_taklif_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_revizya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.t2_chizma_toplam;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select t2.* into t from public.t2_chizma_toplam t2 join public.t2_chizma_revizya r on r.toplam_id = t2.id where r.id = p_revizya_id;
  if not found or not (t.kompaniya_id = p_kompaniya_id or public._t2_chizma_oluvchi(p_kompaniya_id, t.id)) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Revizya topilmadi');
  end if;
  return jsonb_build_object('ok', true, 'egasi', t.kompaniya_id = p_kompaniya_id, 'obyekt_id', t.obyekt_id, 'takliflar', coalesce((
    select jsonb_agg(jsonb_build_object('id', k.id, 'tur', k.tur, 'nom', k.nom, 'birlik', k.birlik, 'hajm', k.hajm, 'izoh', k.izoh, 'holat', k.holat,
             'pto_izoh', k.pto_izoh, 'ozgarish_id', k.ozgarish_id) order by k.id)
      from public.t2_chizma_taklif k where k.revizya_id = p_revizya_id), '[]'::jsonb));
end $$;

-- 10. Qabul qiluvchi (pudratchi PTO / texnadzor): qaror ----------------------------------------------------------------------------
create or replace function public.t2_chizma_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.t2_tomon_taqdim; v_yangi text; r public.t2_chizma_revizya; t public.t2_chizma_toplam;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  if not (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'document.write') or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'quality.decide')) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id and resurs = 'chizma' and qabul_qiluvchi_kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi'); end if;
  if not exists (select 1 from public.t2_tomon_aloqa where id = q.aloqa_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS', 'error', 'Aloqa faol emas'); end if;
  v_yangi := case p_qaror when 'korilmoqda' then 'ko_rilmoqda' when 'qabul' then 'qabul' when 'rad' then 'rad' when 'tuzatish' then 'tuzatish' end;
  if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: korilmoqda | qabul | rad | tuzatish'); end if;
  if q.holat not in ('yuborilgan', 'ko_rilmoqda') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu taqdim bo''yicha qaror allaqachon chiqarilgan'); end if;
  if v_yangi in ('rad', 'tuzatish') and length(btrim(coalesce(p_izoh, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad etish yoki tuzatish so''rash uchun izoh yozing'); end if;
  update public.t2_tomon_taqdim set holat = v_yangi, versiya = versiya + 1, yangilandi = now(),
         qaror_actor_id = case when v_yangi = 'ko_rilmoqda' then qaror_actor_id else p_actor_id end,
         qaror_vaqti = case when v_yangi = 'ko_rilmoqda' then qaror_vaqti else now() end,
         qaror_izoh = case when v_yangi = 'ko_rilmoqda' then qaror_izoh else nullif(btrim(coalesce(p_izoh, '')), '') end
   where id = q.id;
  if v_yangi <> 'ko_rilmoqda' then
    select * into r from public.t2_chizma_revizya where id = q.manba_id;
    select * into t from public.t2_chizma_toplam where id = r.toplam_id;
    perform public._t2_chizma_xabar(p_kompaniya_id, 'chizma.qaror', r.id, t.obyekt_id, q.aloqa_id, p_actor_id, array[t.kompaniya_id],
      array['boss', 'admin', 'rahbar', 'director', 'loyihachi'],
      jsonb_build_object('revizya_id', r.id, 'marka', t.marka, 'varaq', t.varaq, 'revizya', r.revizya, 'qaror', v_yangi));
  end if;
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', v_yangi);
end $$;

-- 11. Pudratchi: revizyani smeta qatori / АОСР ga bog'lash ---------------------------------------------------------------------------------
create or replace function public.t2_chizma_boglash_v1(p_actor_id bigint, p_kompaniya_id bigint, p_toplam_id bigint, p_revizya integer,
  p_obyekt_id bigint, p_qator_id bigint, p_aosr_id bigint, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');
  if num_nonnulls(p_qator_id, p_aosr_id) <> 1 then return jsonb_build_object('ok', false, 'code', 'MANBA', 'error', 'Aynan bittasini tanlang: smeta qatori yoki АОСР'); end if;
  if p_amal not in ('qosh', 'ochir') then return jsonb_build_object('ok', false, 'code', 'AMAL', 'error', 'amal: qosh | ochir'); end if;
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT', 'error', 'Obyekt sizning kompaniyangizniki emas'); end if;
  if p_amal = 'ochir' then
    delete from public.t2_chizma_boglanish where kompaniya_id = p_kompaniya_id and toplam_id = p_toplam_id
       and ((p_qator_id is not null and qator_id = p_qator_id) or (p_aosr_id is not null and aosr_id = p_aosr_id));
    return jsonb_build_object('ok', true, 'amal', 'ochir');
  end if;
  if not public._t2_chizma_oluvchi(p_kompaniya_id, p_toplam_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Chizma varag''i topilmadi'); end if;
  -- Faqat sizga chiqarilgan (ruxsat) revizya ko'rsatilishi mumkin.
  if not exists (select 1 from public.t2_chizma_revizya r join public.t2_tomon_taqdim q on q.manba_jadval = 't2_chizma_revizya' and q.manba_id = r.id
                  where r.toplam_id = p_toplam_id and r.revizya = p_revizya and r.holat = 'ruxsat' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat <> 'qaytarilgan') then
    return jsonb_build_object('ok', false, 'code', 'REVIZYA', 'error', 'Bu revizya sizga chiqarilmagan'); end if;
  if p_qator_id is not null and not exists (select 1 from public.t2_qator where id = p_qator_id and obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'QATOR', 'error', 'Smeta qatori bu obyektda topilmadi'); end if;
  if p_aosr_id is not null and not exists (select 1 from public.t2_aosr where id = p_aosr_id and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'AOSR', 'error', 'АОСР bu obyektda topilmadi'); end if;
  if p_qator_id is not null then
    insert into public.t2_chizma_boglanish (kompaniya_id, toplam_id, obyekt_id, qator_id, revizya, actor_id) values (p_kompaniya_id, p_toplam_id, p_obyekt_id, p_qator_id, p_revizya, p_actor_id)
    on conflict (kompaniya_id, toplam_id, qator_id) where qator_id is not null do update set revizya = excluded.revizya, actor_id = excluded.actor_id, yangilandi = now()
    returning id into v_id;
  else
    insert into public.t2_chizma_boglanish (kompaniya_id, toplam_id, obyekt_id, aosr_id, revizya, actor_id) values (p_kompaniya_id, p_toplam_id, p_obyekt_id, p_aosr_id, p_revizya, p_actor_id)
    on conflict (kompaniya_id, toplam_id, aosr_id) where aosr_id is not null do update set revizya = excluded.revizya, actor_id = excluded.actor_id, yangilandi = now()
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'amal', 'qosh');
end $$;

-- Pudratchi: bog'lanishlar va ularning holati (joriy revizyadan orqada qolganlar = ESKIRGAN). АОСР «loyiha hujjati» matni uchun xom ma'lumot.
create or replace function public.t2_chizma_taasir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  return jsonb_build_object('ok', true, 'boglanishlar', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'toplam_id', b.toplam_id, 'bosqich', t.bosqich, 'marka', t.marka, 'varaq', t.varaq, 'ishlatilgan', b.revizya,
        'joriy', (select max(r.revizya) from public.t2_chizma_revizya r join public.t2_tomon_taqdim q on q.manba_jadval = 't2_chizma_revizya' and q.manba_id = r.id
                   where r.toplam_id = t.id and r.holat = 'ruxsat' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat <> 'qaytarilgan'),
        'qator_id', b.qator_id, 'qator_nom', (select q2.nom from public.t2_qator q2 where q2.id = b.qator_id), 'qator_kod', (select q2.kod from public.t2_qator q2 where q2.id = b.qator_id),
        'aosr_id', b.aosr_id, 'aosr_raqam', (select a.raqam from public.t2_aosr a where a.id = b.aosr_id),
        'aosr_loyiha_hujjati', (select a.loyiha_hujjati from public.t2_aosr a where a.id = b.aosr_id)) order by t.marka, t.varaq, b.id)
      from public.t2_chizma_boglanish b join public.t2_chizma_toplam t on t.id = b.toplam_id
     where b.kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or b.obyekt_id = p_obyekt_id)), '[]'::jsonb));
end $$;

-- 12. Pudratchi PTO: loyihachi taklifini smeta o'zgarishiga aylantirish / rad etish ---------------------------------------------------------
create or replace function public.t2_chizma_taklif_pto_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taklif_id bigint, p_qaror text, p_obyekt_id bigint,
  p_qator_id bigint, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k public.t2_chizma_taklif; r public.t2_chizma_revizya; t public.t2_chizma_toplam; v_tur text; v_amal text; v_res jsonb; v_qator jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');
  select * into k from public.t2_chizma_taklif where id = p_taklif_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taklif topilmadi'); end if;
  select * into r from public.t2_chizma_revizya where id = k.revizya_id;
  select * into t from public.t2_chizma_toplam where id = r.toplam_id;
  if not public._t2_chizma_oluvchi(p_kompaniya_id, t.id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taklif topilmadi'); end if;
  if k.holat <> 'yangi' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu taklif bo''yicha qaror allaqachon chiqarilgan'); end if;
  if p_qaror = 'rad' then
    if length(btrim(coalesce(p_izoh, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad sababini yozing'); end if;
    update public.t2_chizma_taklif set holat = 'rad', pto_kompaniya_id = p_kompaniya_id, pto_actor_id = p_actor_id, pto_vaqti = now(), pto_izoh = btrim(p_izoh) where id = k.id;
    return jsonb_build_object('ok', true, 'id', k.id, 'holat', 'rad');
  elsif p_qaror <> 'ozgarishga' then
    return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: ozgarishga | rad');
  end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID', 'error', 'operation_id kerak'); end if;
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT', 'error', 'Obyekt sizning kompaniyangizniki emas'); end if;
  if k.tur <> 'qoshimcha' and p_qator_id is null then
    return jsonb_build_object('ok', false, 'code', 'QATOR_KERAK', 'error', 'Zamena, hajm o''zgarishi yoki olib tashlash uchun smeta qatorini tanlang (smeta normasi birinchi)'); end if;
  v_tur := case k.tur when 'qoshimcha' then 'qoshimcha_ish' when 'zamena' then 'almashtirish' when 'olib_tashlash' then 'olib_tashlash' else 'hajm_ozgarish' end;
  v_amal := case k.tur when 'qoshimcha' then 'qoshish' when 'zamena' then 'almashtirish' when 'olib_tashlash' then 'olib_tashlash' else 'hajm' end;
  v_qator := jsonb_build_object('qator_id', p_qator_id, 'amal', v_amal, 'yangi_nom', case when k.tur in ('qoshimcha', 'zamena') then k.nom end,
    'yangi_hajm', case when k.tur = 'olib_tashlash' then 0 else k.hajm end, 'birlik', k.birlik, 'izoh', k.izoh);
  v_res := public.t2_smeta_ozgarish_yarat_v1(p_obyekt_id, p_actor_id, v_tur, 'Loyiha o''zgarishi: ' || t.marka || '-' || t.varaq || ' rev.' || r.revizya,
    jsonb_build_array(v_qator), null, p_operation_id, null, null, null,
    'Chizma ' || t.marka || '-' || t.varaq || ' (' || t.bosqich || ') revizya ' || r.revizya || '; taklif #' || k.id);
  if coalesce((v_res->>'ok')::boolean, false) is not true then return v_res; end if;
  update public.t2_chizma_taklif set holat = 'ozgarishga', pto_kompaniya_id = p_kompaniya_id, pto_actor_id = p_actor_id, pto_vaqti = now(),
         pto_izoh = nullif(btrim(coalesce(p_izoh, '')), ''), ozgarish_id = (v_res->>'ozgarish_id')::bigint where id = k.id;
  return jsonb_build_object('ok', true, 'id', k.id, 'holat', 'ozgarishga', 'ozgarish_id', (v_res->>'ozgarish_id')::bigint);
end $$;

-- 13. Fayl yuklab olish (api/hujjat-ol zanjiriga qo'shiladi): egasi yoki taqdim qabul qiluvchisi ----------------------------------------------------
create or replace function public.t2_chizma_fayl_ol_v1(p_actor_id bigint, p_document_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d public.t2_document_registry; v_ok boolean;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_document_id is null or p_document_id <= 0 then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select exists (
    select 1 from public.t2_chizma_revizya r join public.t2_chizma_toplam t on t.id = r.toplam_id
     where r.document_id = p_document_id and r.holat <> 'bekor'
       and (exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.kompaniya_id = t.kompaniya_id and z.holat = 'faol')
            or exists (select 1 from public.t2_tomon_taqdim q join public.t2_tomon_aloqa a on a.id = q.aloqa_id and a.holat = 'faol'
                        join public.t2_azolik z on z.kompaniya_id = q.qabul_qiluvchi_kompaniya_id and z.foydalanuvchi_id = p_actor_id and z.holat = 'faol'
                       where q.manba_jadval = 't2_chizma_revizya' and q.manba_id = r.id and q.holat <> 'qaytarilgan'))) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_FORBIDDEN'); end if;
  select * into d from public.t2_document_registry where id = p_document_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_NOT_FOUND'); end if;
  if d.canonical_storage_status is distinct from 'stored' or d.r2_key is null then return jsonb_build_object('ok', false, 'code', 'CANONICAL_BINARY_MISSING'); end if;
  return jsonb_build_object('ok', true, 'document_id', d.id, 'r2_key', d.r2_key, 'mime_type', d.mime_type, 'original_filename', d.original_filename, 'size_bytes', d.size_bytes, 'sha256', d.sha256);
end $$;

-- 14. Rol uyi «Bugun»: bitta chaqiruvda hamma sanoq (loyihachi VA pudratchi/texnadzor tomoni) ---------------------------------------------------------
create or replace function public.t2_loyihachi_bugun_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select jsonb_build_object('ok', true,
    -- loyihachi tomoni
    'qoralama_revizya', (select count(*) from public.t2_chizma_revizya r join public.t2_chizma_toplam t on t.id = r.toplam_id
                          where t.kompaniya_id = p_kompaniya_id and r.holat = 'qoralama'),
    'qaror_kutmoqda', (select count(*) from public.t2_tomon_taqdim q where q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id and q.resurs = 'chizma' and q.holat in ('yuborilgan', 'ko_rilmoqda')),
    'tuzatish_soralgan', (select count(*) from public.t2_tomon_taqdim q where q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id and q.resurs = 'chizma' and q.holat in ('tuzatish', 'rad')),
    'savol_menga', (select count(*) from public.t2_tomon_murojaat m where m.ijrochi_kompaniya_id = p_kompaniya_id and m.turi = 'savol' and m.holat = 'ochiq'),
    'savol_kechikkan', (select count(*) from public.t2_tomon_murojaat m where m.ijrochi_kompaniya_id = p_kompaniya_id and m.turi = 'savol' and m.holat = 'ochiq' and m.muddat < current_date),
    'remark_ochiq', (select count(*) from public.t2_tomon_murojaat m where m.beruvchi_kompaniya_id = p_kompaniya_id and m.turi = 'mualliflik_remark' and m.holat in ('ochiq', 'bajarildi')),
    'remark_yopishga', (select count(*) from public.t2_tomon_murojaat m where m.beruvchi_kompaniya_id = p_kompaniya_id and m.turi = 'mualliflik_remark' and m.holat = 'bajarildi'),
    'remark_kechikkan', (select count(*) from public.t2_tomon_murojaat m where m.beruvchi_kompaniya_id = p_kompaniya_id and m.turi = 'mualliflik_remark' and m.holat = 'ochiq' and m.muddat < current_date),
    'taklif_kutmoqda', (select count(*) from public.t2_chizma_taklif k join public.t2_chizma_revizya r on r.id = k.revizya_id join public.t2_chizma_toplam t on t.id = r.toplam_id
                         where t.kompaniya_id = p_kompaniya_id and k.holat = 'yangi'),
    -- pudratchi / texnadzor tomoni
    'kelgan_yangi', (select count(*) from public.t2_tomon_taqdim q where q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.resurs = 'chizma' and q.holat = 'yuborilgan'),
    'eskirgan_boglanish', (select count(*) from public.t2_chizma_boglanish b where b.kompaniya_id = p_kompaniya_id and b.revizya < coalesce((
        select max(r.revizya) from public.t2_chizma_revizya r join public.t2_tomon_taqdim q on q.manba_jadval = 't2_chizma_revizya' and q.manba_id = r.id
         where r.toplam_id = b.toplam_id and r.holat = 'ruxsat' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat <> 'qaytarilgan'), b.revizya)),
    'taklif_yangi_menga', (select count(*) from public.t2_chizma_taklif k join public.t2_chizma_revizya r on r.id = k.revizya_id
                            where k.holat = 'yangi' and public._t2_chizma_oluvchi(p_kompaniya_id, r.toplam_id))
  ) into v;
  return v;
end $$;

-- 15. Ruxsatlar: faqat service_role (shlyuz functions/api/loyihachi.ts) ------------------------------------------------------------------------------
do $g$
declare f text;
begin
  foreach f in array array[
    '_t2_chizma_obyekt_ok(bigint,public.t2_tomon_aloqa,bigint)', '_t2_chizma_oluvchi(bigint,bigint)',
    '_t2_chizma_xabar(bigint,text,bigint,bigint,bigint,bigint,bigint[],text[],jsonb)',
    't2_chizma_toplam_saqla_v1(bigint,bigint,bigint,bigint,text,text,text,text,uuid)',
    't2_chizma_revizya_yarat_v1(bigint,bigint,bigint,bigint,text,text,uuid)',
    't2_chizma_revizya_tahrir_v1(bigint,bigint,bigint,bigint,text,text)',
    't2_chizma_taklif_yoz_v1(bigint,bigint,bigint,text,text,text,numeric,text)',
    't2_chizma_chiqar_v1(bigint,bigint,bigint,bigint[],text)', 't2_chizma_bekor_v1(bigint,bigint,bigint,text)',
    't2_chizma_royxat_v1(bigint,bigint,bigint)', 't2_chizma_taklif_royxat_v1(bigint,bigint,bigint)',
    't2_chizma_qaror_v1(bigint,bigint,bigint,text,text)', 't2_chizma_boglash_v1(bigint,bigint,bigint,integer,bigint,bigint,bigint,text)',
    't2_chizma_taasir_v1(bigint,bigint,bigint)', 't2_chizma_taklif_pto_v1(bigint,bigint,bigint,text,bigint,bigint,text,uuid)',
    't2_chizma_fayl_ol_v1(bigint,bigint)', 't2_loyihachi_bugun_v1(bigint,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;
