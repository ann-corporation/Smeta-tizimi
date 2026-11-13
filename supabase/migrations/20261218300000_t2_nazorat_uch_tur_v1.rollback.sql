-- Rollback: 20261218300000_t2_nazorat_uch_tur_v1. Vakolat/qaror ma'lumotlari (yangi jadvallar) o'chadi; eski funksiyalar tiklanadi.
do $r$
declare d text; n text;
begin
  d := pg_get_functiondef('public.t2_tomon_taqdimlar_v1(bigint,bigint,text,text,bigint,integer)'::regprocedure);
  n := replace(d, '(p_yonalish = ''kelgan'' and (q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id or public._t2_nazorat_vakil_korish(p_kompaniya_id, q.qabul_qiluvchi_kompaniya_id, q.obyekt_id, q.resurs)))', '(p_yonalish = ''kelgan'' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)');
  if n <> d then execute n; end if;
  d := pg_get_functiondef('public.t2_tomon_taqdim_tafsilot_v1(bigint,bigint,bigint)'::regprocedure);
  n := replace(d, ' and not public._t2_nazorat_vakil_korish(p_kompaniya_id, q.qabul_qiluvchi_kompaniya_id, q.obyekt_id, q.resurs)) then', ') then');
  if n <> d then execute n; end if;
  d := pg_get_functiondef('public.t2_tomon_taqdim_yarat_v1(bigint,bigint,bigint,text,bigint,text,uuid)'::regprocedure);
  n := regexp_replace(d, 'if coalesce\(\(select s\.ichki_majburiy.*?end if;\s*select \* into a from public\.t2_tomon_aloqa where id = p_aloqa_id;', 'select * into a from public.t2_tomon_aloqa where id = p_aloqa_id;', 's');
  if n <> d then execute n; end if;
end $r$;

drop trigger if exists t2_nazorat_taqdim_ichki_trg on public.t2_tomon_taqdim;
drop trigger if exists t2_nazorat_taqdim_vakil_outbox_trg on public.t2_tomon_taqdim;
drop function if exists public._t2_nazorat_taqdim_ichki_trg();
drop function if exists public._t2_nazorat_taqdim_vakil_outbox();

