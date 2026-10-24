-- ROLLBACK: 20261108000100_t2_topshiriq_outbox_moslash_v1.sql — 20261108600000_t2_topshiriq_v1 dagi oldingi ta'rif.
-- Diqqat: oldingi ta'rif 7 argumentli t2_outbox_yoz ni qidiradi va F1 bilan hodisa yozmaydi (shu sabab tuzatilgan edi).

create or replace function public._t2_topshiriq_hodisa(p_kompaniya_id bigint, p_mavzu text, p_id bigint, p_yuk jsonb, p_actor_id bigint, p_op uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid)') is not null then
    execute 'select public.t2_outbox_yoz($1,$2,$3,$4,$5,$6,$7)' using p_kompaniya_id, p_mavzu, 't2_topshiriq', p_id, p_yuk, p_actor_id, p_op;
  end if;
end $$;