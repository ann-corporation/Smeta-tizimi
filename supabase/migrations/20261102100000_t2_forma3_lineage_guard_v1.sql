-- SOURCE ONLY. Productionga qo'llash bu task scope'ida YO'Q.
-- F3 yozuvini company → project → object → contract lineage'idan chiqarib
-- yubormaslik uchun additive trigger guard. Yangi canonical truth yaratmaydi.

begin;

create or replace function public.t2_forma3_lineage_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_company bigint;
  v_object_company bigint;
  v_object_project bigint;
  v_contract_company bigint;
  v_contract_project bigint;
begin
  if new.kompaniya_id is null then
    raise exception 'FORMA3_COMPANY_REQUIRED' using errcode = '22023';
  end if;

  if new.loyiha_id is not null then
    select l.kompaniya_id into v_project_company
      from public.t2_loyiha l where l.id = new.loyiha_id;
    if not found then
      raise exception 'FORMA3_PROJECT_NOT_FOUND' using errcode = '42501';
    end if;
    if v_project_company <> new.kompaniya_id then
      raise exception 'FORMA3_PROJECT_COMPANY_MISMATCH' using errcode = '42501';
    end if;
  end if;

  if new.obyekt_id is not null then
    select o.kompaniya_id, o.loyiha_id into v_object_company, v_object_project
      from public.t2_obyekt o where o.id = new.obyekt_id;
    if not found then
      raise exception 'FORMA3_OBJECT_NOT_FOUND' using errcode = '42501';
    end if;
    if v_object_company <> new.kompaniya_id then
      raise exception 'FORMA3_OBJECT_COMPANY_MISMATCH' using errcode = '42501';
    end if;
    if v_object_project is null or new.loyiha_id is distinct from v_object_project then
      raise exception 'FORMA3_OBJECT_PROJECT_MISMATCH' using errcode = '42501';
    end if;
  end if;

  if new.shartnoma_id is not null then
    select s.kompaniya_id, s.loyiha_id into v_contract_company, v_contract_project
      from public.t2_shartnoma s where s.id = new.shartnoma_id;
    if not found then
      raise exception 'FORMA3_CONTRACT_NOT_FOUND' using errcode = '42501';
    end if;
    if v_contract_company <> new.kompaniya_id then
      raise exception 'FORMA3_CONTRACT_COMPANY_MISMATCH' using errcode = '42501';
    end if;
    if v_contract_project is not null and new.loyiha_id is distinct from v_contract_project then
      raise exception 'FORMA3_CONTRACT_PROJECT_MISMATCH' using errcode = '42501';
    end if;
    if new.obyekt_id is not null and not exists (
      select 1 from public.t2_shartnoma_bog b
       where b.shartnoma_id = new.shartnoma_id
         and b.obyekt_id = new.obyekt_id
         and coalesce(b.holat, 'faol') = 'faol'
    ) then
      raise exception 'FORMA3_OBJECT_CONTRACT_UNLINKED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.t2_forma3_lineage_guard_v1() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.t2_forma3') is not null
     and not exists (
       select 1 from pg_trigger
        where tgrelid = 'public.t2_forma3'::regclass
          and tgname = 't2_forma3_lineage_guard_trg'
     ) then
    create trigger t2_forma3_lineage_guard_trg
      before insert or update on public.t2_forma3
      for each row execute function public.t2_forma3_lineage_guard_v1();
  end if;
end;
$$;

commit;

