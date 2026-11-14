-- AKT_PODVAL_SVODSIZ_V1 (2026-11-14): akt O'Z podvaliga (t2_akt_podval) ega bo'lsa, uning qatorlari svod/yaxlit qayta tasnifidan chiqariladi.
--
-- Muammo: Stella F-2 №27 (imzolangan) butun hujjat bitta oddiy podval bilan hisoblangan (PROCHIE 18 % ITOGO ga, material ham kiradi;
-- keyin QQS). Tizimda esa shu qatorlar svod/yaxlit bo'lim (t2_svod_yaxlit) ichida; _t2_summa_agg_v1 svod bo'limidagi MAT/transport qatorlarini
-- 'svod' turiga o'tkazadi va ustama faqat CHEL/MASH ga qo'llanadi -> hujjatdan 0.18 * (svod ichidagi MAT) kam chiqadi.
-- Egasi qoidasi: tasdiqlangan F-2 tizimda imzolangan hujjat bilan tiyinigacha, har F-2 o'z podvali bilan.
--
-- Yechim: _t2_summa_agg_v1 (7 arg) da p_podval = 'bor' (faqat _t2_summa_paket_v1 aktning o'z podvali tarmog'i chaqiradi) bo'lsa
-- (faqat 'svod' turidagi bo'lim qatorlari uchun; 'ustamasiz' belgilar - bojxona, shef-montaj, ekspert - va subpudrat o'zgarmaydi, doim ustamasiz) ustama_bor = true -> qator oddiy kategoriyasi (kat) bo'yicha, hujjat podvali nk bilan hisoblanadi. 'siz' / 'hammasi' o'zgarmaydi
-- (podvalsiz aktlar, masalan bronza №24/25, svod qoidasi bilan hozirgidek). Fakt o'lchovi podvalsiz — ta'sir qilmaydi.
-- Kesh 'f2' va 'aktlar' bir manbadan (paket) — izchil.
--
-- Funksiya matni pg_get_functiondef + replace bilan yamaladi (almashtirish soni tekshiriladi — drift bo'lsa XATO, hech narsa yozilmaydi).
-- Asl matn _t2_fn_zaxira da — rollback shu yerdan tiklaydi. Migratsiyani EGASI qo'llaydi.

create table if not exists public._t2_fn_zaxira (
  nom text primary key,
  tarif text not null,
  yozildi timestamptz not null default now()
);
alter table public._t2_fn_zaxira enable row level security;
revoke all on public._t2_fn_zaxira from public, anon, authenticated;

do $mig$
declare
  v_oid oid; v_eski text; v_yangi text; n int;
  v_a text := $s$select (p_olchov in ('f2', 'f2_qoralama', 'aktlar', 'fakt') and b.turi = 'svod'$s$;
  v_b text := $s$select (coalesce(p_podval, 'hammasi') = 'bor' and b.turi = 'svod' or p_olchov in ('f2', 'f2_qoralama', 'aktlar', 'fakt') and b.turi = 'svod'$s$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = '_t2_summa_agg_v1' and p.pronargs = 7;
  if v_oid is null then raise exception 'AKT_PODVAL_SVODSIZ: _t2_summa_agg_v1 (7 arg) topilmadi'; end if;
  v_eski := pg_get_functiondef(v_oid);
  if v_eski like '%coalesce(p_podval, ''hammasi'') = ''bor'' and b.turi = ''svod'' or p_olchov in%' then
    raise notice 'AKT_PODVAL_SVODSIZ: allaqachon yamalgan - o''tkazildi';
    return;
  end if;
  n := (length(v_eski) - length(replace(v_eski, v_a, ''))) / length(v_a);
  if n <> 1 then raise exception 'AKT_PODVAL_SVODSIZ: ustama_bor sharti %-marta topildi (kutilgan 1)', n; end if;
  insert into public._t2_fn_zaxira (nom, tarif) values ('_t2_summa_agg_v1:20261219200000', v_eski) on conflict (nom) do nothing;
  v_yangi := replace(v_eski, v_a, v_b);
  execute v_yangi;
end
$mig$;

