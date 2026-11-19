-- Qabul sinovi: FAQAT ROLLBACK ichida (migratsiyaning o'z begin/commit i yo'q). Xato: raise exception 'ACC: ...'.
do $$
declare k bigint; o bigint; a bigint; x bigint; y bigint; akt bigint; rz bigint; bl bigint; bl2 bigint; ns bigint; tok text := 'ACCtekshiruvTok0000001'; n jsonb; w text := 'ACCtekshiruvKod';
        kx text := repeat('a', 64); kx2 text := repeat('b', 64);
begin
  select m.kompaniya_id, m.foydalanuvchi_id into k, a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.holat = 'faol' order by m.kompaniya_id limit 1;
  select id into o from public.t2_obyekt where kompaniya_id = k order by id limit 1;
  if o is null then raise exception 'ACC: sinov uchun obyekt topilmadi'; end if;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_tx_' || floor(random() * 1e9), 'faol') returning id into x;   -- begona (kompaniyasiz, grantsiz)
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_ty_' || floor(random() * 1e9), 'faol') returning id into y;   -- kod bilan kiradigan
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_ACC_BOLIM_', 900001) returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, tartib) values (o, k, rz, 'bl', '_ACC_ISH_1_', 'm2', 10, 900002) returning id into bl;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, tartib) values (o, k, rz, 'bl', '_ACC_ISH_2_', 'm2', 5, 900003) returning id into bl2;
  insert into public.t2_akt (kompaniya_id, obyekt_id, tur, holat, oy, raqam) values (k, o, 'f2', 'qoralama', date '2031-05-01', 'ACC-TX') returning id into akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm) values (akt, bl, o, k, 4);
  insert into public.t2_nashr (token, kompaniya_id, obyekt_id, turi, atama, mazmun_xesh, chiqargan_id) values (tok, k, o, 'f2', 'ACC', repeat('7', 64), a) returning id into ns;

  -- 1. bog': a'zo bog'laydi; begona rad; takror - mavjud; F-2 bo'lmagan akt rad
  if (public.t2_tekshiruv_bog_v1(x, tok, akt)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 begona bog'' qila oldi'; end if;
  n := public.t2_tekshiruv_bog_v1(a, tok, akt);
  if n->>'ok' <> 'true' or (n->>'yangi')::boolean is not true then raise exception 'ACC1 bog'' %', n; end if;
  if (public.t2_tekshiruv_bog_v1(a, tok, akt)->>'yangi')::boolean then raise exception 'ACC1 takror yangi'; end if;
  if (public.t2_tekshiruv_bog_v1(a, 'xxxxxxxxxxxxxxxxxxxxxx', akt)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 noma''lum token'; end if;

  -- 2. ruxsat: begona rad; a'zo 'pto'; qatorlar tartib bilan bolim nomi
  if (public.t2_tekshiruv_ochish_v1(x, tok)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 begona ochdi'; end if;
  if (public.t2_tekshiruv_ochish_v1(a, 'short')->>'code') <> 'TOPILMADI' then raise exception 'ACC2 shakl'; end if;
  n := public.t2_tekshiruv_ochish_v1(a, tok);
  if n->>'rol' <> 'pto' or jsonb_array_length(n->'qatorlar') <> 1 or n->'qatorlar'->0->>'bolim' <> '_ACC_BOLIM_' or (n->'akt'->>'eskirgan')::boolean then raise exception 'ACC2 ochish %', n; end if;
  if n::text ~ '(summa|narx)' then raise exception 'ACC2 pul chiqib ketdi'; end if;

  -- 3. begona taklif yoza olmaydi; kod berish faqat PTO; kod bilan kirgan tekshiruvchi yozadi; boshqa odam kodni ishlata olmaydi
  if (public.t2_tekshiruv_saqla_v1(x, tok, bl, 'qabul', null, null, null, null, false)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC3 begona yozdi'; end if;
  if (public.t2_tekshiruv_kod_ber_v1(x, tok, kx, 'T', 24)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC3 begona kod berdi'; end if;
  if (public.t2_tekshiruv_kod_ber_v1(a, tok, 'zz', 'T', 24)->>'code') <> 'TALAB_NOTOGRI' then raise exception 'ACC3 kod shakli'; end if;
  if (public.t2_tekshiruv_kod_ber_v1(a, tok, kx, 'Tekshiruvchi', 24)->>'ok') <> 'true' then raise exception 'ACC3 kod ber'; end if;
  if (public.t2_tekshiruv_kod_ol_v1(y, tok, kx2)->>'code') <> 'KOD_YAROQSIZ' then raise exception 'ACC3 noto''g''ri kod'; end if;
  if (public.t2_tekshiruv_kod_ol_v1(y, tok, kx)->>'ok') <> 'true' then raise exception 'ACC3 kod ol'; end if;
  if (public.t2_tekshiruv_kod_ol_v1(x, tok, kx)->>'code') <> 'KOD_ISHLATILGAN' then raise exception 'ACC3 kod ikki marta'; end if;
  if public._t2_tekshiruv_rol_v1(y, (select id from public.t2_tekshiruv_bog where nashr_id = ns)) <> 'tekshiruvchi' then raise exception 'ACC3 rol'; end if;

  -- 4. taklif: noto'g'ri qator rad; hujjat_kerak hujjat_turi siz rad; to'g'ri saqlanadi; pto hamma ko'radi, tekshiruvchi faqat o'zini
  if (public.t2_tekshiruv_saqla_v1(y, tok, bl2, 'qabul', null, null, null, null, false)->>'code') <> 'QATOR_NOTOGRI' then raise exception 'ACC4 F-2 da yo''q qator'; end if;
  if (public.t2_tekshiruv_saqla_v1(y, tok, bl, 'hujjat_kerak', null, null, null, null, false)->>'code') <> 'TALAB_NOTOGRI' then raise exception 'ACC4 hujjat turi'; end if;
  if (public.t2_tekshiruv_saqla_v1(y, tok, bl, 'hajm_notogri', 'loyiha bilan mos emas', 3.5, 'qizil', null, false)->>'ok') <> 'true' then raise exception 'ACC4 saqla'; end if;
  if (public.t2_tekshiruv_saqla_v1(y, tok, bl2, null, 'qo''shish kerak', null, null, null, true)->>'ok') <> 'true' then raise exception 'ACC4 qosh taklifi'; end if;   -- bl2 smetada bor, F-2 da yo'q
  n := public.t2_tekshiruv_ochish_v1(a, tok);
  if jsonb_array_length(n->'takliflar') <> 2 then raise exception 'ACC4 pto takliflar %', n->'takliflar'; end if;
  n := public.t2_tekshiruv_ochish_v1(y, tok);
  if n->>'rol' <> 'tekshiruvchi' or jsonb_array_length(n->'takliflar') <> 2 then raise exception 'ACC4 tekshiruvchi %', n; end if;

  -- 5. qidirish: F-2 dagi qator chiqmaydi, F-2 da yo'q qator chiqadi; pul yo'q
  n := public.t2_tekshiruv_qidir_v1(y, tok, '_ACC_ISH');
  if jsonb_array_length(n->'qatorlar') <> 1 or n->'qatorlar'->0->>'nom' <> '_ACC_ISH_2_' then raise exception 'ACC5 qidir %', n; end if;
  if (public.t2_tekshiruv_qidir_v1(x, tok, '_ACC_ISH')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC5 begona qidirdi'; end if;

  -- 6. holat; bo'sh taklif o'chiriladi
  if (public.t2_tekshiruv_holat_v1(y, tok, 'qaytarildi', 'Hajmlar mos emas')->>'holat') <> 'qaytarildi' then raise exception 'ACC6 holat'; end if;
  if (public.t2_tekshiruv_holat_v1(y, tok, 'yomon', null)->>'code') <> 'TALAB_NOTOGRI' then raise exception 'ACC6 holat qiymati'; end if;
  if (public.t2_tekshiruv_saqla_v1(y, tok, bl, null, null, null, null, null, false)->>'ochirildi') <> 'true' then raise exception 'ACC6 o''chirish'; end if;

  -- 7. versiya bog'lanishi: F-2 o'zgarsa (versiya oshsa) panel "eskirgan" deydi
  update public.t2_akt set versiya = versiya + 1 where id = akt;
  if (public.t2_tekshiruv_ochish_v1(a, tok)->'akt'->>'eskirgan')::boolean is not true then raise exception 'ACC7 eskirgan belgisi'; end if;
  raise notice 'ACC OK: t2_tekshiruv';
end $$;

