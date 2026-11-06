import type { VenuePhoto } from '../../features/venue/types'
import { galleryPhotos, isVideoMedia, menuPhotos } from '../../utils/mediaKind'
import { resolveMediaUrl } from '../../utils/mediaUrl'

type Props = {
  photos: VenuePhoto[]
  logoUrl: string | null
  coverUrl: string | null
  busy: boolean
  onUploadLogo: (file: File) => void
  onUploadCover: (file: File) => void
  onOpenGalleryPicker: () => void
  onOpenMenuPicker: () => void
  onRemovePhoto: (photo: VenuePhoto) => void
}

function MediaThumb({
  photo,
  onRemove,
  busy,
}: {
  photo: VenuePhoto
  onRemove: () => void
  busy: boolean
}) {
  const video = isVideoMedia(photo)
  const url = resolveMediaUrl(photo.url)
  return (
    <div className="venue-media-grid-cell">
      {video ? (
        <video className="venue-media-grid-thumb rounded w-100" controls preload="metadata" src={url} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="venue-media-grid-thumb-link d-block rounded overflow-hidden">
          <img src={url} alt="" className="venue-media-grid-thumb-img" />
        </a>
      )}
      <button
        type="button"
        className="btn btn-link btn-sm text-danger px-0 mt-1 align-self-start"
        disabled={busy}
        onClick={onRemove}
      >
        Remover
      </button>
    </div>
  )
}

function PhotoVideoAddTile({ busy, onOpenPicker }: { busy: boolean; onOpenPicker: () => void }) {
  return (
    <button
      type="button"
      className="venue-media-add-tile"
      disabled={busy}
      onClick={onOpenPicker}
      aria-label="Adicionar foto ou vídeo à galeria"
    >
      <span className="venue-media-add-tile-plus" aria-hidden>
        +
      </span>
      <span className="venue-media-add-tile-caption small text-muted">Foto ou vídeo</span>
      <span className="venue-media-add-tile-hint small">Toque para escolher</span>
    </button>
  )
}

function MenuAddTile({ busy, onOpenPicker }: { busy: boolean; onOpenPicker: () => void }) {
  return (
    <button
      type="button"
      className="venue-media-add-tile venue-media-add-tile--menu"
      disabled={busy}
      onClick={onOpenPicker}
      aria-label="Adicionar foto do cardápio"
    >
      <span className="venue-media-add-tile-plus" aria-hidden>
        +
      </span>
      <span className="venue-media-add-tile-caption small text-muted">Cardápio</span>
      <span className="venue-media-add-tile-hint small">Toque para escolher</span>
    </button>
  )
}

export function VenueMediaSection(props: Props) {
  const gallery = galleryPhotos(props.photos)
  const menu = menuPhotos(props.photos)
  const logo = resolveMediaUrl(props.logoUrl)
  const cover = resolveMediaUrl(props.coverUrl)

  return (
    <div className="vstack gap-4 venue-panel-media-tab">
      <section className="venue-media-brand-section">
        <h2 className="h6 fw-bold mb-3">Logo e capa</h2>
        <div className="venue-media-brand-row">
          <div className="venue-media-logo-col">
            <div className="venue-media-preview-wrap venue-media-preview-wrap--logo">
              {logo ? (
                <img src={logo} alt="" className="venue-media-logo-circle" width={160} height={160} />
              ) : (
                <div className="venue-media-logo-placeholder" aria-hidden />
              )}
            </div>
            <div className="venue-media-btn-row">
              <label className="venue-media-upload-btn venue-media-upload-btn--logo mb-0">
                Enviar logo
                <input
                  type="file"
                  accept="image/*"
                  className="d-none"
                  disabled={props.busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) props.onUploadLogo(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
          <div className="venue-media-cover-col">
            <div className="venue-media-preview-wrap venue-media-preview-wrap--cover">
              {cover ? (
                <img src={cover} alt="" className="venue-media-cover-img" />
              ) : (
                <div className="venue-media-cover-placeholder" aria-hidden />
              )}
            </div>
            <div className="venue-media-btn-row">
              <label className="venue-media-upload-btn venue-media-upload-btn--cover mb-0">
                Enviar capa
                <input
                  type="file"
                  accept="image/*"
                  className="d-none"
                  disabled={props.busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) props.onUploadCover(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </section>
      <section className="venue-media-grid-section">
        <h2 className="h6 fw-bold mb-3 venue-media-grid-section-title">Galeria e vídeos</h2>
        <div className="venue-media-photo-grid">
          <PhotoVideoAddTile busy={props.busy} onOpenPicker={props.onOpenGalleryPicker} />
          {gallery.map((photo) => (
            <MediaThumb
              key={photo.id}
              photo={photo}
              busy={props.busy}
              onRemove={() => props.onRemovePhoto(photo)}
            />
          ))}
        </div>
        {gallery.length === 0 ? (
          <p className="text-muted small mt-2 mb-0 venue-media-grid-section-hint">Toque no + para enviar foto ou vídeo (o tipo é detectado pelo arquivo).</p>
        ) : null}
      </section>
      <section className="venue-media-grid-section">
        <h2 className="h6 fw-bold mb-3 venue-media-grid-section-title">Cardápio</h2>
        <div className="venue-media-photo-grid">
          <MenuAddTile busy={props.busy} onOpenPicker={props.onOpenMenuPicker} />
          {menu.map((photo) => (
            <MediaThumb
              key={photo.id}
              photo={photo}
              busy={props.busy}
              onRemove={() => props.onRemovePhoto(photo)}
            />
          ))}
        </div>
        {menu.length === 0 ? (
          <p className="text-muted small mt-2 mb-0 venue-media-grid-section-hint">Toque no + para enviar a primeira foto do cardápio.</p>
        ) : null}
      </section>
    </div>
  )
}
