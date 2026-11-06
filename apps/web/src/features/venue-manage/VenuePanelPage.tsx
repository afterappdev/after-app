import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { fetchVenueDetail } from '../../api/venues'
import {
  addVenuePhoto,
  geocodeVenueAddress,
  removeVenuePhoto,
  updateOwnedVenue,
} from '../../api/venueOwner'
import { updateUserMe } from '../../api/users'
import { uploadFile } from '../../api/uploads'
import { useAuth } from '../../auth/AuthContext'
import { AfterPageHeader } from '../../components/layout/AfterPageHeader'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { MultiVenuePlaceholder } from '../../components/venue-manage/MultiVenuePlaceholder'
import { HoursEditor } from '../../components/venue-manage/HoursEditor'
import { VenueFiscalSection } from '../../components/venue-manage/VenueFiscalSection'
import { VenueMediaSection } from '../../components/venue-manage/VenueMediaSection'
import { VenueMapEmbed } from '../../components/venue/VenueMapEmbed'
import { VENUE_AMENITIES } from '../../constants/venueAmenities'
import { VENUE_CATEGORIES } from '../../constants/venueCategories'
import {
  requiresCategoryReselection,
  venueCategorySelection,
} from '../../constants/venueCategorySelection'
import type { VenueDetail, VenuePhoto } from '../venue/types'
import { useOwnedVenueId } from './useOwnedVenueId'
import { buildHoursJson, parseHoursForm, type HoursFormState } from '../../utils/venueHours'
import { isVideoMedia } from '../../utils/mediaKind'
import { formatBrazilPhoneInput } from '../../utils/phoneDisplay'

function normalizePhoneField(s: string): string {
  return formatBrazilPhoneInput(s)
}

type TabId = 'general' | 'location' | 'contact' | 'media' | 'fiscal'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'Geral' },
  { id: 'location', label: 'Localização e Horários' },
  { id: 'contact', label: 'Contato' },
  { id: 'media', label: 'Mídias' },
  { id: 'fiscal', label: 'Fiscal' },
]

function normalizePanelTab(raw: unknown): TabId {
  if (raw === 'general' || raw === 'location' || raw === 'contact' || raw === 'media' || raw === 'fiscal') {
    return raw
  }
  if (raw === 'profile') return 'general'
  return 'general'
}

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  return ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)
}

