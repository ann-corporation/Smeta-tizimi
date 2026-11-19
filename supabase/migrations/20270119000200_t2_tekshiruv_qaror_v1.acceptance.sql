-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Talab: 20270119000100.
do $$
declare k bigint; o bigint; a bigint; x bigint; y bigint; akt bigint; rz bigint; bl bigint; ns bigint; tok text := 'ACCqarorTok0000000001'; n jsonb; tk bigint; f bigint; kx text := repeat('c', 64);
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC TX', 'ACCTX' || floor(random() * 1e6), true) returning id into k;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tp_' || floor(random() * 1e9), 'faol') returning id into a;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (a, k, 'pto', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_TX_', k) returning id into o;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_qx_' || floor(random() * 1e9), 'faol') returning id into x;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_qy_' || floor(random() * 1e9), 'faol') returning id into y;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_ACC_Q_BOLIM_', 900101) returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, tartib) values (o, k, rz, 'bl', '_ACC_Q_ISH_', 'm2', 10, 900102) returning id into bl;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'qoralama', date '2031-06-01', 'ACC-Q') returning id into akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm) values (akt, bl, o, k, 4);
  insert into public.t2_nashr (token, kompaniya_id, obyekt_id, turi, atama, mazmun_xesh, chiqargan_id) values (tok, k, o, 'f2', 'ACC', repeat('8', 64), a) returning id into ns;
  perform public.t2_f2_tekshiruv_bog_v1(a, tok, akt);
  perform public.t2_f2_tekshiruv_kod_ber_v1(a, tok, kx, 'T', 24); perform public.t2_f2_tekshiruv_kod_ol_v1(y, tok, kx);
  perform public.t2_f2_tekshiruv_saqla_v1(y, tok, bl, 'hujjat_kerak', 'lab kerak', 3, null, 'Laboratoriya xulosasi', false);
  select id into tk from public.t2_f2_tekshiruv_taklif order by id desc limit 1;

  -- 1. qaror: tekshiruvchi/begona qo'ya olmaydi; rad sababsiz rad; PTO qo'yadi
  if (public.t2_f2_tekshiruv_qaror_v1(y, tk, 'qabul', null)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 tekshiruvchi qaror qo''ydi'; end if;
  if (public.t2_f2_tekshiruv_qaror_v1(x, tk, 'qabul', null)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 begona qaror qo''ydi'; end if;
  if (public.t2_f2_tekshiruv_qaror_v1(a, tk, 'rad', ' ')->>'code') <> 'SABAB_KERAK' then raise exception 'ACC1 sababsiz rad'; end if;
  if (public.t2_f2_tekshiruv_qaror_v1(a, tk, 'yomon', null)->>'code') <> 'TALAB_NOTOGRI' then raise exception 'ACC1 qiymat'; end if;
  if (public.t2_f2_tekshiruv_qaror_v1(a, tk, 'rad', 'hajm to''g''ri')->>'ok') <> 'true' then raise exception 'ACC1 rad'; end if;
  n := public.t2_f2_tekshiruv_ochish_v1(y, tok);
  if n->'takliflar'->0->>'qaror' <> 'rad' or n->'takliflar'->0->>'qaror_sabab' <> 'hajm to''g''ri' then raise exception 'ACC1 tekshiruvchi sababni ko''rmadi %', n->'takliflar'; end if;
  if (public.t2_f2_tekshiruv_saqla_v1(y, tok, bl, 'qabul', null, null, null, null, false)->>'code') <> 'QAROR_QOYILGAN' then raise exception 'ACC1 qaror qoyilgan taklif ozgardi'; end if;
  perform public.t2_f2_tekshiruv_qaror_v1(a, tk, 'kutilmoqda', null);

  -- 2. hujjat biriktirish: faqat PTO; boshqa kompaniya/yo'q fayl rad
  insert into public.t2_hm_fayl (kompaniya_id, nom, yaratdi_id) values (k, '_acc_lab_.pdf', a) returning id into f;
  if (public.t2_f2_tekshiruv_hujjat_v1(y, tk, f)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 tekshiruvchi biriktirdi'; end if;
  if (public.t2_f2_tekshiruv_hujjat_v1(a, tk, -5)->>'code') <> 'FAYL_TOPILMADI' then raise exception 'ACC2 yoq fayl'; end if;
  if (public.t2_f2_tekshiruv_hujjat_v1(a, tk, f)->>'ok') <> 'true' then raise exception 'ACC2 biriktirish'; end if;
  if (public.t2_f2_tekshiruv_ochish_v1(y, tok)->'takliflar'->0->>'hujjat_bor') <> 'true' then raise exception 'ACC2 hujjat_bor'; end if;

  -- 3. akt takliflari (F-2 muharriri uchun): faqat a'zo; joriy hajm; versiya o'zgarsa eskirgan
  if (public.t2_f2_tekshiruv_akt_takliflari_v1(x, k, akt)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC3 begona'; end if;
  n := public.t2_f2_tekshiruv_akt_takliflari_v1(a, k, akt);
  if jsonb_array_length(n->'takliflar') <> 1 or (n->'takliflar'->0->>'joriy_hajm')::numeric <> 4 or (n->'takliflar'->0->>'eskirgan')::boolean then raise exception 'ACC3 royxat %', n; end if;
  update public.t2_akt set versiya = versiya + 1 where id = akt;
  if (public.t2_f2_tekshiruv_akt_takliflari_v1(a, k, akt)->'takliflar'->0->>'eskirgan')::boolean is not true then raise exception 'ACC3 eskirgan'; end if;
  raise notice 'ACC OK: t2_f2_tekshiruv_qaror';
end $$;