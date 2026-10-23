-- Rollback: 20261106850000 — reserve_v1 asl ta'rifiga qaytadi; f2_akt holat/slotlari zaxiradan tiklanadi.
-- Migratsiyadan KEYIN yuklangan f2_akt hujjatlari (zaxirada yo'q) slotida qoladi — ular alohida hujjat bo'lib qoladi.
begin;

do $rb$
declare original text; patched text;
begin
  select pg_get_functiondef('public.t2_document_canonical_reserve_v1'::regproc) into strict original;
  if position('f2_alohida_slot_v1' in original) = 0 then raise notice 'qo''llanmagan'; return; end if;
  patched := replace(original,
    'declare d public.t2_document_registry; v_seq integer; v_key text; v_slot text; -- f2_alohida_slot_v1',
    'declare d public.t2_document_registry; v_seq integer; v_key text;');
  patched := replace(patched,
    '  -- f2_alohida_slot_v1: har F2 fayli o''z sloti (sha256) — boshqa F2 faylining reviziyasi emas.' || chr(10)
    || '  v_slot := case when btrim(p_document_type)=''f2_akt'' and nullif(btrim(p_client_sha256),'''') is not null' || chr(10)
    || '                 then ''f2:''||lower(btrim(p_client_sha256)) end;' || chr(10), '');
  patched := replace(patched,
    'document_type=btrim(p_document_type)' || chr(10) || '     and source_slot_key is not distinct from v_slot;',
    'document_type=btrim(p_document_type);');
  patched := replace(patched,
    'kompaniya_id,loyiha_id,obyekt_id,provider,document_type,source_slot_key,revision,revision_seq,',
    'kompaniya_id,loyiha_id,obyekt_id,provider,document_type,revision,revision_seq,');
  patched := replace(patched, '''cloudflare_r2'',btrim(p_document_type),v_slot,', '''cloudflare_r2'',btrim(p_document_type),');
  if position('f2_alohida_slot_v1' in patched) > 0 or position('v_slot' in patched) > 0 then
    raise exception 'Unexpected t2_document_canonical_reserve_v1 definition';
  end if;
  execute patched;
end $rb$;

update public.t2_document_registry d
   set status = b.status, source_slot_key = b.source_slot_key, updated_at = now()
  from public.t2_document_registry_f2slot_bak b
 where d.id = b.id;

drop table if exists public.t2_document_registry_f2slot_bak;

commit;