-- eski t2_tomon_qaror_v1
create or replace function public.t2_tomon_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare q public.t2_tomon_taqdim; v_yangi text; v_n integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'qaror');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id for update;
  if not found or q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Taqdim topilmadi'); end if;
  if not exists (select 1 from public.t2_tomon_aloqa where id = q.aloqa_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ALOQA_FAOL_EMAS', 'error', 'Aloqa faol emas'); end if;
  v_yangi := case p_qaror when 'korilmoqda' then 'ko_rilmoqda' when 'qabul' then 'qabul' when 'rad' then 'rad' when 'tuzatish' then 'tuzatish' end;
  if v_yangi is null then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI', 'error', 'qaror: korilmoqda | qabul | rad | tuzatish'); end if;
  if q.holat not in ('yuborilgan','ko_rilmoqda') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu taqdim bo''yicha qaror allaqachon chiqarilgan'); end if;
  if v_yangi in ('rad','tuzatish') and length(btrim(coalesce(p_izoh, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'IZOH_KERAK', 'error', 'Rad etish yoki tuzatish so''rash uchun izoh yozing'); end if;
  if q.resurs = 'aosr' and v_yangi = 'qabul' then
    if public._t2_tomon_aosr_xesh(q.manba_id) is distinct from q.snapshot_xesh then return jsonb_build_object('ok', false, 'code', 'BUTUNLIK', 'error', 'Yuborilgandan keyin akt o''zgargan — yuboruvchidan qayta yuborishni so''rang (tuzatish)'); end if;
    perform set_config('t2.aosr_tasdiq', '1', true);
    update public.t2_aosr set holat = 'tasdiqlangan', tasdiq_taqdim_id = q.id, tasdiq_vaqti = now(), versiya = versiya + 1, yangilandi = now() where id = q.manba_id and holat = 'yangi';
    get diagnostics v_n = row_count;
    perform set_config('t2.aosr_tasdiq', '', true);
    if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'AKT_HOLAT', 'error', 'Akt endi qoralama emas (o''zgargan yoki bekor qilingan) — taqdimni rad eting yoki qayta yuborishni so''rang'); end if;
  end if;
  update public.t2_tomon_taqdim set holat = v_yangi, versiya = versiya + 1, yangilandi = now(),
         qaror_actor_id = case when v_yangi = 'ko_rilmoqda' then qaror_actor_id else p_actor_id end,
         qaror_vaqti = case when v_yangi = 'ko_rilmoqda' then qaror_vaqti else now() end,
         qaror_izoh = case when v_yangi = 'ko_rilmoqda' then qaror_izoh else nullif(btrim(coalesce(p_izoh, '')), '') end
   where id = q.id;
  perform public._t2_tomon_hodisa_yoz(q.aloqa_id, q.id, p_kompaniya_id, p_actor_id, case when v_yangi = 'ko_rilmoqda' then 'korilmoqda' else 'qaror' end, p_izoh, jsonb_build_object('qaror', v_yangi));
  return jsonb_build_object('ok', true, 'id', q.id, 'holat', v_yangi);
end $fn$;

-- eski ruxsat_bor (togri tanasi)
create or replace function public.t2_tomon_ruxsat_bor(p_oluvchi bigint, p_beruvchi bigint, p_resurs text, p_amal text, p_obyekt_id bigint)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select public._t2_tomon_ruxsat_togri(p_oluvchi, p_beruvchi, p_resurs, p_amal, p_obyekt_id)
$f$;
-- (_t2_tomon_ruxsat_togri qoldiriladi: ruxsat_bor tanasi shunga tayanadi)

drop function if exists public.t2_nazorat_holat_v1(bigint, bigint, bigint);
drop function if exists public.t2_nazorat_ichki_navbat_v1(bigint, bigint);
drop function if exists public.t2_nazorat_ichki_qaror_v1(bigint, bigint, text, bigint, text, text, uuid);
drop function if exists public.t2_nazorat_ichki_sorov_v1(bigint, bigint, text, bigint, text, uuid);
drop function if exists public.t2_nazorat_qaror_v1(bigint, bigint, bigint, text, text);
drop function if exists public.t2_nazorat_tayinlar_v1(bigint, bigint);
drop function if exists public.t2_tomon_vakolat_bekor_v1(bigint, bigint, bigint);
drop function if exists public.t2_tomon_vakolat_ber_v1(bigint, bigint, bigint, bigint, text[], text[], uuid);
drop function if exists public.t2_nazorat_tayinlash_bekor_v1(bigint, bigint, bigint);
drop function if exists public.t2_nazorat_tayinlash_v1(bigint, bigint, bigint, bigint, uuid);
drop function if exists public.t2_nazorat_sozlama_ol_v1(bigint, bigint);
drop function if exists public.t2_nazorat_sozlama_saqla_v1(bigint, bigint, boolean, text, uuid);
drop function if exists public._t2_nazorat_texnik_kerak(bigint, bigint);
drop function if exists public._t2_nazorat_vakil_korish(bigint, bigint, bigint, text);
delete from public.t2_outbox_mavzu_ruxsat where mavzu_naqsh = 'nazorat.%';
alter table public.t2_tomon_taqdim drop constraint if exists t2_tomon_taqdim_nazorat_turi_ck;
alter table public.t2_tomon_taqdim drop column if exists qaror_kompaniya_id, drop column if exists nomidan_kompaniya_id, drop column if exists nazorat_turi,
  drop column if exists ichki_otdi, drop column if exists ichki_actor_id, drop column if exists ichki_vaqt;
drop table if exists public.t2_nazorat_ichki_sorov;
drop table if exists public.t2_nazorat_qaror;
drop table if exists public.t2_nazorat_tayinlash;
drop table if exists public.t2_tomon_vakolat;
drop table if exists public.t2_nazorat_sozlama;
