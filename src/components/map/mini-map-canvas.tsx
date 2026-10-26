"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#FCBE4F;border:2px solid #14100b;box-shadow:0 0 0 2px rgba(252,190,79,.35),0 2px 6px rgba(0,0,0,.5)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function MiniMapCanvas({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={14}
      // Keep the zoom capped so more detailed levels cannot reveal house numbers.
      maxZoom={16}
      scrollWheelZoom={false}
      className="h-full w-full"
      style={{ background: "#14100b" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={16}
      />
      <Marker position={[lat, lng]} icon={pinIcon} />
    </MapContainer>
  );
}
