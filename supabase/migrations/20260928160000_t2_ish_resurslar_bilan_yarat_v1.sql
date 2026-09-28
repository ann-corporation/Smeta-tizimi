-- T2_ISH_RESURSLAR_BILAN_YARAT_V1 — egasi (2026-09-28): "F2 import … bitta zamena uchun
-- dafiga kuttiradi". Sabab: qo'shimcha/zamena ish yaratilgach F2 dagi har resurs uchun
-- brauzer alohida versiya o'qib, alohida yaratish so'rovini yuborardi (20 resurs = 40+
-- ketma-ket so'rov + butun smetani qayta yuklash).
--
-- Endi BITTA so'rov, BITTA tranzaksiya: ish (additional yoki replacement) va uning
-- barcha resurslari mavjud `t2_addrepl_execute_v1` orqali (barcha tekshiruvlar, rol,
-- versiya, OLD o'zgarmaydi qonuni, audit — o'sha-o'sha) ketma-ket yaratiladi. Biror
-- resurs rad etilsa — hech narsa yozilmaydi (yarimta zamena qolmaydi). Qayta urinish:
-- ish `operation_id`, resurslar `md5(operation_id:r<i>)` bilan — takror so'rov oldingi
-- javobni qaytaradi, dublikat yaratmaydi.
begin;

create or replace function public.t2_ish_resurslar_bilan_yarat_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  mode text := p_request->>'command';
  op uuid := (p_request->>'operation_id')::uuid;
  ish jsonb;
  ish_natija jsonb;
  ish_id bigint;
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
      'sabab', p_request->>'sabab',
      'dalil_hujjat_id', p_request->'dalil_hujjat_id',
      'operation_id', md5(op::text || ':r' || i)::uuid,
      'kutilgan_versiya', v
    ));
    res_idlar := res_idlar || jsonb_build_array((res_natija->>'qator_id')::bigint);
  end loop;

  return jsonb_build_object('ok', true, 'qator_id', ish_id, 'resurs_qator_idlar', res_idlar,
    'takror', coalesce((ish_natija->>'takror')::boolean, false));
end $function$;

revoke all on function public.t2_ish_resurslar_bilan_yarat_v1(jsonb) from public, anon, authenticated;
grant execute on function public.t2_ish_resurslar_bilan_yarat_v1(jsonb) to service_role;

commit;
