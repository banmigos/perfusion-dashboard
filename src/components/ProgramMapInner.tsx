// src/components/ProgramMapInner.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import Link from "next/link";
import type { ProgramListItem } from "@/domain/programs";

let iconConfigured = false;
function configureDefaultIcon() {
  if (iconConfigured) return;
  iconConfigured = true;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x.src,
    iconUrl: markerIcon.src,
    shadowUrl: markerShadow.src,
  });
}

type LocatedItem = ProgramListItem & {
  program: ProgramListItem["program"] & { latitude: number; longitude: number };
};

function isLocated(item: ProgramListItem): item is LocatedItem {
  return item.program.latitude !== null && item.program.longitude !== null;
}

export function ProgramMapInner({ items }: { items: ProgramListItem[] }) {
  useEffect(() => {
    configureDefaultIcon();
  }, []);

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
