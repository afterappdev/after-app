import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import '../../config/homeVisual.scss'
import { AfterLogo } from '../../components/layout/AfterLogo'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { homeLocationCaption } from './homeLocationCaption'
import {
  fetchHomePromotions,
  fetchHomeVenues,
  searchVenues,
} from '../../api/home'
import { searchCities } from '../../api/locations'
import { ApiError } from '../../api/client'
import { CityPicker } from '../../components/home/CityPicker'
import { PromoCard } from '../../components/home/PromoCard'
import { PromoDayStrip } from '../../components/home/PromoDayStrip'
import { SectionTitle } from '../../components/home/SectionTitle'
import { VenueCard } from '../../components/home/VenueCard'
import { VenueFilterModal } from '../../components/home/VenueFilterModal'
import { VENUE_AMENITIES } from '../../constants/venueAmenities'
import { useAuth } from '../../auth/AuthContext'
import {
  formatDateQuery,
  promoFilterDays,
  startOfDay,
} from '../../utils/dates'
import { readStoredCity, persistCity } from './cityStorage'
import type { CityOption, GeoOrigin, HomePromotion, VenueSummary } from './types'
import {
  buildOriginQuery,
  buildVenueSearchQuery,
  cloneVenueSearchFilters,
  createDefaultVenueSearchFilters,
  venueFilterCount,
  venueFiltersActive,
  type VenueSearchFilters,
} from './venueSearchFilters'
import {
  readHomeNavigationState,
  saveHomeNavigationState,
} from './homeNavigationState'

type MainTab = 'explore' | 'search'

