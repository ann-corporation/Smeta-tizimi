-- ROLLBACK: 20261108410000_t2_buyurtma_p3_v1  (oldin 20261108420000 tender RPC rollback qilinadi)
begin;
drop function if exists public.t2_buyurtma_tafsilot_v1(bigint,bigint,bigint);
drop function if exists public.t2_buyurtmalar_v1(bigint,bigint,text,text,text,integer,bigint);
drop function if exists public.t2_buyurtma_qabul_v1(bigint,bigint,uuid,bigint,integer,jsonb,bigint[],text);
drop function if exists public.t2_buyurtma_otish_v1(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[]);
drop function if exists public._t2_buyurtma_otish_ichki(bigint,bigint,uuid,bigint,integer,text,text,text,bigint[]);
drop function if exists public.t2_buyurtma_olish_yoz_v1(bigint,bigint,uuid,bigint,integer,jsonb);
drop function if exists public.t2_buyurtma_yarat_v1(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,jsonb,jsonb);
drop function if exists public._t2_buyurtma_yarat_ichki(bigint,bigint,uuid,text,bigint,bigint,bigint,bigint,bigint,jsonb,jsonb,numeric,numeric,text);
drop function if exists public._t2_buyurtma_otish_ruxsat(text,text,text);
drop function if exists public._t2_buyurtma_bosqich_holat(text);
drop function if exists public._t2_yet_qator_xato(jsonb);
drop function if exists public._t2_yet_dalil_yoz(text,bigint,bigint[]);
drop function if exists public._t2_yet_tur_ok(text,text);
drop function if exists public._t2_obyekt_doira_ok_yet(bigint,bigint,bigint);
drop function if exists public._t2_yet_hodisa(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint[]);
drop function if exists public._t2_yet_aloqa_faol(bigint,bigint);
drop function if exists public._t2_yet_azo(bigint,bigint,text);
-- Bosqich katalogi qatorlari (F1 jadvali bo'lsa)
do $$ begin
  if to_regclass('public.t2_bosqich_katalog') is not null then
    execute $q$delete from public.t2_bosqich_katalog where primitiv = 'buyurtma' and tur = 'material'
      and kalit in ('tayyorlanmoqda','yuklashga_tayyor','yolda','yetkazildi','hisob_faktura')$q$;
  end if;
exception when others then raise notice 'bosqich katalogi tozalanmadi: %', sqlerrm; end $$;
drop table if exists public.t2_buyurtma_qator;
drop table if exists public.t2_buyurtma;
commit;
