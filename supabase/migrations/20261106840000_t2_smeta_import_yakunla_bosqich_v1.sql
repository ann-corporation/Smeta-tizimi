-- JONLI_SINOV_TOPILMALARI #15 (2026-10-23, P0): 25 030 qatorli smeta importining yakuniy RPC si
-- (t2_smeta_import_yakunla_v1) IMPORT_RPC_FAILED (57014 statement timeout) — sessiya «ochiq» qoldi.
-- Sabab: 20261106420000_t2_import_mandatory_rollup_v2 dan beri ≥5000 qatorli importda ham ANALYZE + t2_rollup
-- YAKUNLASH bilan BITTA statementda bajariladi (2026-10-11 dagi muvaffaqiyatli import — sessiya 22 — shu migratsiyadan
-- oldin edi: o'shanda katta importda rollup umuman bajarilmagan). PostgREST orqali har chaqiriq authenticator ning
-- statement_timeout (30s) chegarasida.
-- Yechim (bosqichma-bosqich, har bosqich o'z vaqt limitida):
--   1) yakunla (oddiy va paket) — ≥5000 qatorda rollupni bajarmaydi, javobda 'rollup_kerak': true qaytaradi;
--      <5000 qatorda xatti-harakat o'zgarmaydi;
--   2) t2_smeta_import_rollup_v1 — ANALYZE + t2_rollup alohida chaqiriq (shlyuz yakunladan keyin avtomatik chaqiradi;
--      xato bo'lsa qatorlar saqlangan, rollup qayta chaqiriladi — idempotent);
--   3) t2_smeta_import_bekor_v1 — «ochiq» sessiyani toza bekor qilish (bo'laklar o'chiriladi, sessiya 'bekor', audit);
--   4) yakunla/rollup ga statement_timeout = 120s atributi (PostgREST funksiya sozlamasini qo'llasa — qo'shimcha zaxira).
-- Ochiq sessiyani davom ettirish: shu sessiya_id bilan yakunla qayta chaqiriladi (bo'laklar bazada; qayta yuborish shart emas).
-- Patch usuli 20261106420000 bilan bir xil: joriy ta'rif o'qiladi, kutilgan blok aynan bir marta topilmasa — to'xtaydi.

begin;

do $migration$
declare spec record; original text; patched text; old_block text; new_block text; old_ret text; new_ret text;
begin
  for spec in select * from (values
    ('t2_smeta_import_yakunla_unlocked_v1', 'v_sessiya', 'if v_soni < 5000 then',
     'v_prev := jsonb_build_object(''ok'',true,''obyekt_id'',v_sessiya.obyekt_id,''qator_soni'',v_soni);'),
    ('t2_smeta_paket_import_yakunla_unlocked_v1', 'v_session', 'if v_soni<5000 then',
     'v_prev:=jsonb_build_object(''ok'',true,''obyekt_id'',v_session.obyekt_id,''paket_id'',v_session.paket_id,''qator_soni'',v_soni);')
  ) as x(fn, sv, guard, ret) loop
    select pg_get_functiondef(p.oid) into strict original from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = spec.fn;
    if position('-- import_rollup_bosqich_v1' in original) > 0 then continue; end if;
    old_block := '-- mandatory_import_rollup_v2' || chr(10)
      || '  if v_soni >= 5000 then ANALYZE public.t2_qator; end if;' || chr(10)
      || '  perform public.t2_rollup(' || spec.sv || '.obyekt_id);' || chr(10)
      || '  ' || spec.guard;
    new_block := '-- import_rollup_bosqich_v1: >=5000 qatorda rollup alohida RPC (t2_smeta_import_rollup_v1) — har bosqich o''z vaqt limitida.' || chr(10)
      || '  if v_soni < 5000 then perform public.t2_rollup(' || spec.sv || '.obyekt_id); end if;' || chr(10)
      || '  ' || spec.guard;
    old_ret := spec.ret;
    new_ret := replace(spec.ret, '''qator_soni'',v_soni)', '''qator_soni'',v_soni,''rollup_kerak'',v_soni >= 5000)');
    if (length(original) - length(replace(original, old_block, ''))) / length(old_block) <> 1
       or (length(original) - length(replace(original, old_ret, ''))) / length(old_ret) <> 1 then
      raise exception 'Unexpected import definition: %', spec.fn;
    end if;
    patched := replace(replace(original, old_block, new_block), old_ret, new_ret);
    execute patched;
  end loop;
end $migration$;

/* Katta import uchun rollup — alohida chaqiriq. Idempotent (rollup qayta hisoblaydi). */
create or replace function public.t2_smeta_import_rollup_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_natija jsonb; v_komp bigint;
begin
  perform public.t2_smeta_import_ruxsat(p_kompaniya_id, p_actor_id);
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if not found or v_komp is distinct from p_kompaniya_id then
    return jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_INVALID');
  end if;
  perform public.t2_smeta_import_object_lock_v1(p_obyekt_id);
  perform set_config('t2.manba', 'import', true);
  analyze public.t2_qator;
  v_natija := public.t2_rollup(p_obyekt_id);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_import_rollup', 'smeta', p_obyekt_id,
    'import rollup (alohida bosqich)', 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'rollup', v_natija);
end $$;

/* Ochiq import sessiyasini toza bekor qilish (smeta qatorlari hali yozilmagan — faqat bo'laklar). */
alter table public.t2_smeta_import_sessiya drop constraint if exists t2_smeta_import_sessiya_holat_check;
alter table public.t2_smeta_import_sessiya add constraint t2_smeta_import_sessiya_holat_check check (holat in ('ochiq', 'yakunlandi', 'bekor'));

create or replace function public.t2_smeta_import_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.t2_smeta_import_sessiya; v_bolak integer;
begin
  perform public.t2_smeta_import_ruxsat(p_kompaniya_id, p_actor_id);
  select * into v_s from public.t2_smeta_import_sessiya where id = p_sessiya_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'IMPORT_SESSION_NOT_FOUND'); end if;
  if v_s.holat = 'bekor' then return jsonb_build_object('ok', true, 'takror', true, 'sessiya_id', p_sessiya_id); end if;
  if v_s.holat <> 'ochiq' then return jsonb_build_object('ok', false, 'code', 'IMPORT_SESSION_CLOSED'); end if;
  delete from public.t2_smeta_import_bolak where sessiya_id = p_sessiya_id;
  get diagnostics v_bolak = row_count;
  update public.t2_smeta_import_sessiya set holat = 'bekor', yangilandi = now() where id = p_sessiya_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_import_bekor', 'smeta', v_s.obyekt_id,
    format('sessiya=%s; bolak=%s', p_sessiya_id, v_bolak), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'takror', false, 'sessiya_id', p_sessiya_id, 'bolak', v_bolak);
end $$;

alter function public.t2_smeta_import_yakunla_v1(bigint, bigint, bigint) set statement_timeout = '120s';
alter function public.t2_smeta_paket_import_yakunla_v1(bigint, bigint, bigint) set statement_timeout = '120s';
alter function public.t2_smeta_import_rollup_v1(bigint, bigint, bigint) set statement_timeout = '120s';

revoke all on function public.t2_smeta_import_rollup_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_smeta_import_bekor_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_smeta_import_rollup_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_smeta_import_bekor_v1(bigint, bigint, bigint) to service_role;

commit;
