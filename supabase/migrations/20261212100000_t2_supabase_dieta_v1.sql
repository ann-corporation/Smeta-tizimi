-- 20261212100000 — SUPABASE DIETA (free plan 500 MB; prod 455 MB). Dizayn: docs/architecture/SUPABASE_DIETA_2026-11.md
--
-- Faqat KODDA isbotlangan xavfsiz qadamlar:
--  1) t2_qator_paket_manba_idx: 140k qatorning 16k tasida smeta_paket_manba_id bor; qolgani NULL. To'liq indeks
--     (6,7 MB) -> partial `where smeta_paket_manba_id is not null` (~0,8 MB). FK tekshiruvi va tenglik so'rovlari
--     faqat NOT NULL qiymatga qaraydi — xatti-harakat o'zgarmaydi.
--  2) t2_qator_manba_idx (manba_id, xom_qator): prodda ikkala ustun 140k qatorning HAMMASIDA NULL (o'lchov 2026-11-11);
--     indeks (NULL,NULL) juftlarini saqlayapti (2,2 MB). Partial `where manba_id is not null` — bo'sh, kerak bo'lsa ishlaydi.
--  3) t2_onboarding_command_log: f2_qoralama_yangila javobiga eski_qatorlar (har chaqiriqda butun F2 qoralama
--     qatorlari nusxasi, 10 MB toast) yoziladi. Takror chaqiriq uni O'QIMAYDI (20261106530000 / 20261203001500:
--     `v_prev - '_request' - 'eski_qatorlar'`); boshqa o'quvchi yo'q. 7 kundan eski yozuvlardan faqat shu kalit olinadi;
--     operation_id, actor_id, command, created_at, qolgan natija (ok/holat/akt_id/versiya/...) SAQLANADI.
--     Funksiya qo'lda ham ishlatiladi (dry_run sukut bo'yicha true).
-- TEGILMAYDI: t2_qator qatorlari, t2_qator_muhr (const, insert-only), t2_smeta_revision, t2_akt_qator, FTS indeks
-- (t2_ish_tajriba_qidir_v1 / smeta-ai.ts ishlatadi), FK indekslari, t2_signal / draft jadvallari (barchasi < 30 kunlik).
begin;

-- 1) paket_manba partial
drop index if exists public.t2_qator_paket_manba_idx;
create index t2_qator_paket_manba_idx on public.t2_qator (smeta_paket_manba_id, id) where smeta_paket_manba_id is not null;

-- 2) manba partial
drop index if exists public.t2_qator_manba_idx;
create index t2_qator_manba_idx on public.t2_qator (manba_id, xom_qator) where manba_id is not null;

-- 3) idempotentlik daftari: eski_qatorlar ixchamlash
create or replace function public.t2_dieta_log_kompakt_v1(p_kun integer default 7, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n bigint; v_bayt bigint;
begin
  if p_kun is null or p_kun < 1 then
    raise exception 'T2_DIETA: p_kun >= 1 bo''lishi shart';
  end if;
  select count(*), coalesce(sum(pg_column_size(natija->'eski_qatorlar')), 0) into v_n, v_bayt
    from public.t2_onboarding_command_log
   where command = 'f2_qoralama_yangila' and natija ? 'eski_qatorlar'
     and created_at < now() - make_interval(days => p_kun);
  if not p_dry_run then
    update public.t2_onboarding_command_log
       set natija = (natija - 'eski_qatorlar') || jsonb_build_object('_kompakt', true)
     where command = 'f2_qoralama_yangila' and natija ? 'eski_qatorlar'
       and created_at < now() - make_interval(days => p_kun);
  end if;
  return jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'kun', p_kun, 'qator', v_n, 'bayt_taxmin', v_bayt);
end $$;
revoke all on function public.t2_dieta_log_kompakt_v1(integer, boolean) from public, anon, authenticated;
grant execute on function public.t2_dieta_log_kompakt_v1(integer, boolean) to service_role;
comment on function public.t2_dieta_log_kompakt_v1(integer, boolean) is
  'DIETA: f2_qoralama_yangila idempotentlik yozuvlaridan eski_qatorlar (replay o''qimaydi) ni N kundan keyin olib tashlaydi. Boshqa kalitlar saqlanadi.';

select public.t2_dieta_log_kompakt_v1(7, false);

commit;
-- ESLATMA: UPDATE joyni darhol qaytarmaydi. Keyin (tranzaksiyadan tashqarida, bir marta):
--   VACUUM (FULL, ANALYZE) public.t2_onboarding_command_log;   -- ~10 MB, sekundlar, qisqa qulf
