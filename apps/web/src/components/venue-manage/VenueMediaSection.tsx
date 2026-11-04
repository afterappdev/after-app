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
  onAddGallery: (video: boolean) => void
  onAddMenu: () => void
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
    <div className="col-6 col-md-4">
      {video ? (
        <video className="w-100 rounded" controls preload="metadata" src={url} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="d-block ratio ratio-1x1">
          <img src={url} alt="" className="rounded object-fit-cover w-100 h-100" />
        </a>
      )}
      <button
        type="button"
        className="btn btn-link btn-sm text-danger px-0 mt-1"
        disabled={busy}
        onClick={onRemove}
      >
        Remover
      </button>
    </div>
  )
}

export function VenueMediaSection(props: Props) {
  const gallery = galleryPhotos(props.photos)
  const menu = menuPhotos(props.photos)
  const logo = resolveMediaUrl(props.logoUrl)
  const cover = resolveMediaUrl(props.coverUrl)

  return (
    <div className="vstack gap-4">
      <section>
        <h2 className="h6 fw-bold">Logo e capa</h2>
        <div className="row g-3">
          <div className="col-md-6">
            <p className="small text-muted mb-1">Logo</p>
            {logo ? (
              <img src={logo} alt="" className="rounded border mb-2" width={96} height={96} style={{ objectFit: 'cover' }} />
            ) : (
              <div className="bg-light rounded mb-2" style={{ width: 96, height: 96 }} />
            )}
            <label className="btn btn-sm btn-outline-primary mb-0">
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
          <div className="col-md-6">
            <p className="small text-muted mb-1">Capa</p>
            {cover ? (
              <img src={cover} alt="" className="rounded border mb-2 w-100" style={{ maxHeight: 120, objectFit: 'cover' }} />
            ) : (
              <div className="bg-light rounded mb-2 w-100" style={{ height: 80 }} />
            )}
            <label className="btn btn-sm btn-outline-primary mb-0">
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
      </section>
      <section>
        <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
          <h2 className="h6 fw-bold mb-0">Galeria e vídeos</h2>
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={props.busy} onClick={() => props.onAddGallery(false)}>
            + Foto
          </button>
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={props.busy} onClick={() => props.onAddGallery(true)}>
            + Vídeo
          </button>
        </div>
        {gallery.length === 0 ? (
          <p className="text-muted small">Nenhuma mídia na galeria.</p>
        ) : (
          <div className="row g-2">
            {gallery.map((photo) => (
              <MediaThumb
                key={photo.id}
                photo={photo}
                busy={props.busy}
                onRemove={() => props.onRemovePhoto(photo)}
              />
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
          <h2 className="h6 fw-bold mb-0">Cardápio</h2>
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={props.busy} onClick={props.onAddMenu}>
            + Foto do cardápio
          </button>
        </div>
        {menu.length === 0 ? (
          <p className="text-muted small">Cardápio não publicado.</p>
        ) : (
          <div className="row g-2">
            {menu.map((photo) => (
              <MediaThumb
                key={photo.id}
                photo={photo}
                busy={props.busy}
                onRemove={() => props.onRemovePhoto(photo)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
