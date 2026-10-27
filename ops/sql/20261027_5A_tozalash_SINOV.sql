-- A) SINOV — hech narsa o'zgarmaydi (oxirida ROLLBACK). Natija jadvalini Claude'ga yuboring.
begin;
-- ═══ TANA (A va B fayllarda bir xil). Egasi 2026-10-27: «NEW TIMES BUILDINGS MCHJ (123) qolsin, qolgani kerak emas».
-- Qoladi: kompaniya 123 (to'liq) + kompaniya 1 QOBIG'I «Platforma (tizim)» — faqat superadmin a'zoliklari (superadmin
--   huquqi t2_azolik.rol='superadmin' ga bog'liq; 1 o'chsa egasi platforma boshqaruvidan mahrum bo'ladi).
-- O'chadi: boshqa barcha kompaniyalar va ularning ma'lumotlari; kompaniya 1 ning ma'lumotlari (obyekt, smeta…).
-- Foydalanuvchi hisoblari (t2_foydalanuvchi) O'CHIRILMAYDI — faqat o'chgan kompaniyalardagi a'zoliklari.
set local session_replication_role = replica;   -- FK va triggerlar vaqtincha o'chiq (append-only jurnallar ham); oxirida orfan tekshiruvi
set local statement_timeout = '15min';
create temp table _ochir_k (id bigint primary key) on commit drop;
insert into _ochir_k select id from public.t2_kompaniya where id not in (1, 123);
create temp table _hisobot (bosqich text, jadval text, ustun text, amal text, soni bigint) on commit drop;
create temp table _qolgan_oldin (jadval text, ustun text, soni bigint) on commit drop;

do $tozalash$
declare r record; n bigint; jami bigint; aylana int := 0; v_pk text;
begin
  -- 0) 123 ning ma'lumoti oldin qancha edi (keyin hech narsa yo'qolmaganini tekshirish uchun)
  for r in select c.table_name t, c.column_name col from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
            where c.table_schema = 'public' and tb.table_type = 'BASE TABLE' and c.column_name in ('kompaniya_id', 'company_id') loop
    execute format('select count(*) from public.%I where %I = 123', r.t, r.col) into n;
    insert into _qolgan_oldin values (r.t, r.col, n);
  end loop;

  -- 1) Egalik ustuni (kompaniya_id / company_id) bo'yicha o'chirish
  for r in select c.table_name t, c.column_name col from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
            where c.table_schema = 'public' and tb.table_type = 'BASE TABLE' and c.column_name in ('kompaniya_id', 'company_id')
              and c.table_name <> 't2_kompaniya' loop
    if r.t = 't2_azolik' then
      execute format('delete from public.%I where %I in (select id from _ochir_k) or (%I = 1 and rol <> ''superadmin'')', r.t, r.col, r.col);
    else
      execute format('delete from public.%I where %I in (select id from _ochir_k) or %I = 1', r.t, r.col, r.col);
    end if;
    get diagnostics n = row_count;
    if n > 0 then insert into _hisobot values ('1 egalik', r.t, r.col, 'o''chirildi', n); end if;
  end loop;

  -- 2) Boshqa kompaniyaga havola ustunlari (tomon_kompaniya_id, taklif/qabul, beruvchi/oluvchi …)
  for r in select fk.conrelid::regclass::text t, a.attname col, a.attnotnull nn
             from pg_constraint fk join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = any (fk.conkey)
            where fk.contype = 'f' and fk.confrelid = 'public.t2_kompaniya'::regclass
              and a.attname not in ('kompaniya_id', 'company_id') loop
    if r.nn then
      execute format('delete from %s where %I in (select id from _ochir_k)', r.t, r.col);
      get diagnostics n = row_count;
      if n > 0 then insert into _hisobot values ('2 havola', r.t, r.col, 'o''chirildi', n); end if;
    else
      execute format('update %s set %I = null where %I in (select id from _ochir_k)', r.t, r.col, r.col);
      get diagnostics n = row_count;
      if n > 0 then insert into _hisobot values ('2 havola', r.t, r.col, 'null qilindi', n); end if;
    end if;
  end loop;

  delete from public.t2_kompaniya where id in (select id from _ochir_k);
  get diagnostics n = row_count; insert into _hisobot values ('3 kompaniya', 't2_kompaniya', 'id', 'o''chirildi', n);
  update public.t2_kompaniya set nom = 'Platforma (tizim)', turi = 'tashkilot' where id = 1;

  -- 4) Orfanlar: ota qatori o'chgan bolalar (bitta ustunli FK lar). NOT NULL — o'chiriladi, NULL bo'la oladi — null.
  loop
    aylana := aylana + 1; jami := 0;
    for r in select fk.conrelid::regclass::text t, ca.attname col, ca.attnotnull nn,
                    fk.confrelid::regclass::text pt, pa.attname pcol
               from pg_constraint fk
               join pg_attribute ca on ca.attrelid = fk.conrelid and ca.attnum = fk.conkey[1]
               join pg_attribute pa on pa.attrelid = fk.confrelid and pa.attnum = fk.confkey[1]
               join pg_namespace cn on cn.oid = (select relnamespace from pg_class where oid = fk.conrelid)
              where fk.contype = 'f' and array_length(fk.conkey, 1) = 1 and cn.nspname = 'public' loop
      if r.nn then
        execute format('delete from %s c where c.%I is not null and not exists (select 1 from %s p where p.%I = c.%I)', r.t, r.col, r.pt, r.pcol, r.col);
      else
        execute format('update %s c set %I = null where c.%I is not null and not exists (select 1 from %s p where p.%I = c.%I)', r.t, r.col, r.col, r.pt, r.pcol, r.col);
      end if;
      get diagnostics n = row_count;
      if n > 0 then
        insert into _hisobot values ('4 orfan #' || aylana, r.t, r.col, case when r.nn then 'o''chirildi' else 'null qilindi' end, n);
        jami := jami + n;
      end if;
    end loop;
    exit when jami = 0 or aylana >= 12;
  end loop;

  -- 5) 123 dan biror narsa yo'qoldimi?
  for r in select o.jadval, o.ustun, o.soni from _qolgan_oldin o loop
    execute format('select count(*) from public.%I where %I = 123', r.jadval, r.ustun) into n;
    if n <> r.soni then insert into _hisobot values ('5 DIQQAT 123', r.jadval, r.ustun, 'oldin ' || r.soni || ' → keyin ' || n, r.soni - n); end if;
  end loop;
end $tozalash$;

select bosqich, jadval, ustun, amal, soni from _hisobot order by bosqich, soni desc;
rollback;
