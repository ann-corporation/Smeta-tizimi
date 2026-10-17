-- t2_narx_tajriba_contract: narx tanlovi tajribasi tizim darajasida; begona kompaniya yozolmaydi/o'qiyolmaydi; kuzatuvchi yozolmaydi;
-- boshqa kompaniyaning narx raqamlari < 3 kompaniyada chiqmaydi; yuklangan smetalarga moslik hukmi. Rollback.
do $t$
declare k1 bigint; k2 bigint; ub bigint; uk bigint; uo bigint; r jsonb; x jsonb; ok int := 0; bad text := '';
  rk text := 'АРМАТУРААЗООСД10ТЕСТ' || floor(random()*1e6)::text || '|Т';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('NTA' || floor(random()*1e9)::text, 'Tajriba A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('NTB' || floor(random()*1e9)::text, 'Tajriba B', true) returning id into k2;
  insert into t2_foydalanuvchi(login) values ('nt_boss_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('nt_kuz_' || k1) returning id into uk;
  insert into t2_foydalanuvchi(login) values ('nt_other_' || k1) returning id into uo;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k1, uk, 'kuzatuvchi', 'faol'), (k2, uo, 'boss', 'faol');

  r := t2_narx_tajriba_yoz_v1(ub, k1, jsonb_build_array(
    jsonb_build_object('resurs', rk, 'manba', 'АРМАТУРАА500СД10|Т', 'tur', 'katalog', 'narx', '8100000', 'holat', 'qabul'),
    jsonb_build_object('resurs', rk, 'manba', 'АРМАТУРАА500СД10|Т', 'tur', 'katalog', 'narx', '8100000', 'holat', 'qabul'),
    jsonb_build_object('resurs', rk, 'manba', 'АРМАТУРАА240Д10|Т', 'tur', 'katalog', 'holat', 'rad'),
    jsonb_build_object('resurs', rk, 'manba', 'X|Т', 'tur', 'noma''lum', 'holat', 'qabul')));
  if (r->>'yozildi')::int = 3 then ok := ok + 1; else bad := bad || ' yozish-filtr' || r::text; end if;
  r := t2_narx_tajriba_yoz_v1(uk, k1, '[]'::jsonb);
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' kuzatuvchi-rad'; end if;
  r := t2_narx_tajriba_yoz_v1(uo, k1, '[]'::jsonb);
  if not (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' begona-yozolmaydi'; end if;
  r := t2_narx_tajriba_v1(uo, k1, '[]'::jsonb);
  if not (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' begona-oqiyolmaydi'; end if;

  -- Tizim darajasi: k2 a'zosi k1 smetachilarining tanlovini ko'radi (sonlar, kompaniya nomisiz).
  r := t2_narx_tajriba_v1(uo, k2, jsonb_build_array(jsonb_build_object('resurs', rk)));
  x := r->'resurslar'->rk->'tanlovlar';
  if x->0->>'manba' = 'АРМАТУРАА500СД10|Т' and (x->0->>'qabul')::int = 2 and (x->0->>'kompaniya_soni')::int = 1
     and exists (select 1 from jsonb_array_elements(x) e where e->>'manba' = 'АРМАТУРАА240Д10|Т' and (e->>'rad')::int = 1) then ok := ok + 1;
  else bad := bad || ' tizim-tanlov' || coalesce(x::text, 'null'); end if;
  if r::text not like '%Tajriba%' and r::text not like '%' || k1 || '%' then ok := ok + 1; else bad := bad || ' kompaniya-sizmaydi'; end if;

  -- Yuklangan smetalar bo'yicha moslik (real ma'lumot: avtopogruzchik 5 t, 3 kompaniya).
  r := t2_narx_tajriba_v1(ub, k1, jsonb_build_array(jsonb_build_object('resurs', 'АВТОПОГРУЗЧИКИ5Т|МАШЧ', 'narx', '150000')));
  if (r->'resurslar'->'АВТОПОГРУЗЧИКИ5Т|МАШЧ'->>'mos')::boolean and (r->'resurslar'->'АВТОПОГРУЗЧИКИ5Т|МАШЧ'->>'kuzatuv')::int >= 5 then ok := ok + 1; else bad := bad || ' mos-ha' || r::text; end if;
  r := t2_narx_tajriba_v1(ub, k1, jsonb_build_array(jsonb_build_object('resurs', 'АВТОПОГРУЗЧИКИ5Т|МАШЧ', 'narx', '400000')));
  if not (r->'resurslar'->'АВТОПОГРУЗЧИКИ5Т|МАШЧ'->>'mos')::boolean then ok := ok + 1; else bad := bad || ' mos-yoq'; end if;
  -- Narx so'ralmasa — hukm yo'q; ≥3 kompaniyada mediana bor.
  r := t2_narx_tajriba_v1(ub, k1, jsonb_build_array(jsonb_build_object('resurs', 'АВТОПОГРУЗЧИКИ5Т|МАШЧ')));
  if not (r->'resurslar'->'АВТОПОГРУЗЧИКИ5Т|МАШЧ' ? 'mos') and (r->'resurslar'->'АВТОПОГРУЗЧИКИ5Т|МАШЧ' ? 'mediana') then ok := ok + 1; else bad := bad || ' hukmsiz'; end if;
  -- Hech kim ko'rmagan resurs — bo'sh.
  r := t2_narx_tajriba_v1(ub, k1, jsonb_build_array(jsonb_build_object('resurs', 'YOQRESURS123|Т', 'narx', '1')));
  if r->'resurslar' = '{}'::jsonb then ok := ok + 1; else bad := bad || ' bosh'; end if;
  raise exception 'T2_NARX_TAJRIBA_RESULT ok=% bad=[%]', ok, bad;
end $t$;