export function VenuePanelPage() {
  const venueId = useOwnedVenueId()
  const { api, user, refreshUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingKindRef = useRef<{ kind: 'GALLERY' | 'MENU'; video: boolean | 'infer' } | null>(null)

  const location = useLocation()
  const initialTab = normalizePanelTab((location.state as { panelTab?: unknown } | null)?.panelTab)
  const [tab, setTab] = useState<TabId>(initialTab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [venue, setVenue] = useState<VenueDetail | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [stateUf, setStateUf] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [instagram, setInstagram] = useState('')
  const [hasCoverCharge, setHasCoverCharge] = useState(false)
  const [coverCharge, setCoverCharge] = useState('')
  const [amenities, setAmenities] = useState<Record<string, boolean>>({})
  const [hours, setHours] = useState<HoursFormState>(() => parseHoursForm(null))
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [photos, setPhotos] = useState<VenuePhoto[]>([])
  const [loadedCity, setLoadedCity] = useState('')
  const [loadedState, setLoadedState] = useState('')
  const [loadedAddress, setLoadedAddress] = useState('')
  const [categoryRequired, setCategoryRequired] = useState(false)

  const applyVenue = useCallback(
    (data: VenueDetail, opts?: { mergePhotosWhenMissing?: boolean }) => {
    setVenue(data)
    setName(data.name ?? '')
    setDescription(data.description ?? '')
    const cat = venueCategorySelection(data.category)
    setCategory(cat)
    setCategoryRequired(requiresCategoryReselection(data.category))
    setCity(data.city ?? user?.city ?? '')
    setStateUf(data.state ?? user?.state ?? '')
    setLoadedCity(data.city ?? '')
    setLoadedState(data.state ?? '')
    setLat(data.lat ?? null)
    setLng(data.lng ?? null)
    setLogoUrl(data.logoUrl ?? null)
    setCoverUrl(data.coverUrl ?? null)
    if (opts?.mergePhotosWhenMissing === true && !Array.isArray(data.photos)) {
      /* PUT /venues/:id não inclui photos — manter estado atual */
    } else {
      setPhotos(data.photos ?? [])
    }
    setHours(parseHoursForm(data.hoursJson ?? undefined))
    const contacts = data.contacts ?? {}
    setAddress(String(contacts.address ?? ''))
    setLoadedAddress(String(contacts.address ?? ''))
    setPhone(normalizePhoneField(String(contacts.phone ?? '')))
    setWhatsapp(normalizePhoneField(String(contacts.whatsapp ?? '')))
    setInstagram(String(contacts.instagram ?? ''))
    setHasCoverCharge(contacts.hasCoverCharge === true)
    setCoverCharge(String(contacts.coverCharge ?? ''))
    const amenityMap: Record<string, boolean> = {}
    for (const item of VENUE_AMENITIES) {
      amenityMap[item.key] = contacts[item.key] === true
    }
    setAmenities(amenityMap)
    },
    [user?.city, user?.state],
  )

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchVenueDetail(api, venueId)
      if (data.isOwner === false && user?.venueId && user.venueId !== venueId) {
        setError('Sem permissão para editar este estabelecimento.')
        setVenue(null)
        return
      }
      applyVenue(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o local.')
      setVenue(null)
    } finally {
      setLoading(false)
    }
  }, [api, applyVenue, user?.venueId, venueId])

  useEffect(() => {
    void load()
  }, [load])

  const addressChanged =
    address.trim() !== loadedAddress.trim() ||
    city.trim() !== loadedCity.trim() ||
    stateUf.trim() !== loadedState.trim()

  async function saveVenueProfile() {
    if (!venueId) return
    if (categoryRequired && !category) {
      setToast('Selecione uma categoria do catálogo atual.')
      return
    }
    setBusy(true)
    try {
      const trimmedCity = city.trim()
      const trimmedState = stateUf.trim()
      const payload = {
        name: name.trim(),
        category: category || '',
        description: description.trim(),
        city: trimmedCity,
        state: trimmedState,
        ...(logoUrl ? { logoUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
        ...(lat != null && lng != null ? { lat, lng } : {}),
        contacts: {
          phone: phone.replace(/\D/g, ''),
          instagram: instagram.trim(),
          whatsapp: whatsapp.replace(/\D/g, ''),
          address: address.trim(),
          hasCoverCharge,
          coverCharge: coverCharge.trim(),
          ...amenities,
        },
        hoursJson: buildHoursJson(hours),
      }
      const updated = await updateOwnedVenue(api, venueId, payload)
      applyVenue(updated, { mergePhotosWhenMissing: true })
      if (trimmedCity !== loadedCity.trim() || trimmedState !== loadedState.trim()) {
        await updateUserMe(api, { city: trimmedCity, state: trimmedState })
        await refreshUser()
      }
      setLoadedCity(trimmedCity)
      setLoadedState(trimmedState)
      setLoadedAddress(address.trim())
      setToast('Local atualizado.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    await saveVenueProfile()
  }

  async function onGeocode() {
    if (!address.trim()) {
      setToast('Informe o endereço para encontrar no mapa.')
      return
    }
    setBusy(true)
    try {
      const point = await geocodeVenueAddress(api, {
        address: address.trim(),
        city: city.trim(),
        state: stateUf.trim(),
      })
      setLat(point.lat)
      setLng(point.lng)
      setToast('Localização atualizada no mapa.')
    } catch (err) {
      const status = err instanceof ApiError ? err.statusCode : 0
      setToast(
        status === 404
          ? 'Não encontramos esse endereço no mapa.'
          : err instanceof ApiError
            ? err.message
            : 'Falha na geolocalização.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function uploadBrand(kind: 'logo' | 'cover', file: File) {
    setBusy(true)
    try {
      const uploaded = await uploadFile(api, file)
      if (kind === 'logo') setLogoUrl(uploaded.url)
      else setCoverUrl(uploaded.url)
      setToast(kind === 'logo' ? 'Logo enviada. Salve para publicar.' : 'Capa enviada. Salve para publicar.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Falha no upload.')
    } finally {
      setBusy(false)
    }
  }

  function queueMediaPick(kind: 'GALLERY' | 'MENU', video: boolean | 'infer') {
    pendingKindRef.current = { kind, video }
    fileInputRef.current?.click()
  }

  async function onMediaFileSelected(file: File | null) {
    const pending = pendingKindRef.current
    pendingKindRef.current = null
    if (!file || !venueId || !pending) return
    const useVideo = pending.video === 'infer' ? isVideoFile(file) : pending.video
    setBusy(true)
    try {
      const uploaded = await uploadFile(api, file)
      await addVenuePhoto(api, venueId, {
        url: uploaded.url,
        kind: pending.kind,
        mediaType: useVideo ? 'VIDEO' : 'IMAGE',
      })
      await load()
      setToast(useVideo ? 'Vídeo adicionado.' : 'Foto adicionada.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível adicionar mídia.')
    } finally {
      setBusy(false)
    }
  }

  async function onRemovePhoto(photo: VenuePhoto) {
    if (!venueId || !photo.id) return
    const label = isVideoMedia(photo) ? 'vídeo' : 'foto'
    if (!window.confirm(`Deseja remover este ${label}?`)) return
    setBusy(true)
    try {
      await removeVenuePhoto(api, venueId, photo.id)
      await load()
      setToast(isVideoMedia(photo) ? 'Vídeo removido.' : 'Foto removida.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível remover.')
    } finally {
      setBusy(false)
    }
  }

  if (!venueId) {
    return <div className="alert alert-info">Estabelecimento não vinculado à sessão.</div>
  }

  if (loading) {
    return <AfterLoading />
  }

  if (error || !venue) {
    return (
      <div className="alert alert-warning">
        {error ?? 'Local não encontrado.'}
        <button type="button" className="btn btn-sm btn-outline-dark ms-2" onClick={() => void load()}>
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="after-canvas after-canvas--wide pb-3">
      <input
        ref={fileInputRef}
        type="file"
        className="d-none"
        accept="image/*,video/*"
        onChange={(e) => void onMediaFileSelected(e.target.files?.[0] ?? null)}
      />

      {toast ? (
        <div className="alert alert-info alert-dismissible fade show">
          {toast}
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      ) : null}

      <AfterPageHeader
        title="Painel do estabelecimento"
        subtitle={venue.name}
        backTo="/perfil"
        backLabel="← Perfil do local"
      />

      <MultiVenuePlaceholder />

      <div className="venue-panel-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`venue-panel-tab-btn ${tab === item.id ? 'venue-panel-tab-btn--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'fiscal' ? (
        <VenueFiscalSection api={api} venueId={venueId} />
      ) : (
        <form onSubmit={onSave} className="card border-0 shadow-sm">
          <div className="card-body vstack gap-4">
            {tab === 'general' ? (
              <>
                <div>
                  <label className="form-label venue-panel-field-label" htmlFor="venue-name">
                    Nome
                  </label>
                  <input
                    id="venue-name"
                    className="form-control venue-panel-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <label className="form-label venue-panel-field-label" htmlFor="venue-category">
                    Categoria
                  </label>
                  <select
                    id="venue-category"
                    className="form-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required={categoryRequired}
                  >
                    <option value="">{categoryRequired ? 'Selecione…' : 'Opcional'}</option>
                    {VENUE_CATEGORIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {categoryRequired ? (
                    <p className="small text-warning mb-0 mt-1">Atualize a categoria do catálogo After.</p>
                  ) : null}
                </div>
                <div>
                  <label className="form-label venue-panel-field-label" htmlFor="venue-desc">
                    Descrição
                  </label>
                  <textarea id="venue-desc" className="form-control" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="venue-panel-cover-charge-row d-flex flex-wrap align-items-center gap-2">
                  <div className="form-check mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="cover-charge"
                      checked={hasCoverCharge}
                      onChange={(e) => setHasCoverCharge(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="cover-charge">
                      Entrada paga
                    </label>
                  </div>
                  {hasCoverCharge ? (
                    <>
                      <label className="form-label small mb-0 text-nowrap" htmlFor="cover-charge-value">
                        Valor da entrada
                      </label>
                      <input
                        id="cover-charge-value"
                        className="form-control form-control-sm venue-panel-cover-value-input"
                        value={coverCharge}
                        onChange={(e) => setCoverCharge(e.target.value)}
                        placeholder="R$ 20"
                      />
                    </>
                  ) : null}
                </div>
                <div>
                  <h2 className="h6 fw-bold">Comodidades</h2>
                  <div className="venue-amenities-grid">
                    {VENUE_AMENITIES.map((item) => (
                      <div
                        className={`form-check venue-amenity-check mb-0${item.key === 'hasBirthdayTreat' ? ' venue-amenity-check--nowrap venue-amenity-check--full-row' : ''}`}
                        key={item.key}
                      >
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`amenity-${item.key}`}
                          checked={amenities[item.key] === true}
                          onChange={(e) =>
                            setAmenities((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                        />
                        <label className="form-check-label small venue-amenity-label" htmlFor={`amenity-${item.key}`}>
                          {item.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {tab === 'location' ? (
              <>
                <div className="row g-2 venue-location-address-row align-items-end">
                  <div className="col-12 col-lg-5">
                    <label className="form-label" htmlFor="venue-address">
                      Endereço
                    </label>
                    <input id="venue-address" className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="col-12 col-lg-5">
                    <label className="form-label" htmlFor="venue-city">
                      Cidade
                    </label>
                    <input id="venue-city" className="form-control" value={city} onChange={(e) => setCity(e.target.value)} required />
                  </div>
                  <div className="col-12 col-lg-2">
                    <label className="form-label" htmlFor="venue-state">
                      UF
                    </label>
                    <input
                      id="venue-state"
                      className="form-control text-uppercase"
                      value={stateUf}
                      onChange={(e) => setStateUf(e.target.value)}
                      required
                      maxLength={2}
                    />
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                  <button
                    type="button"
                    className="btn btn-sm venue-panel-geocode-btn"
                    disabled={busy}
                    onClick={() => void onGeocode()}
                  >
                    Encontrar no mapa
                  </button>
                  {addressChanged && lat != null ? (
                    <span className="small text-warning mb-0">
                      Endereço mudou — confirme a localização no mapa.
                    </span>
                  ) : null}
                </div>
                <div className="venue-map-hours-grid">
                  <div className="venue-panel-map-col">
                    <div className="venue-panel-map-inner">
                      {lat != null && lng != null ? (
                        <VenueMapEmbed
                          lat={lat}
                          lng={lng}
                          label={name}
                          compact
                          interactive
                          onPositionChange={(nextLat, nextLng) => {
                            setLat(nextLat)
                            setLng(nextLng)
                          }}
                        />
                      ) : (
                        <p className="text-muted small mb-0 align-self-center">Sem coordenadas. Use &quot;Encontrar no mapa&quot; ou salve após ajuste.</p>
                      )}
                    </div>
                    {lat != null && lng != null ? (
                      <p className="venue-map-pin-hint small text-muted mb-0 mt-2">
                        Arraste o PIN para o seu local correto e salve as alterações.
                      </p>
                    ) : null}
                  </div>
                  <div className="venue-panel-hours-col">
                    <div className="venue-panel-hours-inner">
                      <HoursEditor variant="panel" value={hours} onChange={setHours} />
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {tab === 'contact' ? (
              <div className="venue-panel-contact-stack mx-auto">
                <div className="mb-3">
                  <label
                    className="form-label fw-bold venue-panel-contact-label venue-panel-contact-label--phone"
                    htmlFor="venue-phone-reservas"
                  >
                    Telefone pra reservas
                  </label>
                  <input
                    id="venue-phone-reservas"
                    className="form-control"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(11) 91234-5678"
                    value={phone}
                    onChange={(e) => setPhone(formatBrazilPhoneInput(e.target.value))}
                  />
                </div>
                <div className="mb-3">
                  <label
                    className="form-label fw-bold venue-panel-contact-label venue-panel-contact-label--whatsapp"
                    htmlFor="venue-whatsapp"
                  >
                    WhatsApp
                  </label>
                  <input
                    id="venue-whatsapp"
                    className="form-control"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(11) 91234-5678"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(formatBrazilPhoneInput(e.target.value))}
                  />
                </div>
                <div>
                  <label
                    className="form-label fw-bold venue-panel-contact-label venue-panel-contact-label--instagram"
                    htmlFor="venue-instagram"
                  >
                    Instagram
                  </label>
                  <input
                    id="venue-instagram"
                    className="form-control"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {tab === 'media' ? (
              <VenueMediaSection
                photos={photos}
                logoUrl={logoUrl}
                coverUrl={coverUrl}
                busy={busy}
                onUploadLogo={(file) => void uploadBrand('logo', file)}
                onUploadCover={(file) => void uploadBrand('cover', file)}
                onOpenGalleryPicker={() => queueMediaPick('GALLERY', 'infer')}
                onOpenMenuPicker={() => queueMediaPick('MENU', false)}
                onRemovePhoto={(photo) => void onRemovePhoto(photo)}
              />
            ) : null}

            {tab !== 'media' ? (
              <button type="submit" className="btn btn-primary align-self-center" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar alterações'}
              </button>
            ) : (
              <p className="small text-muted mb-0 text-center">
                Logo/capa: envie e depois salve as alterações. Galeria e cardápio publicam na hora.
              </p>
            )}
          </div>
        </form>
      )}

      {tab === 'media' ? (
        <div className="mt-3 text-center">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveVenueProfile()}>
            Salvar logo e capa
          </button>
        </div>
      ) : null}
    </div>
  )
}
