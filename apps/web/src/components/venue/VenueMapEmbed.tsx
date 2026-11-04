type Props = {
  lat: number
  lng: number
  label: string
}

/** Mapa embutido só quando lat/lng existem na API. */
export function VenueMapEmbed({ lat, lng, label }: Props) {
  const delta = 0.01
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`
  return (
    <div className="ratio ratio-16x9 rounded overflow-hidden border">
      <iframe
        title={`Mapa — ${label}`}
        src={src}
        loading="lazy"
        className="border-0"
      />
    </div>
  )
}
