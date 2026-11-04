import { useCallback, useEffect, useMemo, useState } from 'react'
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
  { id: 'photos', label: 'Fotos' },
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

  const shareUrl = useMemo(() => {
    if (!venueId) return ''
    const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
    return `${base}/#/venue/${encodeURIComponent(venueId)}`
  }, [venueId])

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
    <div className="mx-auto pb-4" style={{ maxWidth: 820 }}>
      {toast ? (
        <div className="alert alert-info alert-dismissible fade show" role="alert">
          {toast}
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      ) : null}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Link to="/" className="btn btn-sm btn-outline-secondary">
          ← Voltar
        </Link>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={() => void navigator.clipboard.writeText(shareUrl)}
        >
          Compartilhar link
        </button>
        {showFavoriteAction ? (
          <button
            type="button"
            className={`btn btn-sm ${favorited ? 'btn-warning' : 'btn-outline-warning'}`}
            disabled={favoriting && canFavorite(user)}
            onClick={() => void toggleFavorite()}
          >
            {favorited ? 'Favorito' : 'Favoritar'}
          </button>
        ) : null}
        {showSafety ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
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
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void handleBlock()}>
            Bloquear
          </button>
        ) : null}
      </div>

      <div className="card border-0 shadow-sm overflow-hidden mb-3">
        {cover ? (
          <img src={cover} alt="" className="w-100 object-fit-cover" style={{ maxHeight: 220 }} />
        ) : (
          <div className="bg-light text-center py-5 text-muted">Sem capa</div>
        )}
        <div className="card-body">
          <div className="d-flex align-items-start gap-3">
            {venue.logoUrl ? (
              <img
                src={resolveMediaUrl(venue.logoUrl)}
                alt=""
                className="rounded border"
                width={64}
                height={64}
                style={{ objectFit: 'cover' }}
              />
            ) : null}
            <div>
              <h1 className="h4 after-brand-text mb-1">{venue.name}</h1>
              {category ? <p className="text-muted small mb-1">{category}</p> : null}
              <div className="d-flex flex-wrap gap-2 small">
                {venue.isOpen != null ? (
                  <span className={`badge ${venue.isOpen ? 'text-bg-success' : 'text-bg-secondary'}`}>
                    {venue.isOpen ? 'Aberto agora' : 'Fechado'}
                  </span>
                ) : null}
                {distanceLabel ? <span className="text-muted">{distanceLabel}</span> : null}
                {venue.avgRating != null && venue.reviewCount ? (
                  <span className="text-muted">
                    ★ {venue.avgRating.toFixed(1).replace('.', ',')} ({venue.reviewCount})
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {venue.description ? (
            <p className="mt-3 mb-0 text-muted">{venue.description}</p>
          ) : null}
        </div>
      </div>

      <ul className="nav nav-tabs flex-nowrap overflow-auto mb-3">
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
        <PhotosTab gallery={gallery} showSafety={showSafety} onReport={openReport} />
      ) : null}
      {tab === 'menu' ? (
        <MediaGrid
          items={menu}
          empty="Cardápio não publicado."
          showSafety={showSafety}
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
            <button type="button" className="btn btn-link btn-sm" onClick={props.onTogglePromos}>
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
  const imageUrl = resolveMediaUrl(banner.imageUrl)
  const schedules = banner.schedules ?? []
  const vip = schedules.some((s) => s.tier === 'VIP')
  const dateLabel =
    schedules.length > 0
      ? formatStoredCalendarDate(schedules[0].displayDate)
      : ''
  return (
    <div className="d-flex gap-3 mb-3 align-items-start">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="rounded" width={72} height={72} style={{ objectFit: 'cover' }} />
      ) : null}
      <div>
        <div className="d-flex align-items-center gap-2">
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
          <button type="button" className="btn btn-link btn-sm text-danger px-0" onClick={onReport}>
            Denunciar promoção
          </button>
        ) : null}
      </div>
    </div>
  )
}

function PhotosTab({
  gallery,
  showSafety,
  onReport,
}: {
  gallery: VenuePhoto[]
  showSafety: boolean
  onReport: (draft: ReportDraft) => void
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
              <div key={item.id}>
                <video
                  className="w-100 rounded"
                  controls
                  preload="metadata"
                  src={resolveMediaUrl(item.url)}
                />
                {showSafety && item.id ? (
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-danger px-0 mt-1"
                    onClick={() =>
                      onReport({
                        targetType: 'VIDEO',
                        targetId: item.id,
                        title: 'Denunciar vídeo',
                      })
                    }
                  >
                    Denunciar vídeo
                  </button>
                ) : null}
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
}) {
  if (props.items.length === 0) {
    return props.empty ? <p className="text-muted text-center py-4">{props.empty}</p> : null
  }
  return (
    <div className="row g-2">
      {props.items.map((item) => (
        <div key={item.id} className="col-6 col-md-4">
          <a href={resolveMediaUrl(item.url)} target="_blank" rel="noreferrer" className="d-block ratio ratio-1x1">
            <img
              src={resolveMediaUrl(item.url)}
              alt=""
              className="rounded object-fit-cover w-100 h-100"
              loading="lazy"
            />
          </a>
          {props.showSafety && props.onReport && item.id ? (
            <button
              type="button"
              className="btn btn-link btn-sm text-danger px-0 mt-1"
              onClick={() => props.onReport?.(item.id)}
            >
              Denunciar
            </button>
          ) : null}
        </div>
      ))}
    </div>
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
    <div className="vstack gap-3">
      {phone ? (
        <a className="btn btn-outline-primary text-start" href={telUrl(phone)}>
          Reservas — {formatPhoneDisplay(phone)}
        </a>
      ) : null}
      {whatsapp ? (
        <a className="btn btn-success text-start" href={whatsappUrl(whatsapp)} target="_blank" rel="noreferrer">
          WhatsApp — {formatPhoneDisplay(whatsapp)}
        </a>
      ) : null}
      {instagram ? (
        <a className="btn btn-outline-danger text-start" href={instagramUrl(instagram)} target="_blank" rel="noreferrer">
          Instagram — {instagramHandle(instagram)}
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
