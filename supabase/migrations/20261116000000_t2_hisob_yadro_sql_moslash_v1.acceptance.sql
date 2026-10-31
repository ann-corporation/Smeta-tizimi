-- T2_HISOB_YADRO_SQL_MOSLASH v1 — qabul tekshiruvi (faqat o'qish, sintetik sonlar).
-- Kutilgan qiymatlar TS hisob yadrosidan (frontend/src/lib/hisob-yadro: kaskad / hisob / kategoriyaKf) olingan.
do $$
declare
  nk jsonb := public.t2_nakrutka_default_v1();
  h jsonb; v jsonb; p jsonb; kf jsonb;
  f text;
begin
  -- 0. Tuzilma: yangi funksiyalar bor; kaskadda bo'lish yo'q (× 0.01), har qadam yaxlitlanadi.
  if to_regprocedure('public._t2_nakrutka_kaskad_v1(jsonb,jsonb,boolean)') is null
     or to_regprocedure('public._t2_kaskad_yakun_v1(jsonb,numeric,numeric,numeric,numeric,jsonb)') is null
     or to_regprocedure('public.t2_nakrutka_yaxlit_qosh_v2(jsonb,jsonb,jsonb)') is null then
    raise exception 'ACCEPT_FAIL: yangi funksiyalar yo''q';
  end if;
  f := pg_get_functiondef('public._t2_nakrutka_kaskad_v1(jsonb,jsonb,boolean)'::regprocedure);
  if f ~ '/\s*100' or f !~ 'skl_mk' then raise exception 'ACCEPT_FAIL: kaskad ta''rifi kutilgandek emas'; end if;
  if pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass) !~ 't2_nakrutka_yaxlit_qosh_v2'
     or pg_get_functiondef('public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint)'::regprocedure) !~ 't2_nakrutka_yaxlit_qosh_v2' then
    raise exception 'ACCEPT_FAIL: obyekt nakrutka v2 ga o''tmagan';
  end if;

  -- 1. Kaskad har qadam ROUND 2 (yadro kaskad(serverCatsdan(A), standartPodval(sukut)).qiymat).
  h := public.t2_nakrutka_hisobla_v1('{"chel":123456789.01,"mash":23456789.12,"mat":98765432.1,"ob":11111111.11,"mk":2222222.22,"kab":3333333.33,"bez":4444444.44}'::jsonb, nk);
  if (h->>'pryamye')::numeric is distinct from 256790121.34 or (h->>'tr_mat')::numeric is distinct from 4771604.94
     or (h->>'skl_mk')::numeric is distinct from 16666.67 or (h->>'skl_mat')::numeric is distinct from 1841975.31 + 16666.67
     or (h->>'tr_kab')::numeric is distinct from 50000 or (h->>'itogo1')::numeric is distinct from 252359257.15
     or (h->>'prochie')::numeric is distinct from 45424666.29 or (h->>'itogo2')::numeric is distinct from 297783923.44
     or (h->>'tr_ob')::numeric is distinct from 222222.22 or (h->>'zag_ob')::numeric is distinct from 133333.33
     or (h->>'itogo3')::numeric is distinct from 309250590.10 or (h->>'strax')::numeric is distinct from 989601.89
     or (h->>'itogo4')::numeric is distinct from 310240191.99 or (h->>'nds')::numeric is distinct from 37228823.04
     or (h->>'vsego')::numeric is distinct from 347469015.03 then
    raise exception 'ACCEPT_FAIL: kaskad != yadro: %', h;
  end if;

  -- 2. Kf yaxlitlanmagan (yadro podvalKf, aniq o'nlik).
  kf := public.t2_nakrutka_koef_jadval_v1(nk);
  if (kf->>'ЧЕЛ')::numeric is distinct from 1.32582912 or (kf->>'МАШ')::numeric is distinct from 1.32582912 or (kf->>'МАТ')::numeric is distinct from 1.4186371584
     or (kf->>'ОБ')::numeric is distinct from 1.159538688 or (kf->>'КАБ')::numeric is distinct from 1.3722331392 or (kf->>'М/К')::numeric is distinct from 1.4020642944
     or (kf->>'БЕЗСКЛАД')::numeric is distinct from 1.392120576 then
    raise exception 'ACCEPT_FAIL: Kf != yadro: %', kf;
  end if;

  -- 3. Obyekt svod (v2 = yadro hisob()): svod summasi 2240 QQS bilan, НДС dan keyin aynan.
  h := public.t2_nakrutka_hisobla_v1('{"chel":1000}'::jsonb, nk);
  v := public.t2_nakrutka_yaxlit_qosh_v2(h, '{"qqssiz":2000,"barglar":1000,"bolimlar":[{"svod_summa":2240,"qqssiz":2000}]}'::jsonb, nk);
  if (v->>'itogo4')::numeric is distinct from 3183.78 or (v->>'nds')::numeric is distinct from 382.05 or (v->>'vsego')::numeric is distinct from 3565.83
     or (v->>'vsego')::numeric is distinct from (h->>'vsego')::numeric + 2240 or (v->>'pryamye')::numeric is distinct from 2000
     or (v->>'yaxlit')::numeric is distinct from 2000 or (v->>'ishlar_itogo4')::numeric is distinct from (h->>'itogo4')::numeric then
    raise exception 'ACCEPT_FAIL: v2 (svod summasi) != yadro: %', v;
  end if;
  -- 3b. Svod summasiz qism (500,10) — round(× 1,12) НДС dan keyin (yadro hisob()).
  v := public.t2_nakrutka_yaxlit_qosh_v2(h, '{"qqssiz":2500.10,"barglar":1300,"bolimlar":[{"svod_summa":2240,"qqssiz":2000},{"svod_summa":null,"qqssiz":500.10}]}'::jsonb, nk);
  if (v->>'itogo4')::numeric is distinct from 3683.88 or (v->>'nds')::numeric is distinct from 442.06 or (v->>'vsego')::numeric is distinct from 4125.94 then
    raise exception 'ACCEPT_FAIL: v2 (qolgan) != yadro: %', v;
  end if;
  -- 3c. Yaxlitsiz — o'zgarishsiz.
  if public.t2_nakrutka_yaxlit_qosh_v2(h, null, nk) is distinct from h then raise exception 'ACCEPT_FAIL: v2 null yaxlit'; end if;

  -- 4. Paket (yadro kaskad: nomalumQism + 'qqssiz_ustamadan_keyin' + 'qqsdan_keyin').
  p := public._t2_summa_paket_hisob_v1('{"chel":1000,"mat":2000,"nomalum":300.004,"subpudrat":150.55,"ustamasiz":0,"svod":900,"svod_qqssiz":2500.10,"svod_qqs_bilan":2240,"svod_summa_qqssiz":2000,"svod_summa_soni":1}'::jsonb, nk);
  if (p->>'ustamali')::numeric is distinct from 6667.71 or (p->>'qqs')::numeric is distinct from 800.13 or (p->>'qqs_bilan')::numeric is distinct from 7467.84
     or (p->'ustama'->>'ishlar_itogo4')::numeric is distinct from 4667.71 or (p->'ustama'->>'ishlar_nds')::numeric is distinct from 560.13
     or (p->>'ustamasiz')::numeric is distinct from round(1000 + 2000 + 900 + 150.55 + 300.004, 2)
     or (p->>'ustamasiz_qism')::numeric is distinct from round(2500.10 + 150.55 + 300.004, 2)
     or (p->>'qqs_bilan')::numeric - (p->>'ustamali')::numeric is distinct from (p->>'qqs')::numeric then
    raise exception 'ACCEPT_FAIL: paket != yadro: %', p;
  end if;
  -- 4b. Eski agg shakli (svod_summa_* kalitlarisiz) — hammasi QQS siz, QQS dan oldin (avvalgi ma'no) va shakl o'sha.
  p := public._t2_summa_paket_hisob_v1('{"chel":1000,"nomalum":200}'::jsonb, nk);
  h := public.t2_nakrutka_hisobla_v1('{"chel":1000}'::jsonb, nk);
  if (p->>'ustamali')::numeric is distinct from round((h->>'itogo4')::numeric + 200, 2)
     or (p->>'qqs')::numeric is distinct from round(round((h->>'itogo4')::numeric + 200, 2) * 0.12, 2)
     or not (p ?& array['qqs_bilan','qqs','ustamali','ustamasiz','qqs_foiz','ustamasiz_qism','kesim','soat','subpudratchilar','narxsiz_soni','qator_soni','ustama']) then
    raise exception 'ACCEPT_FAIL: paket (kat noma''lum) yoki shakl: %', p;
  end if;
  -- 4c. Bo'sh paket (F2 ustamali sukut yo'li).
  p := public._t2_summa_paket_hisob_v1('{}'::jsonb, nk);
  if (p->>'qqs_bilan')::numeric is distinct from 0 or (p->>'ustamali')::numeric is distinct from 0 then raise exception 'ACCEPT_FAIL: bo''sh paket: %', p; end if;

  -- 5. v1 (avvalgi ma'no: QQS siz qism QQS dan oldin) va null himoyasi.
  v := public.t2_nakrutka_yaxlit_qosh_v1(h, 2000, 1000, nk);
  if (v->>'itogo4')::numeric is distinct from 3183.78 or (v->>'nds')::numeric is distinct from round(3183.78 * 0.12, 2) or (v->>'pryamye')::numeric is distinct from 2000 then
    raise exception 'ACCEPT_FAIL: v1: %', v;
  end if;
  if public.t2_nakrutka_yaxlit_qosh_v1('{"itogo4":1,"vsego":2}'::jsonb, null, 5, '{}'::jsonb) is distinct from '{"itogo4":1,"vsego":2}'::jsonb then
    raise exception 'ACCEPT_FAIL: v1 null';
  end if;

  -- 6. Yaxlitlash — yarmi noldan uzoqqa (yadro yaxlit2): 0,125 → 0,13; −0,125 → −0,13.
  if public._t2_r2_v1(0.125, true) is distinct from 0.13 or public._t2_r2_v1(-0.125, true) is distinct from -0.13 or public._t2_r2_v1(0.125, false) is distinct from 0.125 then
    raise exception 'ACCEPT_FAIL: yaxlitlash';
  end if;
  raise notice 'T2_HISOB_YADRO_SQL_MOSLASH OK';
end $$;
