-- T2-AKT-KALIT-BEKORSIZ (egasi 2026-10-21: «Fast Food 2-etaj №1» F2 xato o'tgan, bekor qilindi, lekin to'g'risini
-- qayta kiritib bo'lmaydi — eskisini ko'rsatadi). Sabab: t2_akt_kalit_uniq (obyekt+tur+oy+raqam) BEKOR qilingan
-- aktni ham band deb hisoblaydi. Bekor qilingan akt tarix sifatida o'z joyida qoladi (o'chirilmaydi),
-- lekin shu davr uchun yangi (to'g'ri) akt yaratishga to'sqinlik qilmaydi. Faol (bekor bo'lmagan) aktlar uchun
-- qoida o'zgarmaydi: obyekt+tur+oy+raqam bo'yicha bittadan ortiq faol akt bo'lmaydi.
-- Indeks nomi saqlanadi — sb-yoz.ts f2AktRaqamZiddiyati() xabarni shu nom bo'yicha taniydi.
begin;
drop index if exists public.t2_akt_kalit_uniq;
create unique index t2_akt_kalit_uniq on public.t2_akt using btree (obyekt_id, tur, oy, coalesce(raqam, ''::text))
  where holat <> 'bekor';
commit;
