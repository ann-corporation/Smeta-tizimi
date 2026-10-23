-- 20261106850000 — har F2 fayli ALOHIDA hujjat (koordinator P0, 2026-10-24).
-- Muammo: /api/hujjat-yukla bir obyektga turi='f2_akt' bilan ikkinchi faylni yuklaganda finalize oldingisini
-- 'superseded' qilardi (bir obyekt + tur = bitta hujjat zanjiri). t2_f2_import_job_yarat_v1 faqat 'active' hujjatni
-- qabul qiladi -> SOURCE_DOCUMENT_SCOPE_MISMATCH: obyektda faqat oxirgi yuklangan F2 faylidan import qilish mumkin edi.
-- Haqiqat: har F2 fayli o'z hujjati; reviziya faqat AYNAN shu faylni (shu mazmunni) qayta yuklash.
-- Yechim: t2_document_canonical_reserve_v1 'f2_akt' uchun source_slot_key = 'f2:' || sha256 qo'yadi; reviziya raqami
-- va finalize/reconcile dagi superseded faqat shu slot ichida (ular slot bo'yicha allaqachon cheklangan).
-- Mavjud yozuvlar: barcha f2_akt hujjatlariga slot beriladi; har (kompaniya, loyiha, obyekt, slot) da eng oxirgisi active.
-- Oldingi holat t2_document_registry_f2slot_bak ga saqlanadi (rollback uchun).
begin;

do $mig$
declare original text; patched text; n int;
  a_decl text := 'declare d public.t2_document_registry; v_seq integer; v_key text;';
  b_decl text := 'declare d public.t2_document_registry; v_seq integer; v_key text; v_slot text; -- f2_alohida_slot_v1';
  a_seq text := '  select coalesce(max(revision_seq),0)+1 into v_seq from public.t2_document_registry' || chr(10)
    || '   where kompaniya_id=p_kompaniya_id and loyiha_id is not distinct from p_loyiha_id' || chr(10)
    || '     and obyekt_id is not distinct from p_obyekt_id and document_type=btrim(p_document_type);';
  b_seq text := '  -- f2_alohida_slot_v1: har F2 fayli o''z sloti (sha256) — boshqa F2 faylining reviziyasi emas.' || chr(10)
    || '  v_slot := case when btrim(p_document_type)=''f2_akt'' and nullif(btrim(p_client_sha256),'''') is not null' || chr(10)
    || '                 then ''f2:''||lower(btrim(p_client_sha256)) end;' || chr(10)
    || '  select coalesce(max(revision_seq),0)+1 into v_seq from public.t2_document_registry' || chr(10)
    || '   where kompaniya_id=p_kompaniya_id and loyiha_id is not distinct from p_loyiha_id' || chr(10)
    || '     and obyekt_id is not distinct from p_obyekt_id and document_type=btrim(p_document_type)' || chr(10)
    || '     and source_slot_key is not distinct from v_slot;';
  a_cols text := 'kompaniya_id,loyiha_id,obyekt_id,provider,document_type,revision,revision_seq,';
  b_cols text := 'kompaniya_id,loyiha_id,obyekt_id,provider,document_type,source_slot_key,revision,revision_seq,';
  a_vals text := '''cloudflare_r2'',btrim(p_document_type),' || chr(10) || '      p_revision,v_seq,';
  b_vals text := '''cloudflare_r2'',btrim(p_document_type),v_slot,' || chr(10) || '      p_revision,v_seq,';
begin
  select pg_get_functiondef('public.t2_document_canonical_reserve_v1'::regproc) into strict original;
  if position('f2_alohida_slot_v1' in original) > 0 then raise notice 'allaqachon qo''llangan'; return; end if;
  for n in 1..4 loop
    if (array[a_decl, a_seq, a_cols, a_vals])[n] is null
       or (length(original) - length(replace(original, (array[a_decl, a_seq, a_cols, a_vals])[n], ''))) / length((array[a_decl, a_seq, a_cols, a_vals])[n]) <> 1 then
      raise exception 'Unexpected t2_document_canonical_reserve_v1 definition (langar %)', n;
    end if;
  end loop;
  patched := replace(replace(replace(replace(original, a_decl, b_decl), a_seq, b_seq), a_cols, b_cols), a_vals, b_vals);
  execute patched;
end $mig$;

-- Mavjud yozuvlar: zaxira, slot, holat.
create table if not exists public.t2_document_registry_f2slot_bak as
  select id, status, source_slot_key, updated_at from public.t2_document_registry where document_type = 'f2_akt';
alter table public.t2_document_registry_f2slot_bak enable row level security;

update public.t2_document_registry
   set source_slot_key = 'f2:' || lower(sha256)
 where document_type = 'f2_akt' and source_slot_key is null and sha256 is not null;

with r as (
  select id, row_number() over (partition by kompaniya_id, loyiha_id, obyekt_id, source_slot_key order by id desc) rn
    from public.t2_document_registry
   where document_type = 'f2_akt' and canonical_storage_status = 'stored' and status in ('active', 'superseded')
)
update public.t2_document_registry d
   set status = case when r.rn = 1 then 'active' else 'superseded' end, updated_at = now()
  from r
 where d.id = r.id and d.status is distinct from case when r.rn = 1 then 'active' else 'superseded' end;

commit;
