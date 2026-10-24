import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
import { t } from '../../i18n/til';
import { koordinataMatni, togriKoordinata, TOSHKENT, type LatLng } from '../../lib/geo';

const marker = L.icon({ iconUrl: icon, shadowUrl: shadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });

export type XaritaObyekt = { id: number; nom: string; lat: number | null; lng: number | null; loyiha_id?: number | null };

function Sigdir({ nuqtalar }: { nuqtalar: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (nuqtalar.length === 1) map.setView(nuqtalar[0], 14);
    else if (nuqtalar.length > 1) map.fitBounds(L.latLngBounds(nuqtalar), { padding: [30, 30], maxZoom: 15 });
  }, [nuqtalar, map]);
  return null;
}

/** Kompaniya (yoki tanlangan loyiha) obyektlarini bitta xaritada ko'rsatadi.
 *  Koordinatasiz obyektlar xaritaga chiqmaydi - soni alohida aytiladi. */
export default function ObyektlarXaritasi(props: {
  obyektlar: XaritaObyekt[];
  loyihaNomi?: (id: number) => string | undefined;
  onOpen?: (o: XaritaObyekt) => void;
  onBelgila?: (o: XaritaObyekt) => void;
}) {
  const { joylangan, joysiz } = useMemo(() => {
    const j: XaritaObyekt[] = []; let s = 0;
    for (const o of props.obyektlar) {
      if (o.lat != null && o.lng != null && togriKoordinata(Number(o.lat), Number(o.lng))) j.push(o); else s++;
    }
    return { joylangan: j, joysiz: s };
  }, [props.obyektlar]);
  const nuqtalar = useMemo<LatLng[]>(() => joylangan.map((o) => [Number(o.lat), Number(o.lng)]), [joylangan]);

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-text-dim">
        {t('Xaritada')}: <b>{joylangan.length}</b>
        {joysiz > 0 && <> · <span className="text-amber-500">{t('lokatsiyasiz')}: {joysiz}</span></>}
      </p>
      <div className="h-[360px] rounded-xl overflow-hidden border border-border relative z-0">
        <MapContainer center={nuqtalar[0] ?? TOSHKENT} zoom={nuqtalar.length ? 12 : 7} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <Sigdir nuqtalar={nuqtalar} />
          {joylangan.map((o) => (
            <Marker key={o.id} position={[Number(o.lat), Number(o.lng)]} icon={marker}>
              <Popup>
                <div className="text-[12px] space-y-1">
                  <div className="font-semibold">{o.nom}</div>
                  {o.loyiha_id != null && props.loyihaNomi?.(o.loyiha_id) && <div>{props.loyihaNomi(o.loyiha_id)}</div>}
                  <div className="font-mono text-[11px]">{koordinataMatni([Number(o.lat), Number(o.lng)])}</div>
                  <div className="flex gap-2">
                    {props.onOpen && <button type="button" className="underline" onClick={() => props.onOpen!(o)}>{t('Ochish')}</button>}
                    {props.onBelgila && <button type="button" className="underline" onClick={() => props.onBelgila!(o)}>{t('Joyini o‘zgartirish')}</button>}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {!joylangan.length && <p className="text-[11px] text-text-mute">{t('Hali birorta obyektning lokatsiyasi belgilanmagan. Obyektni tahrirlab, xaritadan joyini belgilang.')}</p>}
    </div>
  );
}
