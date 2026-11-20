-- 20270119000501_t2_hujjat_yangila_turlar_v1
-- «Hujjat doim tayyor» davomi: F-3 (forma3), Nakopitelniy, M-29, Slichitelniy, Ostatka ham manba o'zgarganda fonda qayta yasaladi.
-- Navbat jadvali va debounce/retry - 20270119000001 dagi (bu yerda yangi jadval YO'Q); faqat yangi belgilash funksiyalari va triggerlar.
-- manba_id kodlash (unique (tur, manba_id)):
--   forma3 -> t2_forma3.id;  slichitelniy / ostatka -> obyekt_id;  nakopitelniy / m29 -> obyekt_id * 1000000 + YYYYMM (oy).
-- Nakopitelniy/M-29: faqat 'tasdiqlangan' F-2 oylari (sayt/hujjat-yarat qoidasi); Slichitelniy/Ostatka: bekor/taxminiy bo'lmagan har F-2.
-- Trigger HECH QACHON biznes yozuvni yiqitmaydi. Token yechilmaydi.
-- Applied: YO'Q (L0 qo'llaydi: avval ROLLBACK sinov; fayl ichida begin/commit yo'q).

-- Bitta F-2 o'zgarishi (kompaniya, obyekt, oy, holat) -> tegishli oylik/obyekt hujjatlari navbatga.
create or replace function public._t2_hujjat_yangila_oylik_belgila_v1(p_kompaniya bigint, p_obyekt bigint, p_oy date, p_holat text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_kompaniya is null or p_obyekt is null or p_holat = 'bekor' then return; end if;
  perform public._t2_hujjat_yangila_belgila_v1(p_kompaniya, 'slichitelniy', p_obyekt, p_obyekt);
  perform public._t2_hujjat_yangila_belgila_v1(p_kompaniya, 'ostatka', p_obyekt, p_obyekt);
  if p_holat = 'tasdiqlangan' and p_oy is not null then
    perform public._t2_hujjat_yangila_belgila_v1(p_kompaniya, 'nakopitelniy', p_obyekt * 1000000 + to_char(p_oy, 'YYYYMM')::bigint, p_obyekt);
    perform public._t2_hujjat_yangila_belgila_v1(p_kompaniya, 'm29', p_obyekt * 1000000 + to_char(p_oy, 'YYYYMM')::bigint, p_obyekt);
  end if;
exception when others then null;
end $fn$;

-- Ko'p akt (statement trigger): taxminiy F-2 lar o'tkazib yuboriladi.
create or replace function public._t2_hujjat_yangila_oylik_toplam_v1(p_idlar bigint[])
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare r record;
begin
  for r in select distinct a.kompaniya_id, a.obyekt_id, a.oy, a.holat from public.t2_akt a
            where a.id = any(p_idlar) and a.tur = 'f2' and not public._t2_f2_taxminiy_v1(a.raqam, a.izoh) loop
    perform public._t2_hujjat_yangila_oylik_belgila_v1(r.kompaniya_id, r.obyekt_id, r.oy, r.holat);
  end loop;
exception when others then null;
end $fn$;

create or replace function public.t2_akt_hujjat_yangila_oylik_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if new.tur = 'f2' and not public._t2_f2_taxminiy_v1(new.raqam, new.izoh) then
    perform public._t2_hujjat_yangila_oylik_belgila_v1(new.kompaniya_id, new.obyekt_id, new.oy, new.holat);
  end if;
  return null;
exception when others then return null;
end $fn$;
drop trigger if exists t2_akt_hujjat_yangila_oylik_trg on public.t2_akt;
create trigger t2_akt_hujjat_yangila_oylik_trg after insert or update of holat, lifecycle_status, oy, hujjat_jami, versiya, shartnoma_id, revision_id
  on public.t2_akt for each row execute function public.t2_akt_hujjat_yangila_oylik_trg();

create or replace function public.t2_akt_qator_hujjat_yangila_oylik_ins_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin perform public._t2_hujjat_yangila_oylik_toplam_v1(array(select distinct akt_id from nt)); return null; exception when others then return null; end $fn$;
create or replace function public.t2_akt_qator_hujjat_yangila_oylik_upd_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin perform public._t2_hujjat_yangila_oylik_toplam_v1(array(select distinct akt_id from nt)); return null; exception when others then return null; end $fn$;
create or replace function public.t2_akt_qator_hujjat_yangila_oylik_del_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin perform public._t2_hujjat_yangila_oylik_toplam_v1(array(select distinct akt_id from ot)); return null; exception when others then return null; end $fn$;
drop trigger if exists t2_akt_qator_hujjat_yangila_oylik_ins_trg on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_hujjat_yangila_oylik_upd_trg on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_hujjat_yangila_oylik_del_trg on public.t2_akt_qator;
create trigger t2_akt_qator_hujjat_yangila_oylik_ins_trg after insert on public.t2_akt_qator referencing new table as nt for each statement execute function public.t2_akt_qator_hujjat_yangila_oylik_ins_trg();
create trigger t2_akt_qator_hujjat_yangila_oylik_upd_trg after update on public.t2_akt_qator referencing new table as nt for each statement execute function public.t2_akt_qator_hujjat_yangila_oylik_upd_trg();
create trigger t2_akt_qator_hujjat_yangila_oylik_del_trg after delete on public.t2_akt_qator referencing old table as ot for each statement execute function public.t2_akt_qator_hujjat_yangila_oylik_del_trg();

-- F-3 (t2_forma3): yaratish / holat / davr / raqam / shartnoma / summa o'zgarishi.
create or replace function public.t2_forma3_hujjat_yangila_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if new.holat <> 'bekor' then perform public._t2_hujjat_yangila_belgila_v1(new.kompaniya_id, 'forma3', new.id, new.obyekt_id); end if;
  return null;
exception when others then return null;
end $fn$;
drop trigger if exists t2_forma3_hujjat_yangila_trg on public.t2_forma3;
create trigger t2_forma3_hujjat_yangila_trg after insert or update of holat, davr_boshi, davr_oxiri, raqam, shartnoma_id, obyekt_id, bajarilgan_f2_summa, qoida_holat, versiya
  on public.t2_forma3 for each row execute function public.t2_forma3_hujjat_yangila_trg();

-- Qo'lda belgilash endi barcha qo'llab-quvvatlanadigan turlar uchun (f2: akt id; forma3: forma3 id; slichitelniy/ostatka: obyekt id; nakopitelniy/m29: obyekt*1e6+YYYYMM).
create or replace function public.t2_hujjat_yangila_belgila_v1(p_kompaniya bigint, p_tur text, p_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_tur = 'f2' then
    perform public._t2_hujjat_yangila_f2_toplam_v1(array(select a.id from public.t2_akt a where a.id = any(p_idlar) and a.kompaniya_id = p_kompaniya));
  elsif p_tur in ('forma3', 'slichitelniy', 'ostatka', 'nakopitelniy', 'm29') then
    perform public._t2_hujjat_yangila_belgila_v1(p_kompaniya, p_tur, i, case when p_tur in ('nakopitelniy', 'm29') then i / 1000000 when p_tur in ('slichitelniy', 'ostatka') then i else null end)
      from unnest(p_idlar) i;
  else return jsonb_build_object('ok', false, 'code', 'TUR_QOLLANMAYDI');
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

do $g$ declare f text; begin
  foreach f in array array[
    'public._t2_hujjat_yangila_oylik_belgila_v1(bigint, bigint, date, text)', 'public._t2_hujjat_yangila_oylik_toplam_v1(bigint[])',
    'public.t2_hujjat_yangila_belgila_v1(bigint, text, bigint[])']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $g$;