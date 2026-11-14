-- ROLLBACK 20261218200000_t2_slichitelniy_asos_v1
-- Funksiyalar olib tashlanadi; t2_aosr_bog.hajm ustuni va uning cheklovi tushiriladi (shu ustundagi hajm qiymatlari YO'QOLADI:
-- АОСР <-> qator bog'ining o'zi (aosr_id, qator_id) saqlanadi, faqat hajm tafsiloti ketadi).
set local statement_timeout = '300s';

drop function if exists public.t2_aosr_asos_qoralama_v1(bigint, bigint, bigint, bigint[], uuid, text);
drop function if exists public.t2_aosr_bog_hajm_v1(bigint, bigint, bigint, jsonb, uuid);
drop function if exists public.t2_aosr_slichitelniy_v1(bigint, bigint, bigint, integer);

-- t2_nazorat_aosr_korik_v1: hajmsiz (oldingi) ta'rif tiklanadi
create or replace function public.t2_nazorat_aosr_korik_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taqdim_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare q public.t2_tomon_taqdim;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into q from public.t2_tomon_taqdim where id = p_taqdim_id;
  if not found or q.resurs <> 'aosr' or q.manba_jadval <> 't2_aosr' or (q.taqdim_etuvchi_kompaniya_id <> p_kompaniya_id and q.qabul_qiluvchi_kompaniya_id <> p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'АОСР taqdimi topilmadi');
  end if;
  return jsonb_build_object('ok', true, 'taqdim_id', q.id, 'aosr_id', q.manba_id,
    'protokollar', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'raqam', p.raqam, 'sana', p.sana, 'sinov_turi', p.sinov_turi, 'konstruksiya', p.konstruksiya,
                      'marka', p.marka, 'natija', p.natija, 'laboratoriya', (select k.nom from public.t2_kontragent k where k.id = p.laboratoriya_id),
                      'document_id', case when p.fayl_document_id ~ '^[0-9]{1,15}$' then p.fayl_document_id::bigint end,
                      'fayl', (select d.original_filename from public.t2_document_registry d where p.fayl_document_id ~ '^[0-9]{1,15}$' and d.id = p.fayl_document_id::bigint and d.kompaniya_id = q.taqdim_etuvchi_kompaniya_id))
                      order by p.id), '[]'::jsonb)
                      from public.t2_lab_protokol_bog pb join public.t2_lab_protokol p on p.id = pb.protokol_id and p.holat <> 'bekor' where pb.aosr_id = q.manba_id),
    'fotolar', (select coalesce(jsonb_agg(jsonb_build_object('document_id', f.document_id, 'fayl', d.original_filename, 'mime', d.mime_type) order by f.id), '[]'::jsonb)
                  from public.t2_aosr_foto f join public.t2_document_registry d on d.id = f.document_id and d.kompaniya_id = q.taqdim_etuvchi_kompaniya_id where f.aosr_id = q.manba_id),
    'ishlar', (select coalesce(jsonb_agg(jsonb_build_object('qator_id', h.qator_id, 'kod', h.kod, 'nom', h.nom, 'birlik', h.birlik) order by h.qator_id), '[]'::jsonb)
                 from (select b.qator_id, qq.kod, qq.nom, qq.birlik from public.t2_aosr_bog b join public.t2_qator qq on qq.id = b.qator_id where b.aosr_id = q.manba_id order by b.qator_id limit 60) h));
end $function$;
alter table public.t2_aosr_bog drop constraint if exists t2_aosr_bog_hajm_check;
alter table public.t2_aosr_bog drop column if exists hajm;
