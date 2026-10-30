-- t2_rollup: faqat summasi haqiqatan o'zgargan bl/rz qatorlarini yangilaydi.
-- Avval har tahrirda obyektdagi BARCHA bl/rz qatorlari UPDATE qilinardi (yangilandi=now()) -> versiya hammasida oshardi:
-- ikkinchi tahrirda soxta «boshqa foydalanuvchi o'zgartirdi» ziddiyati va katta obyektda minglab ortiqcha yozuv.
-- Natija (summa qiymatlari) aynan bir xil.
CREATE OR REPLACE FUNCTION public.t2_rollup(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_jami numeric; v_toliq boolean; v_miss int; v_yetim int;
begin
  perform t2_manba_belgila('rollup');

  update t2_qator b set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur='rs' and ota_id is not null
        group by ota_id) c
  where b.id = c.ota_id and b.tur = 'bl'
    and b.summa is distinct from c.jami;

  update t2_qator b set summa = null
  where b.obyekt_id = p_obyekt_id and b.tur='bl'
    and b.summa is not null
    and not exists (select 1 from t2_qator c where c.ota_id = b.id);

  /* ⚠️ 'rs' SHU YERDA QO'SHILDI — busiz rz ostidagi yakka resurs
     jimgina yo'qolardi. */
  update t2_qator r set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur in ('bl','mat','ob','rs')
          and ota_id is not null
        group by ota_id) c
  where r.id = c.ota_id and r.tur = 'rz'
    and r.summa is distinct from c.jami;

  select sum(summa) into v_jami
  from t2_qator where obyekt_id = p_obyekt_id and tur = 'rz' and versiya_holat = 'faol';

  select count(*) into v_miss
  from t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and narx is null and versiya_holat = 'faol';

  /* ⚠️ YETIM QATOR NAZORATI: otasi yo'q (rz emas) qator jamiga
     KIRMAYDI. Soni javobda qaytadi — jim qolmasin. */
  select count(*) into v_yetim
  from t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur <> 'rz' and q.ota_id is null;

  v_toliq := (v_miss = 0);

  return jsonb_build_object('ok', true, 'jami', v_jami, 'toliq', v_toliq,
    'narxsiz_qator', v_miss, 'yetim_qator', v_yetim,
    'izoh', case when v_toliq then 'Barcha qator narxlangan — jami ishonchli.'
                 else v_miss || ' qatorda narx topilmadi. JAMI TO''LIQ EMAS — ' ||
                      'bu raqam ustida moliyaviy qaror qabul qilmang.' end ||
           case when v_yetim > 0 then ' ⚠️ ' || v_yetim ||
                     ' ta otasiz qator jamiga KIRMADI.' else '' end);
end $function$;
