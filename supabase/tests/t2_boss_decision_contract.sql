-- Только SELECT. Синтетическая проверка отбора Ф2, NULL != 0 и tenant scope.
with acts(company_id,object_id,tur,holat,lifecycle_status,hujjat_jami) as (values
 (17,127,'f2','tasdiqlangan','approved',100::numeric),
 (17,127,'f2','tasdiqlangan','approved',null::numeric),
 (17,127,'f2','tasdiqlangan','approved',0::numeric),
 (17,127,'f2','qoralama','draft',900::numeric),
 (17,127,'fakt','tasdiqlangan','approved',800::numeric),
 (17,127,'f2','tasdiqlangan','superseded',700::numeric),
 (99,127,'f2','tasdiqlangan','approved',600::numeric),
 (17,999,'f2','tasdiqlangan','approved',500::numeric)
), approved as (
 select * from acts where company_id=17 and object_id=127 and tur='f2'
 and holat in ('tasdiqlangan','yakunlangan') and coalesce(lifecycle_status,'approved')='approved'
) select count(*)=3 as approved_only, sum(hujjat_jami)=100 as correct_known_subtotal,
 count(*) filter(where hujjat_jami is null)=1 as null_preserved,
 count(*) filter(where hujjat_jami=0)=1 as explicit_zero_preserved from approved;