export function HomePage() {
  const { api, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const today = useMemo(() => startOfDay(new Date()), [])

  const [mainTab, setMainTab] = useState<MainTab>('explore')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [origin, setOrigin] = useState<GeoOrigin | null>(null)
  const [cityExpanded, setCityExpanded] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState<CityOption[]>([])
  const [cityLoading, setCityLoading] = useState(false)

  const [selectedDay, setSelectedDay] = useState(today)
  const [promotions, setPromotions] = useState<HomePromotion[]>([])
  const [venues, setVenues] = useState<VenueSummary[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)

  const [venueQuery, setVenueQuery] = useState('')
  const [searchResults, setSearchResults] = useState<VenueSummary[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [filters, setFilters] = useState(createDefaultVenueSearchFilters)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const restored = readHomeNavigationState()
    if (restored) {
      setCity(restored.city)
      setState(restored.state)
      setVenueQuery(restored.venueQuery)
      setFilters(cloneVenueSearchFilters(restored.filters))
      if (restored.selectedDayIso) {
        const parsed = new Date(restored.selectedDayIso)
        if (!Number.isNaN(parsed.getTime())) {
          setSelectedDay(startOfDay(parsed))
        }
      }
    } else {
      const stored = readStoredCity()
      if (stored.city) {
        setCity(stored.city)
        setState(stored.state)
      }
    }
  }, [])

  useEffect(() => {
    if (city.trim()) return
    const stored = readStoredCity()
    if (stored.city.trim()) return
    const profileCity = user?.city?.trim() ?? ''
    if (profileCity) {
      setCity(profileCity)
      setState(user?.state?.trim() ?? '')
    }
  }, [city, user?.city, user?.state])

  useEffect(() => {
    if (!city.trim()) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }, [city])

  const loadFeed = useCallback(async () => {
    const feedCity = city.trim() || user?.city?.trim() || ''
    const feedState = city.trim()
      ? state.trim()
      : (user?.state?.trim() ?? state.trim())
    if (!feedCity) {
      setPromotions([])
      setVenues([])
      setFeedError(null)
      setFeedLoading(false)
      return
    }
    setFeedLoading(true)
    setFeedError(null)
    const originQuery = buildOriginQuery(feedCity, origin, feedState)
    try {
      const [promoData, venueData] = await Promise.all([
        fetchHomePromotions(api, {
          ...originQuery,
          date: formatDateQuery(selectedDay),
        }),
        fetchHomeVenues(api, originQuery),
      ])
      setPromotions(promoData)
      setVenues(venueData)
    } catch (err) {
      setFeedError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar o feed.',
      )
    } finally {
      setFeedLoading(false)
    }
  }, [api, city, origin, selectedDay, state, user?.city, user?.state])

  useEffect(() => {
    if (searchParams.get('busca') === '1') setMainTab('search')
    else setMainTab('explore')
  }, [searchParams])

  useEffect(() => {
    if (mainTab !== 'search') return
    searchInputRef.current?.focus()
  }, [mainTab])

  useEffect(() => {
    if (mainTab === 'explore') void loadFeed()
  }, [loadFeed, mainTab])

  useEffect(() => {
    if (!cityExpanded) return
    const q = cityQuery.trim()
    if (q.length < 2) {
      setCityResults([])
      return
    }
    const timer = window.setTimeout(async () => {
      setCityLoading(true)
      try {
        setCityResults(await searchCities(api, q))
      } catch {
        setCityResults([])
      } finally {
        setCityLoading(false)
      }
    }, 280)
    return () => window.clearTimeout(timer)
  }, [api, cityExpanded, cityQuery])

  useEffect(() => {
    if (mainTab !== 'search') return
    const q = venueQuery.trim()
    if (q.length < 2 && !venueFiltersActive(filters)) {
      setSearchResults([])
      return
    }
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const data = await searchVenues(
          api,
          buildVenueSearchQuery(q.length >= 2 ? q : '', filters),
        )
        setSearchResults(data)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 280)
    return () => window.clearTimeout(timer)
  }, [api, filters, mainTab, venueQuery])

  const promoDays = useMemo(
    () => promoFilterDays(selectedDay, today),
    [selectedDay, today],
  )

  const openVenue = (venueId: string) => {
    saveHomeNavigationState({
      mainTab,
      city,
      state,
      venueQuery,
      selectedDayIso: selectedDay.toISOString(),
      filters: cloneVenueSearchFilters(filters),
    })
    navigate(`/venue/${encodeURIComponent(venueId)}`)
  }

  const selectCity = (option: CityOption) => {
    setCity(option.name)
    setState(option.uf)
    persistCity(option.name, option.uf)
    setCityExpanded(false)
    setCityQuery('')
  }

  const pickPromoDay = () => {
    const raw = window.prompt('Data (AAAA-MM-DD)', formatDateQuery(selectedDay))
    if (!raw) return
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
    if (!match) return
    const next = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    )
    setSelectedDay(startOfDay(next))
  }

  const applyFilters = (next: VenueSearchFilters) => {
    setFilters(cloneVenueSearchFilters(next))
    setFilterModalOpen(false)
  }

  const clearFilter = (mutate: (draft: VenueSearchFilters) => void) => {
    setFilters((prev) => {
      const draft = cloneVenueSearchFilters(prev)
      mutate(draft)
      return draft
    })
  }

  const displayCity = city.trim() || user?.city?.trim() || 'Sua cidade'
  const displayState = city.trim() ? state : user?.state?.trim() ?? state
  const locationCaption = homeLocationCaption({
    displayedCity: displayCity,
    displayedUf: displayState,
    profileCity: user?.city?.trim() ?? '',
    profileUf: user?.state?.trim() ?? '',
  })

  return (
    <div className="home-page-wrap home-canvas">
      <div className="home-column">
        <header className="home-top">
          <div className="home-hero">
            <AfterLogo height={70} className="d-inline-block" />
            <p className="home-tagline">O que tem pra hoje?</p>
          </div>
          <CityPicker
            city={displayCity}
            state={displayState}
            caption={locationCaption}
            expanded={cityExpanded}
            query={cityQuery}
            loading={cityLoading}
            results={cityResults}
            onToggle={() => setCityExpanded((v) => !v)}
            onQueryChange={setCityQuery}
            onSelect={selectCity}
          />
        </header>

      {mainTab === 'search' ? (
        <SearchPanel
          inputRef={searchInputRef}
          onBack={() => navigate('/', { replace: true })}
          venueQuery={venueQuery}
          onVenueQueryChange={setVenueQuery}
          filterCount={venueFilterCount(filters)}
          filters={filters}
          onOpenFilters={() => setFilterModalOpen(true)}
          onClearFilter={clearFilter}
          loading={searchLoading}
          results={searchResults}
          onOpenVenue={openVenue}
        />
      ) : (
        <ExplorePanel
          loading={feedLoading}
          error={feedError}
          promotions={promotions}
          venues={venues}
          selectedDay={selectedDay}
          today={today}
          promoDays={promoDays}
          onSelectDay={setSelectedDay}
          onPickDate={pickPromoDay}
          onOpenVenue={openVenue}
          onRetry={loadFeed}
        />
      )}

      <VenueFilterModal
        show={filterModalOpen}
        initial={filters}
        onClose={() => setFilterModalOpen(false)}
        onApply={applyFilters}
      />
      </div>
    </div>
  )
}

