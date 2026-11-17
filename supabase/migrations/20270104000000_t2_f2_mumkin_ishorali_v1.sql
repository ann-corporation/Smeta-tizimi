-- F2 «olish mumkin» hajmi ISHORALI (MINUS qatorlar). Muammo: t2_qator_holat.f2_mumkin_hajm/f2_mumkin_summa = GREATEST(fakt - F2, 0),
-- shuning uchun smeta «normaga keltirish» (MINUS) qatorlari (masalan «ИСКЛЮЧИТЬ ЗАТ/ТРУДА», K=7) fakti bor bo'lsa ham f2_mumkin = 0
-- bo'lib, F2 qoralamaga avto kirmadi va f2_qoralama_tahrir.qosh_mumkindan «fakt qoldig'i yo'q» deb rad etardi.
-- Qoida (frontend lib/hisob-yadro/korinish.ts f2MumkinIshorali bilan AYNAN bir xil): asos = COALESCE(zamena reja hajmi, smeta hajmi);
--   asos < 0, yoki asos = 0/NULL va fakt yoki F2 manfiy  -> MINUS qator:  LEAST(fakt - F2, 0)   (manfiy; ishora saqlanadi)
--   aks holda (plyus)                                    ->               GREATEST(fakt - F2, 0)  (avvalgidek)
-- Plyus qatorlar uchun natija O'ZGARMAYDI. MINUS qator hech qachon plyusga o'tmaydi, F2 to'liq olingach 0.
-- Ikki sof SQL yordamchi (IMMUTABLE, SET yo'q => planner view ichiga inline qiladi, tezlik o'zgarmaydi).
-- Yamoq: mavjud ta'rif pg_get_viewdef / pg_get_functiondef dan olinib matn bo'yicha o'zgartiriladi (har almashtirish tekshiriladi) —
-- 20261221800000_t2_rs_fakt_hosila_v2 bilan bir xil usul (view matni qo'lda ko'chirilmaydi). Idempotent: qayta qo'llansa hech narsa qilmaydi.
-- Teskari: .rollback.sql. Qabul: .acceptance.sql (BEGIN..ROLLBACK ichida). BEGIN/COMMIT YO'Q — chaqiruvchi tranzaksiyasi.
-- Qo'shimcha yamoq: t2_ai_kontekst «Ф2 ФАКТдан oshdi» sanog'i MINUS qatorda soxta chiqmasin (abs bilan solishtirish).

create or replace function public._t2_f2_manfiy_v1(p_asos numeric, p_fakt numeric, p_f2 numeric)
returns boolean language sql immutable parallel safe as $$
  select case when coalesce(p_asos, 0) <> 0 then p_asos < 0
              else coalesce(p_fakt < 0, false) or coalesce(p_f2 < 0, false) end
$$;

create or replace function public._t2_f2_mumkin_v1(p_farq numeric, p_manfiy boolean)
returns numeric language sql immutable parallel safe as $$
  select case when coalesce(p_manfiy, false) then least(p_farq, 0::numeric) else greatest(p_farq, 0::numeric) end
$$;

comment on function public._t2_f2_manfiy_v1(numeric, numeric, numeric) is 'MINUS qator belgisi: asos (zamena reja yoki smeta hajmi) < 0; asos 0/NULL bo''lsa fakt yoki F2 manfiy. F2 mumkin ishorasi uchun.';
comment on function public._t2_f2_mumkin_v1(numeric, boolean) is 'F2 mumkin = fakt - F2, ishorali: MINUS qatorda LEAST(.,0), plyusda GREATEST(.,0). NULL farq -> 0 (eski GREATEST semantikasi).';

do $migr$
declare
  c_h_view constant text := 'GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm';
  c_s_view constant text := 'GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa';
  c_h_fn   constant text := 'GREATEST((e.fakt_hajm - d.f2_hajm), (0)::numeric) AS f2_mumkin_hajm';
  c_s_fn   constant text := 'GREATEST((e.fakt_summa - d.f2_summa_malum), (0)::numeric) AS f2_mumkin_summa';
  c_man    constant text := 'public._t2_f2_manfiy_v1(COALESCE(zr.v, q.hajm), e.fakt_hajm, d.f2_hajm)';
  n_h      constant text := 'public._t2_f2_mumkin_v1(e.fakt_hajm - d.f2_hajm, ' || c_man || ') AS f2_mumkin_hajm';
  n_s      constant text := 'public._t2_f2_mumkin_v1(e.fakt_summa - d.f2_summa_malum, ' || c_man || ') AS f2_mumkin_summa';
  v_def text; v_cnt int;
begin
  -- 1) funksiya _t2_qator_holat_v2(bigint[]) (obyekt paketi / tezlik yo'li).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = to_regprocedure('public._t2_qator_holat_v2(bigint[])');
  if v_def is null then raise exception 'F2_MUMKIN_ISHORALI: _t2_qator_holat_v2 topilmadi'; end if;
  if position('_t2_f2_mumkin_v1(' in v_def) = 0 then
    v_cnt := (length(v_def) - length(replace(v_def, c_h_fn, ''))) / length(c_h_fn);
    if v_cnt <> 1 then raise exception 'F2_MUMKIN_ISHORALI: funksiyada f2_mumkin_hajm ifodasi % marta (kutilgan 1)', v_cnt; end if;
    v_cnt := (length(v_def) - length(replace(v_def, c_s_fn, ''))) / length(c_s_fn);
    if v_cnt <> 1 then raise exception 'F2_MUMKIN_ISHORALI: funksiyada f2_mumkin_summa ifodasi % marta (kutilgan 1)', v_cnt; end if;
    execute replace(replace(v_def, c_h_fn, n_h), c_s_fn, n_s);
  end if;

  -- 2) view t2_qator_holat.
  v_def := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  if position('_t2_f2_mumkin_v1(' in v_def) = 0 then
    v_cnt := (length(v_def) - length(replace(v_def, c_h_view, ''))) / length(c_h_view);
    if v_cnt <> 1 then raise exception 'F2_MUMKIN_ISHORALI: view da f2_mumkin_hajm ifodasi % marta (kutilgan 1)', v_cnt; end if;
    v_cnt := (length(v_def) - length(replace(v_def, c_s_view, ''))) / length(c_s_view);
    if v_cnt <> 1 then raise exception 'F2_MUMKIN_ISHORALI: view da f2_mumkin_summa ifodasi % marta (kutilgan 1)', v_cnt; end if;
    execute 'CREATE OR REPLACE VIEW public.t2_qator_holat AS ' || rtrim(replace(replace(v_def, c_h_view, n_h), c_s_view, n_s), E'; \n');
  end if;

  -- 3) t2_ai_kontekst: «F2 > fakt» sanog'i ishorasiz (modul bo'yicha).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 't2_ai_kontekst' and p.pronargs = 1;
  if v_def is not null and position('f2_hajm > fakt_hajm + 0.001' in v_def) > 0 then
    v_cnt := (length(v_def) - length(replace(v_def, 'f2_hajm > fakt_hajm + 0.001', ''))) / length('f2_hajm > fakt_hajm + 0.001');
    if v_cnt <> 1 then raise exception 'F2_MUMKIN_ISHORALI: t2_ai_kontekst da F2>fakt sharti % marta (kutilgan 1)', v_cnt; end if;
    execute replace(v_def, 'f2_hajm > fakt_hajm + 0.001', 'abs(f2_hajm) > abs(fakt_hajm) + 0.001');
  end if;
end
$migr$;
