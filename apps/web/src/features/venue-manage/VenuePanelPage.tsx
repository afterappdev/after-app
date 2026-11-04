import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
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

type TabId = 'general' | 'location' | 'contact' | 'media' | 'fiscal'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'Geral' },
  { id: 'location', label: 'Local' },
  { id: 'contact', label: 'Contato' },
  { id: 'media', label: 'Mídias' },
  { id: 'fiscal', label: 'Fiscal' },
]

export function VenuePanelPage() {
  const venueId = useOwnedVenueId()
  const { api, user, refreshUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingKindRef = useRef<{ kind: 'GALLERY' | 'MENU'; video: boolean } | null>(null)

  const [tab, setTab] = useState<TabId>('general')
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

  const applyVenue = useCallback((data: VenueDetail) => {
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
    setPhotos(data.photos ?? [])
    setHours(parseHoursForm(data.hoursJson ?? undefined))
    const contacts = data.contacts ?? {}
    setAddress(String(contacts.address ?? ''))
    setLoadedAddress(String(contacts.address ?? ''))
    setPhone(String(contacts.phone ?? ''))
    setWhatsapp(String(contacts.whatsapp ?? ''))
    setInstagram(String(contacts.instagram ?? ''))
    setHasCoverCharge(contacts.hasCoverCharge === true)
    setCoverCharge(String(contacts.coverCharge ?? ''))
    const amenityMap: Record<string, boolean> = {}
    for (const item of VENUE_AMENITIES) {
      amenityMap[item.key] = contacts[item.key] === true
    }
    setAmenities(amenityMap)
  }, [user?.city, user?.state])

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
          phone: phone.trim(),
          instagram: instagram.trim(),
          whatsapp: whatsapp.trim(),
          address: address.trim(),
          hasCoverCharge,
          coverCharge: coverCharge.trim(),
          ...amenities,
        },
        hoursJson: buildHoursJson(hours),
      }
      const updated = await updateOwnedVenue(api, venueId, payload)
      applyVenue(updated)
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

  function queueMediaPick(kind: 'GALLERY' | 'MENU', video: boolean) {
    pendingKindRef.current = { kind, video }
    fileInputRef.current?.click()
  }

  async function onMediaFileSelected(file: File | null) {
    const pending = pendingKindRef.current
    pendingKindRef.current = null
    if (!file || !venueId || !pending) return
    setBusy(true)
    try {
      const uploaded = await uploadFile(api, file)
      await addVenuePhoto(api, venueId, {
        url: uploaded.url,
        kind: pending.kind,
        mediaType: pending.video ? 'VIDEO' : 'IMAGE',
      })
      await load()
      setToast(pending.video ? 'Vídeo adicionado.' : 'Foto adicionada.')
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
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-warning" />
      </div>
    )
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
    <div className="mx-auto pb-5" style={{ maxWidth: 820 }}>
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

      <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
        <div>
          <h1 className="h4 after-brand-text mb-1">Painel do estabelecimento</h1>
          <p className="text-muted small mb-0">{venue.name}</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link to={`/venue/${encodeURIComponent(venueId)}`} className="btn btn-sm btn-outline-secondary">
            Ver ficha pública
          </Link>
        </div>
      </div>

      <MultiVenuePlaceholder />

      <ul className="nav nav-tabs flex-nowrap overflow-auto mb-3 mt-3">
        {TABS.map((item) => (
          <li className="nav-item" key={item.id}>
            <button
              type="button"
              className={`nav-link ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'fiscal' ? (
        <VenueFiscalSection api={api} venueId={venueId} />
      ) : (
        <form onSubmit={onSave} className="card border-0 shadow-sm">
          <div className="card-body vstack gap-4">
            {tab === 'general' ? (
              <>
                <div>
                  <label className="form-label" htmlFor="venue-name">
                    Nome
                  </label>
                  <input id="venue-name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
                </div>
                <div>
                  <label className="form-label" htmlFor="venue-category">
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
                  <label className="form-label" htmlFor="venue-desc">
                    Descrição
                  </label>
                  <textarea id="venue-desc" className="form-control" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </>
            ) : null}

            {tab === 'location' ? (
              <>
                <div className="row g-2">
                  <div className="col-md-8">
                    <label className="form-label" htmlFor="venue-address">
                      Endereço
                    </label>
                    <input id="venue-address" className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="venue-city">
                      Cidade
                    </label>
                    <input id="venue-city" className="form-control" value={city} onChange={(e) => setCity(e.target.value)} required />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label" htmlFor="venue-state">
                      UF
                    </label>
                    <input id="venue-state" className="form-control" value={stateUf} onChange={(e) => setStateUf(e.target.value)} required maxLength={2} />
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => void onGeocode()}>
                    Encontrar no mapa
                  </button>
                  {addressChanged && lat != null ? (
                    <span className="small text-warning align-self-center">
                      Endereço mudou — confirme a localização no mapa.
                    </span>
                  ) : null}
                </div>
                {lat != null && lng != null ? (
                  <VenueMapEmbed lat={lat} lng={lng} label={name} />
                ) : (
                  <p className="text-muted small mb-0">Sem coordenadas. Use geocodificação ou salve após ajuste.</p>
                )}
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="venue-lat">
                      Latitude
                    </label>
                    <input
                      id="venue-lat"
                      type="number"
                      step="any"
                      className="form-control"
                      value={lat ?? ''}
                      onChange={(e) => setLat(e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="venue-lng">
                      Longitude
                    </label>
                    <input
                      id="venue-lng"
                      type="number"
                      step="any"
                      className="form-control"
                      value={lng ?? ''}
                      onChange={(e) => setLng(e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                </div>
                <div>
                  <h2 className="h6 fw-bold">Horários</h2>
                  <HoursEditor value={hours} onChange={setHours} />
                </div>
              </>
            ) : null}

            {tab === 'contact' ? (
              <>
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label">Telefone (reservas)</label>
                    <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">WhatsApp</label>
                    <input className="form-control" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Instagram</label>
                    <input className="form-control" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                  </div>
                </div>
                <div className="form-check">
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
                  <div>
                    <label className="form-label">Valor da entrada</label>
                    <input className="form-control" value={coverCharge} onChange={(e) => setCoverCharge(e.target.value)} placeholder="R$ 20" />
                  </div>
                ) : null}
                <div>
                  <h2 className="h6 fw-bold">Comodidades</h2>
                  <div className="row g-2">
                    {VENUE_AMENITIES.map((item) => (
                      <div className="col-12 col-md-6" key={item.key}>
                        <div className="form-check">
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
                          <label className="form-check-label small" htmlFor={`amenity-${item.key}`}>
                            {item.label}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {tab === 'media' ? (
              <VenueMediaSection
                photos={photos}
                logoUrl={logoUrl}
                coverUrl={coverUrl}
                busy={busy}
                onUploadLogo={(file) => void uploadBrand('logo', file)}
                onUploadCover={(file) => void uploadBrand('cover', file)}
                onAddGallery={(video) => queueMediaPick('GALLERY', video)}
                onAddMenu={() => queueMediaPick('MENU', false)}
                onRemovePhoto={(photo) => void onRemovePhoto(photo)}
              />
            ) : null}

            {tab !== 'media' ? (
              <button type="submit" className="btn btn-primary align-self-start" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar alterações'}
              </button>
            ) : (
              <p className="small text-muted mb-0">
                Logo/capa: envie e depois use <strong>Salvar</strong> na aba Geral ou Local. Galeria e cardápio publicam na hora.
              </p>
            )}
          </div>
        </form>
      )}

      {tab === 'media' ? (
        <div className="mt-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveVenueProfile()}>
            Salvar logo e capa
          </button>
        </div>
      ) : null}
    </div>
  )
}
