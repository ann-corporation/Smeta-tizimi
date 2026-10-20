-- F2 import «oxirida bittada yozish» tezligi (2026-10-20): ish+resurslar yaratilgach ota qatorning yangi versiyasi ham
-- qaytariladi (t2_addrepl_execute_v1 natijasidagi parent_version). Klient keyingi buyruq uchun versiyani alohida so'rov bilan
-- o'qimaydi. Mantiq o'zgarmagan — faqat javobga bitta maydon qo'shildi; CREATE OR REPLACE ruxsatlarni saqlaydi.
begin;
CREATE OR REPLACE FUNCTION public.t2_ish_resurslar_bilan_yarat_v1(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  mode text := p_request->>'command';
  op uuid := (p_request->>'operation_id')::uuid;
  ish jsonb;
  ish_natija jsonb;
  ish_id bigint;
  oldingi_id bigint;
  r jsonb;
  i integer := 0;
  v integer;
  res_natija jsonb;
  res_idlar jsonb := '[]'::jsonb;
begin
  if mode not in ('additional', 'replacement') then raise exception 'COMMAND_INVALID'; end if;
  if op is null then raise exception 'OPERATION_AND_VERSION_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_request->'resurslar', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_request->'resurslar', '[]'::jsonb)) > 500 then
    raise exception 'RESOURCES_INVALID';
  end if;

  ish := p_request - 'resurslar';
  ish_natija := public.t2_addrepl_execute_v1(ish);
  ish_id := (ish_natija->>'qator_id')::bigint;
  if ish_id is null then raise exception 'WORK_NOT_CREATED'; end if;
  oldingi_id := ish_id;

  for r in select value from jsonb_array_elements(coalesce(p_request->'resurslar', '[]'::jsonb)) loop
    i := i + 1;
    select versiya into v from public.t2_qator where id = ish_id;
    res_natija := public.t2_addrepl_execute_v1(jsonb_build_object(
      'command', 'resource',
      'kompaniya_id', p_request->'kompaniya_id',
      'actor_id', p_request->'actor_id',
      'obyekt_id', p_request->'obyekt_id',
      'ota_qator_id', ish_id,
      'tur', coalesce(nullif(r->>'tur', ''), 'rs'),
      'nom', r->>'nom',
      'birlik', r->>'birlik',
      'hajm', r->'hajm',
      'kod', r->>'kod',
      'keyin_qator_id', oldingi_id,
      'sabab', p_request->>'sabab',
      'dalil_hujjat_id', p_request->'dalil_hujjat_id',
      'operation_id', md5(op::text || ':r' || i)::uuid,
      'kutilgan_versiya', v
    ));
    oldingi_id := (res_natija->>'qator_id')::bigint;
    res_idlar := res_idlar || jsonb_build_array(oldingi_id);
  end loop;

  return jsonb_build_object('ok', true, 'qator_id', ish_id, 'resurs_qator_idlar', res_idlar,
    'takror', coalesce((ish_natija->>'takror')::boolean, false),
    'parent_version', (select q.versiya from public.t2_qator q where q.id = (p_request->>'ota_qator_id')::bigint));
end $function$;
commit;
