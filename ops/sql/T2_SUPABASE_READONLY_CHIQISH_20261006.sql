-- ═══════════════════════════════════════════════════════════════════════════
-- T2 Supabase — 500 MB chegarasiga qaytish (2026-10-06, Claude). Egasi yurgizadi.
-- Supabase Dashboard → SQL Editor. Har QADAMNI ALOHIDA yurgizing (Run), ketma-ket.
--
-- Natija: baza ~715 MB → ~400 MB atrofida. TIZIM_02 ma'lumotiga TEGILMAYDI.
--   1-qadam: VACUUM FULL — ma'lumot o'chirmaydi, faqat bo'sh joyni qaytaradi
--            (narx katalogi jadvali: haqiqiy ma'lumot ~99 MB, fayl 516 MB).
--   2-qadam: TIZIM_01 eski ko'zgu jadvallari (egasi: "tizim1 ga tegishli hech narsa kerak emas")
--            — oxirgi yozuv 2026-08-19, 6 tasi bo'sh, jami ~32 MB. TIZIM_02 ularni ishlatmaydi.
-- Narx katalogi qatorlarini o'chirish bu yerda YO'Q: unga dalil (ON DELETE CASCADE!) va protokol
-- havolalari bor — avval snapshot migratsiyasi kerak; uni Claude yozish huquqi bilan bajaradi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0-qadam (ixtiyoriy): hozirgi hajm ──
select pg_size_pretty(pg_database_size(current_database())) as baza;

-- ── 1-qadam: bo'sh joyni qaytarish (ALOHIDA yurgizing; 1–3 daqiqa) ──
-- Bajarilish vaqtida narx katalogi qidiruvi/narx takliflari kutib turadi. Ma'lumot o'zgarmaydi.
-- Agar "cannot execute ... in a read-only transaction" chiqsa, avval shu qatorni yurgizing:
--   set session characteristics as transaction read write;
vacuum (full, analyze) public.t2_narx_manba_qator;

-- ── 1b-qadam (ixtiyoriy, har biri soniyalar): TIZIM_02 jadvallaridagi shishishni siqish ──
vacuum (full, analyze) public.t2_qator;
vacuum (full, analyze) public.t2_ozgarish;

-- ── 2-qadam: TIZIM_01 eski jadvallarini o'chirish (bitta tranzaksiya) ──
begin;
  -- Himoya: faqat kutilgan eski jadvallar va ularga TIZIM_02 dan FK yo'qligi tekshiriladi.
  do $$
  declare v int;
  begin
    select count(*) into v from pg_constraint c
     where c.contype = 'f'
       and c.confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname in
             ('akt','holat','obyektlar','companies','oylik_f2','akt_ish','audit_log','profiles','kontragentlar','qoshimcha_ishlar',
              'anomaliya','tolovlar','shartnoma','system_config','viborka_nazorat'))
       and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 't2\_%');
    if v > 0 then raise exception 'TO''XTADI: TIZIM_02 jadvali eski jadvalga bog''langan (% ta FK)', v; end if;
    -- Eski jadvallarga bog'liq siyosat/view/trigger faqat eski jadvallarning o'zida bo'lishi kerak.
    select count(*) into v from pg_depend d
      left join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
      left join pg_rewrite rw on d.classid = 'pg_rewrite'::regclass and rw.oid = d.objid
      left join pg_trigger tg on d.classid = 'pg_trigger'::regclass and tg.oid = d.objid
     where d.refobjid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname in
             ('akt','holat','obyektlar','companies','oylik_f2','akt_ish','audit_log','profiles','kontragentlar','qoshimcha_ishlar',
              'anomaliya','tolovlar','shartnoma','system_config','viborka_nazorat'))
       and coalesce(pol.polrelid, rw.ev_class, tg.tgrelid) is not null
       and coalesce(pol.polrelid, rw.ev_class, tg.tgrelid) not in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname in
             ('akt','holat','obyektlar','companies','oylik_f2','akt_ish','audit_log','profiles','kontragentlar','qoshimcha_ishlar',
              'anomaliya','tolovlar','shartnoma','system_config','viborka_nazorat'));
    if v > 0 then raise exception 'TO''XTADI: eski jadvalga boshqa jadval siyosati/view/trigger bog''langan (% ta)', v; end if;
  end $$;
  -- Eski jadvallar orasidagi RLS siyosatlari (companies va audit_log siyosatlari profiles ga tayanadi).
  drop policy if exists "Users can view their own company" on public.companies;
  drop policy if exists "Admins can view audit logs" on public.audit_log;
  drop table if exists public.akt_ish;
  drop table if exists public.akt;
  drop table if exists public.holat;
  drop table if exists public.oylik_f2;
  drop table if exists public.obyektlar;
  drop table if exists public.audit_log;          -- eski (TIZIM_01); TIZIM_02 auditi t2_audit_log da qoladi
  drop table if exists public.profiles;
  drop table if exists public.kontragentlar;      -- TIZIM_02: t2_kontragent qoladi
  drop table if exists public.qoshimcha_ishlar;   -- TIZIM_02: t2_qoshimcha_ish qoladi
  drop table if exists public.companies;          -- TIZIM_02: t2_kompaniya qoladi
  drop table if exists public.anomaliya;
  drop table if exists public.tolovlar;           -- TIZIM_02: t2_tolov qoladi
  drop table if exists public.shartnoma;          -- TIZIM_02: t2_shartnoma qoladi
  drop table if exists public.system_config;
  drop table if exists public.viborka_nazorat;    -- TIZIM_02: t2_viborka qoladi
  drop function if exists public.process_audit();
commit;

-- ── 3-qadam: tekshiruv ──
select pg_size_pretty(pg_database_size(current_database())) as baza,
       pg_size_pretty(pg_total_relation_size('public.t2_narx_manba_qator')) as narx_katalogi,
       (select count(*) from public.t2_narx_manba_qator) as katalog_qatorlari,   -- 213 691 (o'zgarmagan bo'lishi shart)
       (select count(*) from public.t2_qator) as smeta_qatorlari;
