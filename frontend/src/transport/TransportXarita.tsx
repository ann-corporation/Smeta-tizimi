import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
import { t } from '../i18n/til';
import { TOSHKENT } from '../lib/geo';
import type { Nuqta } from '../lib/transport/geo';

const pin = L.icon({ iconUrl: icon, shadowUrl: shadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
const raqamIkon = (n: number, rang: string) => L.divIcon({
  className: '', iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:50%;background:${rang};color:#fff;font:600 12px/26px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`,
});

export type XaritaJoy = { id: number; nom: string; lat: number; lng: number };
export type XaritaMarshrut = { id: number; nom: string; rang: string; nuqtalar: Array<Nuqta & { nom: string; holat?: string }>; chiziq: Array<[number, number]> | null };

function Sigdir({ nuqtalar }: { nuqtalar: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => { if (nuqtalar.length > 1) map.fitBounds(L.latLngBounds(nuqtalar), { padding: [30, 30], maxZoom: 15 }); else if (nuqtalar.length === 1) map.setView(nuqtalar[0], 14); }, [map, nuqtalar]);
  return null;
}
function Bosish({ onBos }: { onBos: (p: Nuqta) => void }) {
  useMapEvents({ click: (e) => onBos({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Obyektlar (mavjud lat/lng) + reys marshrutlari (bekatlar tartib raqami bilan, yo'l chizig'i yoki to'g'ri chiziq). Kalitsiz OpenStreetMap plitkalari. */
export default function TransportXarita({ joylar = [], marshrutlar = [], onJoyBos, onXaritaBos, balandlik = 380 }: {
  joylar?: XaritaJoy[]; marshrutlar?: XaritaMarshrut[]; onJoyBos?: (j: XaritaJoy) => void; onXaritaBos?: (p: Nuqta) => void; balandlik?: number;
}) {
  const hammasi = useMemo<Array<[number, number]>>(() => [
    ...marshrutlar.flatMap((m) => m.nuqtalar.map((p) => [p.lat, p.lng] as [number, number])),
    ...(marshrutlar.length ? [] : joylar.map((j) => [j.lat, j.lng] as [number, number])),
  ], [joylar, marshrutlar]);
  return (
    <div className="overflow-hidden rounded-lg border border-border" style={{ height: balandlik }} role="region" aria-label={t('Transport xaritasi')}>
      <MapContainer center={TOSHKENT} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Sigdir nuqtalar={hammasi} />
        {onXaritaBos && <Bosish onBos={onXaritaBos} />}
        {joylar.map((j) => (
          <Marker key={`j${j.id}`} position={[j.lat, j.lng]} icon={pin} eventHandlers={onJoyBos ? { click: () => onJoyBos(j) } : undefined}>
            <Popup>{j.nom}</Popup>
          </Marker>))}
        {marshrutlar.map((m) => (
          <div key={m.id}>
            <Polyline positions={m.chiziq ?? m.nuqtalar.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: m.rang, weight: 4, opacity: 0.8, dashArray: m.chiziq ? undefined : '8 8' }} />
            {m.nuqtalar.map((p, i) => <Marker key={i} position={[p.lat, p.lng]} icon={raqamIkon(i + 1, m.rang)}><Popup>{m.nom}: {p.nom}</Popup></Marker>)}
          </div>))}
      </MapContainer>
    </div>
  );
}
