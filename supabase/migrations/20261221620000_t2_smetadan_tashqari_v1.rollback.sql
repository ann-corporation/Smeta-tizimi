-- Rollback: 20261221620000 (smetadan tashqari). Funksiyalarni migratsiya oldingi matniga qaytaradi, keyin yangi obyektlarni olib tashlaydi.
do $rb$
declare v_nom text; v_tarif text;
begin
  foreach v_nom in array array['_t2_summa_agg_v1', '_t2_summa_paket_v1', 't2_smeta_ozgarish_qatlam_v1'] loop
    select tarif into v_tarif from public._t2_fn_zaxira where nom = v_nom || ':20261221620000';
    if v_tarif is null then raise exception 'SMETADAN_TASHQARI rollback: % asl matni _t2_fn_zaxira da yo''q', v_nom; end if;
    execute v_tarif;
    delete from public._t2_fn_zaxira where nom = v_nom || ':20261221620000';
  end loop;
end
$rb$;
drop function if exists public._t2_summa_paket_tashqari_v1(jsonb, jsonb);
drop function if exists public.t2_svod_yaxlit_tashqari_v1(bigint, bigint, bigint, boolean, integer, text);
alter table public.t2_svod_yaxlit drop column if exists smetadan_tashqari;
-- _t2_fn_zaxira jadvali boshqa migratsiyalar ham ishlatadi - o'chirilmaydi.
