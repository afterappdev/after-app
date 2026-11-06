import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { LeafletMouseEvent } from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'

/** Corrige caminhos dos ícones padrão após bundle (Vite). */
const defaultMarkerIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

type Props = {
  lat: number
  lng: number
  label: string
  /** Mapa mais baixo (painel do estabelecimento). */
  compact?: boolean
  /** Permite arrastar o pin e clicar no mapa para posicionar (edição pelo dono). */
  interactive?: boolean
  /** Chamado quando o usuário move o pin (arraste ou clique no mapa). */
  onPositionChange?: (lat: number, lng: number) => void
}

export function VenueMapEmbed({
  lat,
  lng,
  label,
  compact = false,
  interactive = false,
  onPositionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const skipNextSyncRef = useRef(false)
  const onPositionChangeRef = useRef(onPositionChange)
  onPositionChangeRef.current = onPositionChange

  const propsRef = useRef({ lat, lng, interactive, label })
  propsRef.current = { lat, lng, interactive, label }

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const { lat: startLat, lng: startLng, interactive: startInteractive, label: startLabel } = propsRef.current

    const map = L.map(el, {
      zoomControl: true,
      scrollWheelZoom: startInteractive,
      attributionControl: false,
    }).setView([startLat, startLng], startInteractive ? 17 : 16)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map)

    const marker = L.marker([startLat, startLng], {
      icon: defaultMarkerIcon,
      draggable: startInteractive,
      title: startLabel,
    }).addTo(map)

    if (startLabel) {
      marker.bindTooltip(startLabel, { sticky: true })
    }

    function onMarkerDragEnd() {
      const ll = marker.getLatLng()
      skipNextSyncRef.current = true
      onPositionChangeRef.current?.(ll.lat, ll.lng)
    }

    marker.on('dragend', onMarkerDragEnd)

    mapRef.current = map
    markerRef.current = marker

    function refreshMapSize() {
      map.invalidateSize({ animate: false })
    }

    queueMicrotask(() => {
      refreshMapSize()
    })

    /** Quando o painel de horários cresce (ex.: dois períodos), o flex estica o mapa — Leaflet precisa redesenhar os tiles. */
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            requestAnimationFrame(() => {
              refreshMapSize()
            })
          })
        : null
    resizeObserver?.observe(el)

    return () => {
      resizeObserver?.disconnect()
      marker.off('dragend', onMarkerDragEnd)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapa Leaflet: uma instância por montagem
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false
      return
    }

    const cur = marker.getLatLng()
    if (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7) return

    marker.setLatLng([lat, lng])
    map.panTo([lat, lng], { animate: true })
  }, [lat, lng])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    const m = marker

    function onMapClick(e: LeafletMouseEvent) {
      const ll = e.latlng
      m.setLatLng(ll)
      skipNextSyncRef.current = true
      onPositionChangeRef.current?.(ll.lat, ll.lng)
    }

    if (interactive) {
      marker.dragging?.enable()
      map.scrollWheelZoom.enable()
      map.on('click', onMapClick)
    } else {
      marker.dragging?.disable()
      map.scrollWheelZoom.disable()
      map.off('click', onMapClick)
    }

    marker.options.title = label
    if (label) {
      marker.unbindTooltip()
      marker.bindTooltip(label, { sticky: true })
    } else {
      marker.unbindTooltip()
    }
    return () => {
      map.off('click', onMapClick)
    }
  }, [interactive, label])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    queueMicrotask(() => map.invalidateSize())
  }, [compact, lat, lng])

  const rootClass = compact
    ? 'venue-map-embed venue-map-embed--compact venue-map-embed--stretch venue-map-leaflet-root rounded overflow-hidden border'
    : 'venue-map-embed venue-map-leaflet-root rounded overflow-hidden border'

  return (
    <div className={rootClass}>
      {compact ? (
        <div ref={containerRef} className="venue-map-leaflet-pane" role="presentation" />
      ) : (
        <div className="ratio ratio-16x9">
          <div
            ref={containerRef}
            className="venue-map-leaflet-pane position-absolute top-0 start-0 w-100 h-100"
            role="presentation"
          />
        </div>
      )}
      <div className="venue-map-osm-footer">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
      </div>
    </div>
  )
}
