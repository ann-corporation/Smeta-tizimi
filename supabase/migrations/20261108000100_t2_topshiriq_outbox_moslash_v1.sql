-- T2 EKOTIZIM — topshiriq (P1) hodisalarini F1 outbox ning 11 argumentli imzosiga moslash.
-- Holat: PRODDA QO'LLANGAN (koordinator, 2026-10-24). Bu fayl prod ta'rifining aynan nusxasi.
-- Sabab: 20261108600000_t2_topshiriq_v1 dagi _t2_topshiriq_hodisa 7 argumentli t2_outbox_yoz ni qidirardi;
-- F1 yadrosida (20261108000000) imzo 11 argumentli (oxirgi 4 tasi default) — to_regprocedure null qaytarib,
-- hodisalar outbox ga tushmas edi. Endi obyekt_id, aloqa_id, qabul kompaniya (ijrochi boshqa kompaniya bo'lsa)
-- va aniq qabul qiluvchi (ijrochi_foydalanuvchi) bilan yoziladi → bildirishnoma ishlovi ularni topadi.

create or replace function public._t2_topshiriq_hodisa(p_kompaniya_id bigint, p_mavzu text, p_id bigint, p_yuk jsonb, p_actor_id bigint, p_op uuid)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare t public.t2_topshiriq;
begin
  if to_regprocedure('public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint,bigint[],bigint[])') is null then return; end if;
  select * into t from public.t2_topshiriq where id = p_id;
  perform public.t2_outbox_yoz(p_kompaniya_id, p_mavzu, 't2_topshiriq', p_id, coalesce(p_yuk, '{}'::jsonb), p_actor_id, p_op,
    t.obyekt_id, t.aloqa_id,
    case when t.ijrochi_kompaniya_id is not null and t.ijrochi_kompaniya_id <> p_kompaniya_id then array[t.ijrochi_kompaniya_id] else '{}'::bigint[] end,
    case when t.ijrochi_foydalanuvchi_id is not null then array[t.ijrochi_foydalanuvchi_id] else '{}'::bigint[] end);
end $function$;

revoke all on function public._t2_topshiriq_hodisa(bigint,text,bigint,jsonb,bigint,uuid) from public, anon, authenticated;