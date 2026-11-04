-- Qaytarish: P1 ilova modullari. Override qatorlari FK ON DELETE CASCADE bilan o'chadi.
begin;
delete from public.t2_capability
 where turi = 'module'
   and kod in ('module.moliya','module.sotuv','module.xarid','module.hr','module.logistika','module.hujjat','module.desktop');
commit;