-- T2-F2-QOL-OLIB-001 — F2 qoralamadan ONGLI olib tashlangan qatorlar «yangilash» da qayta paydo bo'lmasin (egasi 2026-11-18).
--
-- Muammo: f2_qoralama_tahrir olib_tashla bilan olib tashlangan avtomatik resurs (rs), ota ish (BL) qoralamada qolsa, F2 tayyorlash
-- «yangilash» / F2StornoBlokTahrir / Ish varag'i uni ish hajmi × norma bilan QAYTA qo'shardi (qator yo'q — qo'lda belgi ham yo'q).
-- Yechim (20270113800000 dagi raw_snapshot.qolTahrir ning davomi, yangi ustun/RPC o'zgarishi yo'q): OTA ISH qatorining
-- raw_snapshot.qolTahrir.olib = [olib tashlangan resurs qator_id lari] (tombstone). Klientlar (F2 sahifa, MCP, Jarvis) o'qiydi va saqlaydi.
-- Ota ish o'zi olib tashlangan bo'lsa — uning resurslari ham chiqmaydi (ish hajmisiz avtomatik resurs yo'q), tombstone kerak emas.
--
-- Bu migratsiya: (1) ichki yordamchi `_t2_f2_qol_olib_belgila_v1`; (2) 2026-11-18 mcp.f2_qoralama_tahrir olib_tashla yozuvlaridan
-- (t2_audit_log) backfill — faqat qoralama aktlar, ota ish aktda bor va resurs aktda YO'Q bo'lganda. Idempotent (birlashtiriladi).

-- versiya: texnik — t2_qator faqat akt qatorining smeta ma'lumotini (tur/ota) o'qish uchun, versiya tanlovi akt qatori orqali.
create or replace function public._t2_f2_qol_olib_belgila_v1(p_akt_id bigint, p_olib jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n integer := 0;
begin
  if p_olib is null or jsonb_typeof(p_olib) <> 'array' then return 0; end if;
  with z as (
    select q.ota_id, array_agg(distinct q.id order by q.id) as idlar
      from jsonb_array_elements_text(p_olib) e
      join public.t2_qator q on q.id = e.value::bigint and q.ota_id is not null and q.tur in ('rs', 'mat', 'ob')
     where not exists (select 1 from public.t2_akt_qator x where x.akt_id = p_akt_id and x.qator_id = q.id)
     group by q.ota_id
  ), u as (
    update public.t2_akt_qator aq
       set raw_snapshot = coalesce(aq.raw_snapshot, '{}'::jsonb) || jsonb_build_object('qolTahrir',
             coalesce(aq.raw_snapshot->'qolTahrir', '{}'::jsonb) || jsonb_build_object('olib',
               (select coalesce(jsonb_agg(distinct v order by v), '[]'::jsonb)
                  from (select jsonb_array_elements(coalesce(aq.raw_snapshot->'qolTahrir'->'olib', '[]'::jsonb)) as v
                        union select to_jsonb(i) from unnest(z.idlar) i) s)))
      from z
      join public.t2_akt a on a.id = p_akt_id and a.tur = 'f2' and a.holat = 'qoralama'
     where aq.akt_id = p_akt_id and aq.qator_id = z.ota_id
       and coalesce(aq.raw_snapshot->>'source', '') <> 'storno' and aq.manba_akt_qator_id is null
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

revoke all on function public._t2_f2_qol_olib_belgila_v1(bigint, jsonb) from public, anon, authenticated;
grant execute on function public._t2_f2_qol_olib_belgila_v1(bigint, jsonb) to service_role;

comment on function public._t2_f2_qol_olib_belgila_v1(bigint, jsonb) is
  'F2 qoralama: olib tashlangan resurslarni ota ish qatoriga raw_snapshot.qolTahrir.olib (tombstone) sifatida yozadi — «yangilash» qayta qo''shmasin. Faqat qoralama; ichki. versiya: texnik (t2_qator faqat akt qatorining tur/ota ma''lumoti uchun).';

do $$
declare r record; v_args jsonb; v_n integer; v_jami integer := 0; v_audit integer := 0;
begin
  for r in
    select l.id, l.tafsilot from public.t2_audit_log l
     where l.amal_turi = 'mcp.f2_qoralama_tahrir' and l.yaratilgan_vaqt >= timestamptz '2026-11-18 00:00:00+00'
       and l.tafsilot ~ '^\s*\{' order by l.id
  loop
    begin
      v_args := (r.tafsilot::jsonb)->'args';
      if v_args is null or coalesce(v_args->>'dry_run', 'false') = 'true' or nullif(v_args->>'akt_id', '') is null
         or jsonb_typeof(v_args->'olib_tashla') is distinct from 'array' then continue; end if;
      v_n := public._t2_f2_qol_olib_belgila_v1((v_args->>'akt_id')::bigint, v_args->'olib_tashla');
      v_jami := v_jami + coalesce(v_n, 0); v_audit := v_audit + 1;
    exception when others then
      raise notice 'olib backfill: audit % o''tkazib yuborildi (%)', r.id, sqlerrm;
    end;
  end loop;
  raise notice 'olib backfill: % audit yozuvi, % ota qatorga tombstone yozildi', v_audit, v_jami;
end $$;