function ExplorePanel(props: {
  loading: boolean
  error: string | null
  promotions: HomePromotion[]
  venues: VenueSummary[]
  selectedDay: Date
  today: Date
  promoDays: Date[]
  onSelectDay: (day: Date) => void
  onPickDate: () => void
  onOpenVenue: (id: string) => void
  onRetry: () => void
}) {
  if (props.loading) {
    return <AfterLoading />
  }
  if (props.error) {
    return (
      <div className="alert alert-warning d-flex flex-column align-items-start gap-2">
        <span>{props.error}</span>
        <button type="button" className="btn btn-sm btn-outline-dark" onClick={props.onRetry}>
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="home-explore">
      <div className="home-explore-promos">
        <SectionTitle tone="promotion" title="Promoções/ Eventos do dia" />
        <div className="mt-2">
          <PromoDayStrip
            days={props.promoDays}
            selected={props.selectedDay}
            today={props.today}
            onSelect={(day) => props.onSelectDay(startOfDay(day))}
            onPickDate={props.onPickDate}
          />
        </div>
        <div className="home-card-list vstack gap-3 mt-3">
          {props.promotions.length === 0 ? (
            <p className="text-center py-3 mb-0" style={{ color: 'var(--home-muted)' }}>
              Nenhuma promoção do dia nesta cidade.
            </p>
          ) : (
            props.promotions.map((promo) => (
              <PromoCard
                key={`${promo.bannerId ?? promo.scheduleId ?? promo.title}-${promo.venue?.id}`}
                promo={promo}
                onOpen={props.onOpenVenue}
              />
            ))
          )}
        </div>
      </div>
      <div>
        <SectionTitle tone="venue" title="Locais próximos" />
        <div className="home-card-list vstack gap-3 mt-3">
          {props.venues.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">
              Nenhum local cadastrado nesta cidade.
            </p>
          ) : (
            props.venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} onOpen={props.onOpenVenue} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function SearchPanel(props: {
  inputRef: RefObject<HTMLInputElement | null>
  onBack: () => void
  venueQuery: string
  onVenueQueryChange: (value: string) => void
  filterCount: number
  filters: VenueSearchFilters
  onOpenFilters: () => void
  onClearFilter: (mutate: (draft: VenueSearchFilters) => void) => void
  loading: boolean
  results: VenueSummary[]
  onOpenVenue: (id: string) => void
}) {
  return (
    <div>
      <button type="button" className="home-search-back" onClick={props.onBack}>
        Voltar
      </button>
      <div className="after-search-group">
        <input
          ref={props.inputRef}
          type="search"
          className="form-control home-search-input"
          placeholder="Buscar por nome"
          aria-label="Buscar por nome"
          value={props.venueQuery}
          onChange={(e) => props.onVenueQueryChange(e.target.value)}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={props.onOpenFilters}>
          Filtros{props.filterCount > 0 ? ` (${props.filterCount})` : ''}
        </button>
      </div>
      {venueFiltersActive(props.filters) ? (
        <ActiveFilterChips filters={props.filters} onClear={props.onClearFilter} />
      ) : null}
      {props.loading ? (
        <AfterLoading />
      ) : props.results.length === 0 ? (
        <p className="after-empty mb-0">
          {props.venueQuery.trim().length >= 2 || venueFiltersActive(props.filters)
            ? 'Nenhum local encontrado.'
            : 'Digite ao menos 2 caracteres ou use filtros.'}
        </p>
      ) : (
        <div className="home-search-results vstack gap-3 mt-2">
          {props.results.map((venue) => (
            <VenueCard key={venue.id} venue={venue} onOpen={props.onOpenVenue} />
          ))}
        </div>
      )}
    </div>
  )
}

function ActiveFilterChips(props: {
  filters: VenueSearchFilters
  onClear: (mutate: (draft: VenueSearchFilters) => void) => void
}) {
  const chips: { label: string; clear: () => void }[] = []
  if (props.filters.category) {
    chips.push({
      label: props.filters.category,
      clear: () => props.onClear((d) => { d.category = null }),
    })
  }
  if (props.filters.minRating > 0) {
    chips.push({
      label: `${props.filters.minRating}+ estrelas`,
      clear: () => props.onClear((d) => { d.minRating = 0 }),
    })
  }
  if (props.filters.hasCoverCharge) {
    chips.push({
      label: 'Entrada paga',
      clear: () => props.onClear((d) => { d.hasCoverCharge = false }),
    })
  }
  for (const item of VENUE_AMENITIES) {
    if (props.filters.amenities[item.key]) {
      chips.push({
        label: item.filterLabel ?? item.label,
        clear: () =>
          props.onClear((d) => {
            d.amenities[item.key] = false
          }),
      })
    }
  }

  return (
    <div className="d-flex flex-wrap gap-2 mb-3">
      {chips.map((chip) => (
        <span key={chip.label} className="after-filter-chip">
          {chip.label}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 align-baseline"
            style={{ color: 'inherit', minHeight: 0 }}
            onClick={chip.clear}
            aria-label={`Remover filtro ${chip.label}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
