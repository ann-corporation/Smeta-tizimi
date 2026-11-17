-- Qabul sinovi (faqat ROLLBACK ichida; prodda COMMIT YO'Q). Sintetik/mavjud obyekt bilan: dry_run natija qaytaradi, hech narsa saqlanmaydi.
-- 1) oq ro'yxatda yo'q RPC rad etiladi; 2) fakt_yoz dry_run oldin/keyin farqini beradi; 3) dry_run dan keyin qator fakti O'ZGARMAGAN.
begin;
do $$
declare
  v_actor bigint := (select foydalanuvchi_id from public.t2_kompaniya_azo where holat = 'faol' limit 1);
  v_ob record; v_q bigint; v_r jsonb; v_oldin numeric; v_keyin numeric; v_rad boolean := false;
begin
  select o.id, o.kompaniya_id into v_ob from public.t2_obyekt o limit 1;
  select h.qator_id into v_q from public.t2_qator_holat h where h.obyekt_id = v_ob.id and h.tur in ('rs', 'mat', 'ob') limit 1;
  select coalesce(h.fakt_hajm, 0) into v_oldin from public.t2_qator_holat h where h.qator_id = v_q;
  begin
    perform public.t2_jarvis_dry_run_v1(v_actor, v_ob.kompaniya_id, v_ob.id, '[{"rpc":"t2_akt_bekor","args":{}}]'::jsonb);
  exception when sqlstate '42501' then v_rad := true; end;
  if not v_rad then raise exception 'ACCEPTANCE: oq royxatdan tashqari RPC rad etilmadi'; end if;
  v_r := public.t2_jarvis_dry_run_v1(v_actor, v_ob.kompaniya_id, v_ob.id, jsonb_build_array(jsonb_build_object('rpc', 't2_fakt_yoz_v2', 'args', jsonb_build_object(
    'p_obyekt_id', v_ob.id, 'p_sana', current_date, 'p_qatorlar', jsonb_build_array(jsonb_build_object('qator_id', v_q, 'hajm', 1)),
    'p_operation_id', gen_random_uuid()))), 'fakt', null, array[v_q]);
  if (v_r->>'dry_run') is distinct from 'true' then raise exception 'ACCEPTANCE: dry_run belgisi yoq: %', v_r; end if;
  select coalesce(h.fakt_hajm, 0) into v_keyin from public.t2_qator_holat h where h.qator_id = v_q;
  if v_keyin is distinct from v_oldin then raise exception 'ACCEPTANCE: dry_run bazani ozgartirdi (% -> %)', v_oldin, v_keyin; end if;
end $$;
rollback;
