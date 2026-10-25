// src/components/ProgramMapInner.tsx
"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import type { ProgramListItem } from "@/domain/programs";

// Inline SVG avoids Leaflet's default PNG asset-path problems under Next.js.
// Anchored at the pin tip (bottom center) so it points at the coordinates.
const PIN_WIDTH = 28;
const PIN_HEIGHT = 40;
const pinIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 28 40" aria-hidden="true"><path d="M14 1C6.8 1 1 6.8 1 14c0 9.5 13 25 13 25s13-15.5 13-25C27 6.8 21.2 1 14 1z" fill="#234c73" stroke="#14202a" stroke-width="1.5"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  popupAnchor: [0, -PIN_HEIGHT],
});

type LocatedItem = ProgramListItem & {
  program: ProgramListItem["program"] & { latitude: number; longitude: number };
};

function isLocated(item: ProgramListItem): item is LocatedItem {
  return item.program.latitude !== null && item.program.longitude !== null;
}

export function ProgramMapInner({ items }: { items: ProgramListItem[] }) {
  const located = items.filter(isLocated);

  if (located.length === 0) {
    return (
      <p className="text-sm text-muted">
        No located programs match this filter.
      </p>
    );
  }

  const center: [number, number] = [
    located[0]!.program.latitude,
    located[0]!.program.longitude,
  ];

  return (
    <MapContainer
      center={center}
      zoom={4}
      scrollWheelZoom={false}
      className="h-[32rem] w-full rounded-lg border border-line"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((item) => (
        <Marker
          key={`${item.school.slug}/${item.program.slug}`}
          position={[item.program.latitude, item.program.longitude]}
          icon={pinIcon}
        >
          <Popup>
            <Link href={`/programs/${item.school.slug}/${item.program.slug}`}>
              {item.school.name} — {item.program.name} (
              {item.program.credential ?? "credential unknown"})
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
