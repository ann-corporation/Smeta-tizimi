-- Rollback 20261106730000: o'qish funksiyasi olib tashlanadi. Kompaniyalar o'zgartirgan modul sozlamalari
-- (t2_capability_override, module.*) O'CHIRILMAYDI — ular bo'lsa modul yozuvlari va turi check'i ham qoladi
-- (jim ma'lumot yo'qotish yo'q). Override bo'lmasa — to'liq orqaga.
begin;
drop function if exists public.t2_modul_holat_v1(bigint, bigint);
do $$ begin
  if not exists (select 1 from public.t2_capability_override where capability_kod like 'module.%') then
    delete from public.t2_capability where turi = 'module';
    alter table public.t2_capability drop constraint if exists t2_capability_turi_check;
    alter table public.t2_capability add constraint t2_capability_turi_check
      check (turi = any (array['capability'::text, 'command'::text, 'job'::text, 'integration'::text]));
  end if;
end $$;
commit;
