import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchVenueDetail } from '../../api/venues'
import { useAuth } from '../../auth/AuthContext'
import { MULTI_VENUE_ENABLED } from '../../auth/ActiveVenueContext'
import { IconPerson, IconPin, IconStore } from '../../components/icons/AfterIcons'
import { presentVenueCategory } from '../../constants/venueCategories'
import { resolveMediaUrl } from '../../utils/mediaUrl'

export function VenueLocalProfile() {
  const { api, user } = useAuth()
  const [logo, setLogo] = useState('')
  const [name, setName] = useState(user?.name ?? 'Estabelecimento')
  const [category, setCategory] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const id = user?.venueId
    if (!id) return
    void fetchVenueDetail(api, id)
      .then((venue) => {
        setName(venue.name || user?.name || 'Estabelecimento')
        setLogo(resolveMediaUrl(venue.logoUrl))
        setCategory(presentVenueCategory(venue.category))
      })
      .catch(() => {})
  }, [api, user?.name, user?.venueId])

  return (
    <div className="after-canvas">
      <h1 className="text-center fw-bold mb-4 venue-local-page-title">Perfil do local</h1>
      <div className="desk-split">
      <div>
      <div className="venue-local-hero mb-4">
        {logo ? (
          <img
            src={logo}
            alt=""
            width={144}
            height={144}
            className="venue-local-logo-img"
          />
        ) : (
          <span className="venue-local-logo-placeholder rounded-circle d-inline-flex align-items-center justify-content-center">
            <IconStore size={62} />
          </span>
        )}
        <div className="venue-local-hero-text">
          <div className="venue-local-name">{name}</div>
          {category ? <div className="venue-local-category">{category}</div> : null}
          {user?.email ? <div className="venue-local-email">{user.email}</div> : null}
        </div>
      </div>

      {notice ? <p className="small text-center" style={{ color: '#8b8b96' }}>{notice}</p> : null}

      <button
        type="button"
        className="venue-account-row w-100 mb-2"
        onClick={() =>
          setNotice(
            MULTI_VENUE_ENABLED
              ? 'Seletor de locais ativo.'
              : 'Vários estabelecimentos ainda não estão habilitados nesta versão.',
          )
        }
      >
        <IconStore />
        <span>
          <strong>Adicionar estabelecimento</strong>
          <small>Outro local na mesma conta</small>
        </span>
      </button>
      <button
        type="button"
        className="venue-account-row venue-account-row--danger w-100 mb-3"
        onClick={() =>
          setNotice(
            'Excluir o estabelecimento não tem endpoint nesta API. Para encerrar a conta, use Excluir conta do local.',
          )
        }
      >
        <span>
          <strong>Excluir estabelecimento</strong>
        </span>
      </button>

      </div>
      <div>
      <p className="venue-account-label">GERENCIAR</p>
      <div className="venue-account-card">
        <Link to={user?.venueId ? `/venue/${user.venueId}` : '/'} className="venue-account-row">
          <IconPerson />
          <span>
            <strong>Ver página do local</strong>
            <small>Como o público vê seu perfil</small>
          </span>
        </Link>
        <Link to="/estabelecimento" state={{ panelTab: 'general' }} className="venue-account-row">
          <IconPin />
          <span>
            <strong>Editar perfil do local</strong>
            <small>Mídia, horários e contatos</small>
          </span>
        </Link>
        <Link to="/estabelecimento/creditos" className="venue-account-row">
          <IconStore />
          <span>
            <strong>Créditos e banners</strong>
            <small>Publique promoções do dia</small>
          </span>
        </Link>
        <Link to="/estabelecimento" state={{ panelTab: 'fiscal' }} className="venue-account-row">
          <IconPin />
          <span>
            <strong>Documento fiscal</strong>
            <small>Consultar ou atualizar CPF/CNPJ</small>
          </span>
        </Link>
      </div>

      <Link to="/perfil/conta" className="btn venue-delete-account-btn w-100 mt-3">
        Excluir conta do local
      </Link>
      </div>
      </div>
    </div>
  )
}
