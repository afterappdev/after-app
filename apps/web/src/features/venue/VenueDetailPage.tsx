import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { addFavorite, listFavoriteVenueIds, removeFavorite } from '../../api/favorites'
import { submitReport, type ReportTargetType } from '../../api/reports'
import {
  blockVenue,
  fetchVenueDetail,
  replyVenueReview,
  submitVenueReview,
} from '../../api/venues'
import { IconFlag } from '../../components/icons/AfterIcons'
import { ReportModal } from '../../components/moderation/ReportModal'
import { VenueMapEmbed } from '../../components/venue/VenueMapEmbed'
import { presentVenueCategory } from '../../constants/venueCategories'
import { VENUE_AMENITIES } from '../../constants/venueAmenities'
import { REPORT_SUCCESS_MESSAGE } from '../../constants/reportReasons'
import { useAuth } from '../../auth/AuthContext'
import { formatStoredCalendarDate } from '../../utils/dates'
import { formatDistanceKm } from '../../utils/distance'
import {
  formatPhoneDisplay,
  googleMapsSearchUrl,
  instagramHandle,
  instagramUrl,
  telUrl,
  whatsappUrl,
} from '../../utils/contacts'
import { parseHoursRows } from '../../utils/hours'
import { galleryPhotos, isVideoMedia, menuPhotos } from '../../utils/mediaKind'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { formatVenueEntry } from '../../utils/venueEntry'
import { readStoredCity } from '../home/cityStorage'
import { loginNavigationState } from '../../utils/loginReturn'
import type { VenueBanner, VenueContacts, VenueDetail, VenuePhoto, VenueReview } from './types'
import {
  canBlockOrReport,
  canFavorite,
  canReply,
  canReview,
  canShowSafetyActions,
  isVenueOwner,
} from './permissions'

type ReportDraft = {
  targetType: ReportTargetType
  targetId: string
  title: string
}

type TabId = 'about' | 'photos' | 'menu' | 'reviews' | 'contact'

const TABS: { id: TabId; label: string }[] = [
  { id: 'about', label: 'Sobre' },
  { id: 'photos', label: 'Fotos do local' },
  { id: 'menu', label: 'Cardápio' },
  { id: 'reviews', label: 'Avaliações' },
  { id: 'contact', label: 'Contato' },
]

