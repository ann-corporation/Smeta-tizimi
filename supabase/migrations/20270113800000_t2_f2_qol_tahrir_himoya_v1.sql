-- T2-F2-QOL-HIMOYA-001 — F2 qoralamadagi QO'LDA tahrirlar «yangilash» da yo'qolmasin (egasi 2026-11-18).
--
-- Muammo: F2 tayyorlash sahifasi qoralamani qayta yuklab/yangilaganda avtomatik resurs (rs) hajmini ish hajmi × SMETA normasidan
-- qayta hisoblaydi (lib/f2-akt-kiritma: avtomatik resurs kiritmaga tushmaydi) — MCP/Jarvis `f2_qoralama_tahrir` bilan qo'lda yozilgan
-- hajm (masalan g'isht 1,5 ≠ norma) smeta qiymatiga qaytib ketardi. Narx faqat taklif narxidan farq qilsa saqlanardi.
-- Server tomoni (t2_f2_qoralama_yangila_v1) qatorlarni FAQAT mijoz bergan yuk bilan almashtiradi va raw_snapshot ni aynan saqlaydi —
-- shuning uchun belgi YANGI USTUN EMAS, mavjud `t2_akt_qator.raw_snapshot.qolTahrir` ({hajm?: true, narx?: true, norma?: n}) da turadi:
-- RPC imzosi/jadval sxemasi o'zgarmaydi (dublikat/parallel mexanizm yo'q). Klient (F2 sahifa, MCP, Jarvis) belgini o'qiydi va saqlaydi.
-- Asl smeta (t2_qator) O'ZGARMAYDI.
--
-- Bu migratsiya: (1) ichki yordamchi — audit/payload bo'yicha belgi qo'yadi; (2) 2026-11-18 dagi mcp.f2_qoralama_tahrir yozuvlaridan
-- (t2_audit_log) bugungi qo'lda qatorlarga belgini backfill qiladi. Faqat qoralama F2 qatorlari (tasdiqlangan muzlagan, tegilmaydi).
-- Qayta ishga tushirish xavfsiz (idempotent: belgi birlashtiriladi).
-- versiya: texnik — t2_qator faqat akt qatorining smeta ma'lumotini (tur/ota/norma) o'qish uchun, versiya tanlovi akt qatori orqali.

create or replace function public._t2_f2_qol_belgila_v1(p_akt_id bigint, p_ozgartir jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n integer := 0;
begin
  if p_ozgartir is null or jsonb_typeof(p_ozgartir) <> 'array' then return 0; end if;
  with z as (
    select (e->>'qator_id')::bigint as qator_id,
           (e ? 'hajm') as hajm_ozgardi,
           (e ? 'narx') as narx_ozgardi
      from jsonb_array_elements(p_ozgartir) e
     where nullif(e->>'qator_id', '') is not null
  ), u as (
    update public.t2_akt_qator aq
       set raw_snapshot = coalesce(aq.raw_snapshot, '{}'::jsonb) || jsonb_build_object('qolTahrir',
             coalesce(aq.raw_snapshot->'qolTahrir', '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
                  'hajm', case when z.hajm_ozgardi then true end,
                  'narx', case when z.narx_ozgardi and aq.narx is not null then true end,
                  -- norma nisbati = resurs hajmi / ota ish hajmi (shu aktdagi); ota aktda yo'q bo'lsa — yozilmaydi (klient aktdan hisoblaydi)
                  'norma', case when z.hajm_ozgardi and nr.nisbat is not null then nr.nisbat end)))
      from z
      join public.t2_akt a on a.id = p_akt_id and a.tur = 'f2' and a.holat = 'qoralama'
      join public.t2_qator q on q.id = z.qator_id
      left join lateral (
        select round(aq2.hajm / nullif(pa.hajm, 0), 9) as nisbat
          from public.t2_akt_qator pa, public.t2_akt_qator aq2
         where q.ota_id is not null and pa.akt_id = p_akt_id and pa.qator_id = q.ota_id
           and aq2.akt_id = p_akt_id and aq2.qator_id = q.id
         limit 1) nr on true
     where aq.akt_id = p_akt_id and aq.qator_id = z.qator_id
       and q.tur in ('rs', 'mat', 'ob', 'bl')
       and (z.hajm_ozgardi or (z.narx_ozgardi and aq.narx is not null))
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

revoke all on function public._t2_f2_qol_belgila_v1(bigint, jsonb) from public, anon, authenticated;
grant execute on function public._t2_f2_qol_belgila_v1(bigint, jsonb) to service_role;

comment on function public._t2_f2_qol_belgila_v1(bigint, jsonb) is
  'F2 qoralama qatorlariga raw_snapshot.qolTahrir belgisi (qo''lda hajm/narx/norma nisbati) — «yangilash» smeta normasiga qaytarmasin. Faqat qoralama; ichki. versiya: texnik (t2_qator faqat akt qatorining tur/ota ma''lumoti uchun).';

-- Backfill: 2026-11-18 mcp.f2_qoralama_tahrir (real, dry_run emas) yozuvlari → bugungi qo'lda qatorlar.
do $$
declare r record; v_args jsonb; v_jami integer := 0; v_akt_soni integer := 0; v_n integer;
begin
  for r in
    select l.id, l.tafsilot from public.t2_audit_log l
     where l.amal_turi = 'mcp.f2_qoralama_tahrir' and l.yaratilgan_vaqt >= timestamptz '2026-11-18 00:00:00+00'
       and l.tafsilot ~ '^\s*\{' order by l.id
  loop
    begin
      v_args := (r.tafsilot::jsonb)->'args';
      if v_args is null or coalesce(v_args->>'dry_run', 'false') = 'true' or nullif(v_args->>'akt_id', '') is null then continue; end if;
      v_n := public._t2_f2_qol_belgila_v1((v_args->>'akt_id')::bigint, coalesce(v_args->'ozgartir', '[]'::jsonb));
      v_jami := v_jami + coalesce(v_n, 0); v_akt_soni := v_akt_soni + 1;
    exception when others then
      raise notice 'qol backfill: audit % o''tkazib yuborildi (%)', r.id, sqlerrm;
    end;
  end loop;
  raise notice 'qol backfill: % audit yozuvi, % qatorga belgi qo''yildi', v_akt_soni, v_jami;
end $$;