export function VenueDetailPage() {
  const { venueId = '' } = useParams()
  const navigate = useNavigate()
  const { api, user } = useAuth()

  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('about')
  const [favorited, setFavorited] = useState(false)
  const [favoriting, setFavoriting] = useState(false)
  const [showAllPromos, setShowAllPromos] = useState(false)
  const [reportTarget, setReportTarget] = useState<ReportDraft | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [draftRating, setDraftRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null)
  type LightboxState =
    | { src: string; kind: 'image'; zoomable?: boolean }
    | { src: string; kind: 'video' }

  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [menuLightboxZoom, setMenuLightboxZoom] = useState(1)
  const [menuLightboxFit, setMenuLightboxFit] = useState<{ w: number; h: number } | null>(null)
  const menuLightboxViewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMenuLightboxZoom(1)
    setMenuLightboxFit(null)
  }, [lightbox?.src, lightbox?.kind])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [lightbox])

  useEffect(() => {
    if (!lightbox || lightbox.kind !== 'image' || !lightbox.zoomable) return
    const el = menuLightboxViewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const step = 0.12
      setMenuLightboxZoom((z) => {
        const next = e.deltaY < 0 ? z + step : z - step
        return Math.min(5, Math.max(1, next))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [lightbox])

  useEffect(() => {
    if (!lightbox || lightbox.kind !== 'image' || !lightbox.zoomable || !menuLightboxFit) return
    const vp = menuLightboxViewportRef.current
    if (!vp) return
    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, (vp.scrollWidth - vp.clientWidth) / 2)
      vp.scrollTop = Math.max(0, (vp.scrollHeight - vp.clientHeight) / 2)
    })
  }, [lightbox, menuLightboxZoom, menuLightboxFit])

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    setError(null)
    try {
      const stored = readStoredCity()
      const query: Record<string, string> = {}
      if (user?.city?.trim()) query.city = user.city.trim()
      else if (stored.city) query.city = stored.city
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 8000,
              maximumAge: 300000,
            })
          })
          query.lat = String(pos.coords.latitude)
          query.lng = String(pos.coords.longitude)
        } catch {
          /* optional */
        }
      }
      const detail = await fetchVenueDetail(api, venueId, query)
      setVenue(detail)
      const favs = user && canFavorite(user) ? await listFavoriteVenueIds(api) : new Set()
      setFavorited(favs.has(venueId))
      const mine = detail.reviews?.find((r) => r.userId === user?.id)
      if (mine) {
        setDraftRating(mine.rating)
        setReviewText(mine.testimonial ?? '')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Estabelecimento não encontrado.')
      setVenue(null)
    } finally {
      setLoading(false)
    }
  }, [api, user, venueId])

  useEffect(() => {
    void load()
  }, [load])

  const loginReturnPath = `venue/${encodeURIComponent(venueId)}`

  function goLogin() {
    navigate('/login', loginNavigationState(loginReturnPath))
  }

  function openReport(draft: ReportDraft) {
    if (!user) {
      goLogin()
      return
    }
    setReportTarget(draft)
  }

  async function toggleFavorite() {
    if (!venueId) return
    if (!canFavorite(user)) {
      goLogin()
      return
    }
    setFavoriting(true)
    try {
      if (favorited) {
        await removeFavorite(api, venueId)
        setFavorited(false)
      } else {
        await addFavorite(api, venueId)
        setFavorited(true)
      }
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível atualizar favorito.')
    } finally {
      setFavoriting(false)
    }
  }

  async function handleBlock() {
    if (!venueId || !user) {
      goLogin()
      return
    }
    if (!window.confirm('Bloquear este estabelecimento? Você poderá desbloquear depois no perfil.')) {
      return
    }
    try {
      await blockVenue(api, venueId)
      navigate('/', { replace: true })
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível bloquear.')
    }
  }

  async function handleReport(
    targetType: ReportTargetType,
    targetId: string,
    reason: Parameters<typeof submitReport>[1]['reason'],
    description: string,
  ) {
    if (!user) {
      goLogin()
      return
    }
    await submitReport(api, {
      targetType,
      targetId,
      reason,
      description: description || undefined,
    })
    setToast(REPORT_SUCCESS_MESSAGE)
  }

  async function onSubmitReview(event: FormEvent) {
    event.preventDefault()
    if (!venueId || !canReview(user, venue)) return
    if (draftRating < 1) {
      setToast('Escolha uma nota de 1 a 5 estrelas.')
      return
    }
    setSubmittingReview(true)
    try {
      const stats = await submitVenueReview(api, venueId, {
        rating: draftRating,
        testimonial: reviewText.trim(),
      })
      setVenue((prev) =>
        prev
          ? {
              ...prev,
              avgRating: stats.avgRating,
              reviewCount: stats.reviewCount,
              reviews: stats.reviews,
            }
          : prev,
      )
      setToast('Avaliação publicada.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível publicar.')
    } finally {
      setSubmittingReview(false)
    }
  }

  async function onSubmitReply(reviewId: string) {
    if (!venueId || !canReply(user, venue)) return
    const reply = replyDrafts[reviewId]?.trim() ?? ''
    if (!reply) {
      setToast('Escreva a resposta do estabelecimento.')
      return
    }
    setSubmittingReplyId(reviewId)
    try {
      const stats = await replyVenueReview(api, venueId, reviewId, reply)
      setVenue((prev) =>
        prev
          ? {
              ...prev,
              avgRating: stats.avgRating,
              reviewCount: stats.reviewCount,
              reviews: stats.reviews,
            }
          : prev,
      )
      setToast('Resposta publicada.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível responder.')
    } finally {
      setSubmittingReplyId(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-warning" role="status">
          <span className="visually-hidden">Carregando…</span>
        </div>
      </div>
    )
  }

  if (error || !venue) {
    return (
      <div className="alert alert-warning">
        <p className="mb-2">{error ?? 'Estabelecimento não encontrado.'}</p>
        <button type="button" className="btn btn-sm btn-outline-dark me-2" onClick={() => void load()}>
          Tentar novamente
        </button>
        <Link to="/" className="btn btn-sm btn-primary">
          Voltar ao início
        </Link>
      </div>
    )
  }

  const cover = resolveMediaUrl(venue.coverUrl ?? venue.logoUrl)
  const category = presentVenueCategory(venue.category)
  const distanceLabel = formatDistanceKm(venue.distanceKm)
  const photos = venue.photos ?? []
  const gallery = galleryPhotos(photos)
  const menu = menuPhotos(photos)
  const contacts = venue.contacts ?? {}
  const banners = venue.banners ?? []
  const visiblePromos = showAllPromos ? banners : banners.slice(0, 1)
  const reviews = venue.reviews ?? []
  const owner = isVenueOwner(user, venue)
  const showSafety = canShowSafetyActions(user, venue)
  const showFavoriteAction = showSafety

  return (
    <div className="after-canvas pb-3">
      {toast ? (
        <div className="alert alert-info alert-dismissible fade show" role="alert">
          {toast}
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      ) : null}

      <div className="after-toolbar venue-detail-toolbar">
        <Link to="/" className="venue-detail-toolbar-btn venue-detail-toolbar-btn--back">
          ← Home
        </Link>
        {showFavoriteAction ? (
          <button
            type="button"
            className={
              favorited
                ? 'venue-detail-toolbar-btn venue-detail-toolbar-btn--fav venue-detail-toolbar-btn--fav-on'
                : 'venue-detail-toolbar-btn venue-detail-toolbar-btn--fav'
            }
            disabled={favoriting && canFavorite(user)}
            onClick={() => void toggleFavorite()}
          >
            {favorited ? 'Favorito' : 'Favoritar'}
          </button>
        ) : null}
        {showSafety ? (
          <button
            type="button"
            className="venue-detail-toolbar-btn venue-detail-toolbar-btn--danger-outline"
            onClick={() =>
              openReport({
                targetType: 'VENUE',
                targetId: venueId,
                title: 'Denunciar estabelecimento',
              })
            }
          >
            Denunciar
          </button>
        ) : null}
        {canBlockOrReport(user, venue) ? (
          <button
            type="button"
            className="venue-detail-toolbar-btn venue-detail-toolbar-btn--danger-outline"
            onClick={() => void handleBlock()}
          >
            Bloquear
          </button>
        ) : null}
      </div>

      <div className="venue-detail">
      <div>
      <div className="venue-hero">
        {cover ? (
          <button
            type="button"
            className="venue-hero-cover-btn"
            onClick={() => setLightbox({ src: cover, kind: 'image' })}
            aria-label="Ampliar foto de capa"
          >
            <img src={cover} alt="" className="w-100 object-fit-cover venue-cover-img" />
          </button>
        ) : (
          <div className="venue-cover-placeholder" aria-hidden />
        )}
      </div>
      <div className="venue-detail-heading px-3">
        <div className="venue-detail-identity">
          {venue.logoUrl ? (
            <button
              type="button"
              className="venue-detail-logo-wrap"
              onClick={() => setLightbox({ src: resolveMediaUrl(venue.logoUrl), kind: 'image' })}
              aria-label="Ampliar logo"
            >
              <img src={resolveMediaUrl(venue.logoUrl)} alt="" className="venue-detail-logo" />
            </button>
          ) : (
            <span className="venue-detail-logo venue-detail-logo--empty d-inline-block" aria-hidden />
          )}
          <h1 className="venue-detail-title">{venue.name}</h1>
          {category ? <div className="venue-detail-category">{category}</div> : null}
          {venue.isOpen != null || distanceLabel ? (
            <div className="venue-detail-status-row">
              {venue.isOpen != null ? (
                <span
                  className={
                    venue.isOpen ? 'venue-detail-status venue-detail-status--open' : 'venue-detail-status venue-detail-status--closed'
                  }
                >
                  {venue.isOpen ? 'Aberto' : 'Fechado'}
                </span>
              ) : null}
              {distanceLabel ? <span className="venue-detail-distance-inline">{distanceLabel}</span> : null}
            </div>
          ) : null}
          <div className="venue-detail-ratings">
            {venue.avgRating != null ? `★ ${venue.avgRating.toFixed(1)}` : 'Sem avaliações'}
            {typeof venue.reviewCount === 'number' && venue.reviewCount > 0
              ? ` · ${venue.reviewCount} ${venue.reviewCount === 1 ? 'avaliação' : 'avaliações'}`
              : null}
          </div>
        </div>
      </div>
      </div>

      <div>
      <div className="venue-tabs px-2 mt-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="px-3 pt-3">

      {tab === 'about' ? (
        <AboutTab
          venue={venue}
          visiblePromos={visiblePromos}
          showAllPromos={showAllPromos}
          onTogglePromos={() => setShowAllPromos((v) => !v)}
          contacts={contacts}
          banners={banners}
          showSafety={showSafety}
          onReportBanner={(bannerId) =>
            openReport({
              targetType: 'BANNER',
              targetId: bannerId,
              title: 'Denunciar promoção',
            })
          }
        />
      ) : null}
      {tab === 'photos' ? (
        <PhotosTab
          gallery={gallery}
          showSafety={showSafety}
          onReport={openReport}
          onExpandMedia={(url, kind) => setLightbox({ src: resolveMediaUrl(url), kind })}
        />
      ) : null}
      {tab === 'menu' ? (
        <MediaGrid
          items={menu}
          empty="Cardápio não publicado."
          showSafety={showSafety}
          onExpand={(url) => setLightbox({ src: resolveMediaUrl(url), kind: 'image', zoomable: true })}
          onReport={(photoId) =>
            openReport({ targetType: 'PHOTO', targetId: photoId, title: 'Denunciar foto' })
          }
        />
      ) : null}
      {tab === 'reviews' ? (
        <ReviewsTab
          reviews={reviews}
          viewerId={user?.id}
          showSafety={showSafety}
          onReportReview={(reviewId) =>
            openReport({
              targetType: 'REVIEW',
              targetId: reviewId,
              title: 'Denunciar avaliação',
            })
          }
          avgRating={venue.avgRating}
          reviewCount={venue.reviewCount ?? 0}
          canReview={canReview(user, venue)}
          canReply={canReply(user, venue)}
          draftRating={draftRating}
          reviewText={reviewText}
          submittingReview={submittingReview}
          replyDrafts={replyDrafts}
          submittingReplyId={submittingReplyId}
          onDraftRating={setDraftRating}
          onReviewText={setReviewText}
          onSubmitReview={onSubmitReview}
          onReplyDraftChange={(id, value) =>
            setReplyDrafts((prev) => ({ ...prev, [id]: value }))
          }
          onSubmitReply={(id) => void onSubmitReply(id)}
          onLogin={goLogin}
        />
      ) : null}
      {tab === 'contact' ? <ContactTab contacts={contacts} /> : null}

      {owner ? (
        <p className="small text-muted mt-4 mb-0">Você está vendo a ficha do seu estabelecimento.</p>
      ) : null}
      </div>
      </div>
      </div>

      {reportTarget ? (
        <ReportModal
          show
          title={reportTarget.title}
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setReportTarget(null)}
          onSubmit={handleReport}
        />
      ) : null}

      {lightbox ? (
        <div
          className="venue-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="venue-lightbox-close"
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox(null)
            }}
          >
            ×
          </button>
          <div className="venue-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {lightbox.kind === 'image' ? (
              lightbox.zoomable ? (
                <div
                  ref={menuLightboxViewportRef}
                  className="venue-lightbox-menu-viewport"
                  role="presentation"
                >
                  <img
                    src={lightbox.src}
                    alt=""
                    className={
                      menuLightboxFit
                        ? 'venue-lightbox-img venue-lightbox-img--menu-zoom'
                        : 'venue-lightbox-img venue-lightbox-img--menu-zoom-loading'
                    }
                    draggable={false}
                    onLoad={(e) => {
                      const im = e.currentTarget
                      requestAnimationFrame(() => {
                        const nw = im.naturalWidth
                        const nh = im.naturalHeight
                        if (!nw || !nh) return
                        const vp = menuLightboxViewportRef.current
                        const maxW =
                          vp && vp.clientWidth > 0 ? vp.clientWidth : Math.floor(window.innerWidth * 0.92)
                        const maxH =
                          vp && vp.clientHeight > 0 ? vp.clientHeight : Math.floor(window.innerHeight * 0.85)
                        const scale = Math.min(maxW / nw, maxH / nh, 1)
                        setMenuLightboxFit({ w: Math.round(nw * scale), h: Math.round(nh * scale) })
                      })
                    }}
                    style={
                      menuLightboxFit
                        ? {
                            width: Math.round(menuLightboxFit.w * menuLightboxZoom),
                            height: Math.round(menuLightboxFit.h * menuLightboxZoom),
                            maxWidth: 'none',
                            maxHeight: 'none',
                            display: 'block',
                          }
                        : undefined
                    }
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setMenuLightboxZoom(1)
                      const vp = menuLightboxViewportRef.current
                      if (vp) {
                        requestAnimationFrame(() => {
                          vp.scrollLeft = Math.max(0, (vp.scrollWidth - vp.clientWidth) / 2)
                          vp.scrollTop = Math.max(0, (vp.scrollHeight - vp.clientHeight) / 2)
                        })
                      }
                    }}
                  />
                </div>
              ) : (
                <img src={lightbox.src} alt="" className="venue-lightbox-img" />
              )
            ) : (
              <video className="venue-lightbox-video" src={lightbox.src} controls playsInline />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AboutTab(props: {
  venue: VenueDetail
  visiblePromos: VenueBanner[]
  showAllPromos: boolean
  onTogglePromos: () => void
  contacts: VenueContacts
  banners: VenueBanner[]
  showSafety: boolean
  onReportBanner: (bannerId: string) => void
}) {
  const { venue, visiblePromos, contacts, banners } = props
  const cityLine = [venue.city, venue.state].filter(Boolean).join(', ')
  const street = contacts.address?.toString()
  const hours = parseHoursRows(venue.hoursJson ?? undefined)
  const amenities = VENUE_AMENITIES.filter((a) => contacts[a.key] === true)

  return (
    <div className="vstack gap-4">
      <section>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h2 className="h6 fw-bold mb-0">Promoções em destaque</h2>
          {banners.length > 1 ? (
            <button type="button" className="venue-promo-toggle-btn" onClick={props.onTogglePromos}>
              {props.showAllPromos ? 'Ver menos' : 'Ver todas'}
            </button>
          ) : null}
        </div>
        {visiblePromos.length === 0 ? (
          <p className="text-muted small">Nenhuma promoção publicada ainda.</p>
        ) : (
          visiblePromos.map((banner) => (
            <PromoRow
              key={banner.id}
              banner={banner}
              showSafety={props.showSafety}
              onReport={() => props.onReportBanner(banner.id)}
            />
          ))
        )}
      </section>
      <section>
        <h2 className="h6 fw-bold">Comodidades</h2>
        {amenities.length === 0 ? (
          <p className="text-muted small">Nenhuma comodidade informada.</p>
        ) : (
          <ul className="list-unstyled row g-2 mb-0">
            {amenities.map((item) => (
              <li key={item.key} className="col-12 col-md-6 small">
                • {item.label}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="h6 fw-bold">Entrada</h2>
        <p className="small mb-0">{formatVenueEntry(contacts)}</p>
      </section>
      <section>
        <h2 className="h6 fw-bold">Endereço</h2>
        {street ? <p className="mb-1">{street}</p> : null}
        {cityLine ? <p className="text-muted small mb-2">{cityLine}</p> : null}
        {venue.lat != null && venue.lng != null ? (
          <>
            <VenueMapEmbed lat={venue.lat} lng={venue.lng} label={venue.name} />
            <a
              className="btn btn-sm btn-outline-primary mt-2"
              href={googleMapsSearchUrl(venue.lat, venue.lng, venue.city ?? '', venue.state ?? '')}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no mapa
            </a>
          </>
        ) : (
          <a
            className="btn btn-sm btn-outline-primary"
            href={googleMapsSearchUrl(null, null, venue.city ?? '', venue.state ?? '')}
            target="_blank"
            rel="noreferrer"
          >
            Abrir no mapa
          </a>
        )}
      </section>
      <section>
        <h2 className="h6 fw-bold">Horários</h2>
        <ul className="list-unstyled small mb-0">
          {hours.map((row) => (
            <li key={row.day} className="d-flex justify-content-between py-1 border-bottom">
              <span>{row.day}</span>
              <span className="text-muted">{row.hours}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function PromoRow({
  banner,
  showSafety,
  onReport,
}: {
  banner: VenueBanner
  showSafety: boolean
  onReport: () => void
}) {
  const [imageExpanded, setImageExpanded] = useState(false)
  const imageUrl = resolveMediaUrl(banner.imageUrl)
  const schedules = banner.schedules ?? []
  const vip = schedules.some((s) => s.tier === 'VIP')
  const dateLabel =
    schedules.length > 0
      ? formatStoredCalendarDate(schedules[0].displayDate)
      : ''
  return (
    <div className="venue-promo-row">
      <div className="d-flex gap-3 align-items-start">
        {imageUrl ? (
          <button
            type="button"
            className="venue-promo-thumb-btn"
            onClick={() => setImageExpanded((v) => !v)}
            aria-expanded={imageExpanded}
            aria-label={imageExpanded ? 'Recolher imagem da promoção' : 'Ampliar imagem da promoção'}
          >
            <img src={imageUrl} alt="" className="venue-promo-thumb-img" width={72} height={72} />
            <span className="venue-promo-thumb-hint small" aria-hidden>
              {imageExpanded ? 'Recolher' : 'Ampliar'}
            </span>
          </button>
        ) : null}
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <strong className="small">{banner.title?.trim() || 'Promoção do dia'}</strong>
            {vip ? <span className="badge text-bg-warning text-dark">VIP</span> : null}
          </div>
          {banner.description ? <p className="small text-muted mb-1">{banner.description}</p> : null}
          {dateLabel ? (
            <p className="small mb-0" style={{ color: 'var(--after-brand)' }}>
              Válido para o dia {dateLabel}
            </p>
          ) : null}
          {showSafety && banner.id ? (
            <button type="button" className="venue-promo-report-btn" onClick={onReport}>
              Denunciar promoção
            </button>
          ) : null}
        </div>
      </div>
      {imageUrl && imageExpanded ? (
        <div className="venue-promo-expanded mt-3">
          <a href={imageUrl} target="_blank" rel="noreferrer" className="venue-promo-expanded-link">
            <img src={imageUrl} alt="" className="venue-promo-expanded-img" />
          </a>
        </div>
      ) : null}
    </div>
  )
}

function PhotosTab({
  gallery,
  showSafety,
  onReport,
  onExpandMedia,
}: {
  gallery: VenuePhoto[]
  showSafety: boolean
  onReport: (draft: ReportDraft) => void
  onExpandMedia: (url: string, kind: 'image' | 'video') => void
}) {
  const images = gallery.filter((p) => !isVideoMedia(p))
  const videos = gallery.filter((p) => isVideoMedia(p))
  if (images.length === 0 && videos.length === 0) {
    return <p className="text-muted text-center py-4">Nenhuma foto.</p>
  }
  return (
    <div className="vstack gap-4">
      {images.length > 0 ? (
        <MediaGrid
          items={images}
          empty=""
          showSafety={showSafety}
          onExpand={(url) => onExpandMedia(url, 'image')}
          onReport={(photoId) =>
            onReport({ targetType: 'PHOTO', targetId: photoId, title: 'Denunciar foto' })
          }
        />
      ) : null}
      {videos.length > 0 ? (
        <section>
          <h2 className="h6 fw-bold mb-2">Vídeos</h2>
          <div className="vstack gap-3">
            {videos.map((item) => (
              <div key={item.id} className="venue-media-video-cell">
                <div className="venue-media-frame venue-media-frame--video">
                  {showSafety && item.id ? (
                    <button
                      type="button"
                      className="venue-media-report-icon"
                      aria-label="Denunciar vídeo"
                      onClick={(e) => {
                        e.stopPropagation()
                        onReport({
                          targetType: 'VIDEO',
                          targetId: item.id,
                          title: 'Denunciar vídeo',
                        })
                      }}
                    >
                      <IconFlag size={14} />
                    </button>
                  ) : null}
                  <video
                    className="w-100 rounded venue-media-video-el"
                    controls
                    preload="metadata"
                    src={resolveMediaUrl(item.url)}
                    title="Duplo clique para ampliar"
                    onDoubleClick={() => onExpandMedia(item.url, 'video')}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function MediaGrid(props: {
  items: { id: string; url: string }[]
  empty: string
  showSafety?: boolean
  onReport?: (photoId: string) => void
  onExpand?: (url: string) => void
}) {
  if (props.items.length === 0) {
    return props.empty ? <p className="text-muted text-center py-4">{props.empty}</p> : null
  }
  return (
    <div className="row g-2">
      {props.items.map((item) => (
        <div key={item.id} className="col-6 col-md-4 venue-media-cell">
          <div className="venue-media-frame">
            {props.showSafety && props.onReport && item.id ? (
              <button
                type="button"
                className="venue-media-report-icon"
                aria-label="Denunciar"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onReport?.(item.id)
                }}
              >
                <IconFlag size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className="venue-media-thumb-btn ratio ratio-1x1"
              onClick={() => props.onExpand?.(item.url)}
            >
              <img
                src={resolveMediaUrl(item.url)}
                alt=""
                className="rounded object-fit-cover w-100 h-100"
                loading="lazy"
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PhoneGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6.6 10.8c1.45 1.57 3.03 3.12 4.6 4.57 1.02.95 2.45.9 3.4-.12l1.05-1.15c.35-.38.9-.5 1.37-.28l2.6 1.18c.62.28.92.98.7 1.6-.55 1.55-1.95 2.65-3.6 2.9-4.85.5-10.35-4.55-12.55-9.9-.65-1.55-.35-3.3 1-4.4l1.2-.95c.52-.42 1.28-.32 1.68.22l1.38 1.85c.28.38.22.9-.12 1.22L8.5 7.4c-.45.48-.48 1.22-.08 1.78l-1.82 1.62z"
      />
    </svg>
  )
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20.52 3.48A11.87 11.87 0 0 0 12.02 0C5.4 0 .14 5.25.12 11.87c0 2.1.55 4.15 1.6 5.96L0 24l6.33-1.66a11.82 11.82 0 0 0 5.68 1.45h.01c6.63 0 12-5.37 12-12 0-3.2-1.25-6.2-3.5-8.45zM12.04 21.9h-.01a9.8 9.8 0 0 1-5-1.36l-.36-.21-3.7.97.99-3.6-.23-.38a9.86 9.86 0 0 1-1.5-5.25c.02-5.43 4.44-9.85 9.89-9.85 2.64 0 5.12 1.03 6.98 2.9a9.82 9.82 0 0 1 2.88 7c-.02 5.43-4.44 9.84-9.89 9.84zm5.4-7.15c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.38-.02-.53-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.52 0 1.48 1.08 2.91 1.23 3.11.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.12-.28-.2-.58-.35z"
      />
    </svg>
  )
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zm5.75-3.25a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"
      />
    </svg>
  )
}

function ContactTab({ contacts }: { contacts: VenueContacts }) {
  const phone = contacts.phone?.toString().trim() ?? ''
  const whatsapp = contacts.whatsapp?.toString().trim() ?? ''
  const instagram = contacts.instagram?.toString().trim() ?? ''
  if (!phone && !whatsapp && !instagram) {
    return <p className="text-muted text-center py-4">Contato não informado.</p>
  }
  return (
    <div className="venue-contact-actions vstack gap-3">
      {phone ? (
        <a className="venue-contact-btn venue-contact-btn--phone" href={telUrl(phone)}>
          <span className="venue-contact-btn-icon" aria-hidden>
            <PhoneGlyph />
          </span>
          <span className="venue-contact-btn-text">
            <span className="venue-contact-btn-title">Ligar / reservas</span>
            <span className="venue-contact-btn-sub">{formatPhoneDisplay(phone)}</span>
          </span>
        </a>
      ) : null}
      {whatsapp ? (
        <a
          className="venue-contact-btn venue-contact-btn--whatsapp"
          href={whatsappUrl(whatsapp)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="venue-contact-btn-icon" aria-hidden>
            <WhatsAppGlyph />
          </span>
          <span className="venue-contact-btn-text">
            <span className="venue-contact-btn-title">WhatsApp</span>
            <span className="venue-contact-btn-sub">{formatPhoneDisplay(whatsapp)}</span>
          </span>
        </a>
      ) : null}
      {instagram ? (
        <a
          className="venue-contact-btn venue-contact-btn--instagram"
          href={instagramUrl(instagram)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="venue-contact-btn-icon" aria-hidden>
            <InstagramGlyph />
          </span>
          <span className="venue-contact-btn-text">
            <span className="venue-contact-btn-title">Instagram</span>
            <span className="venue-contact-btn-sub">{instagramHandle(instagram)}</span>
          </span>
        </a>
      ) : null}
    </div>
  )
}

function ReviewsTab(props: {
  reviews: VenueReview[]
  avgRating: number | null | undefined
  reviewCount: number
  canReview: boolean
  canReply: boolean
  showSafety: boolean
  viewerId?: string
  draftRating: number
  reviewText: string
  submittingReview: boolean
  replyDrafts: Record<string, string>
  submittingReplyId: string | null
  onDraftRating: (n: number) => void
  onReviewText: (t: string) => void
  onSubmitReview: (e: FormEvent) => void
  onReplyDraftChange: (id: string, value: string) => void
  onSubmitReply: (id: string) => void
  onReportReview: (reviewId: string) => void
  onLogin: () => void
}) {
  return (
    <div className="vstack gap-4">
      {props.reviewCount > 0 && props.avgRating != null ? (
        <p className="mb-0 fw-semibold">
          Média {props.avgRating.toFixed(1).replace('.', ',')} — {props.reviewCount} avaliações
        </p>
      ) : (
        <p className="text-muted small">Nenhuma avaliação ainda.</p>
      )}
      {props.canReview ? (
        <form onSubmit={props.onSubmitReview} className="card card-body border-0 shadow-sm">
          <h3 className="h6">Sua avaliação</h3>
          <div className="mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`btn btn-sm me-1 ${props.draftRating >= star ? 'btn-warning' : 'btn-outline-secondary'}`}
                onClick={() => props.onDraftRating(star)}
              >
                {star}★
              </button>
            ))}
          </div>
          <textarea
            className="form-control mb-2"
            rows={3}
            placeholder="Conte sua experiência (opcional)"
            value={props.reviewText}
            onChange={(e) => props.onReviewText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={props.submittingReview}>
            {props.submittingReview ? 'Publicando…' : 'Publicar avaliação'}
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-sm btn-outline-primary align-self-start" onClick={props.onLogin}>
          Entrar para avaliar
        </button>
      )}
      <div className="vstack gap-3">
        {props.reviews.map((review) => (
          <article key={review.id} className="border rounded p-3 bg-white">
            <div className="d-flex justify-content-between gap-2 align-items-start">
              <strong className="small">{review.user?.name ?? 'Usuário'}</strong>
              <div className="d-flex align-items-center gap-2">
                <span className="small text-warning">{review.rating}★</span>
                {props.showSafety &&
                review.id &&
                review.userId !== props.viewerId ? (
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-danger p-0"
                    onClick={() => props.onReportReview(review.id)}
                  >
                    Denunciar
                  </button>
                ) : null}
              </div>
            </div>
            {review.testimonial ? <p className="small mb-2 mt-1">{review.testimonial}</p> : null}
            {review.venueReply ? (
              <div className="bg-light rounded p-2 small">
                <strong>Resposta do local:</strong> {review.venueReply}
              </div>
            ) : null}
            {props.canReply && !review.venueReply ? (
              <div className="mt-2">
                <textarea
                  className="form-control form-control-sm mb-2"
                  rows={2}
                  placeholder="Responder avaliação"
                  value={props.replyDrafts[review.id] ?? ''}
                  onChange={(e) => props.onReplyDraftChange(review.id, e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  disabled={props.submittingReplyId === review.id}
                  onClick={() => props.onSubmitReply(review.id)}
                >
                  {props.submittingReplyId === review.id ? 'Enviando…' : 'Publicar resposta'}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}
