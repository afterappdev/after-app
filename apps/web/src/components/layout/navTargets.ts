import { isVenueUser, type AuthUser } from '../../api/types/auth'

export const PUBLICATION_CREDITS_PATH = '/estabelecimento/creditos'
export const NEW_PUBLICATION_PATH = `${PUBLICATION_CREDITS_PATH}#nova-publicacao`
export const BUY_CREDITS_PATH = '/estabelecimento/creditos/comprar'

/** Rota da tela Publicar (não inclui Comprar créditos). */
export function isPublicationCreditsRoute(pathname: string): boolean {
  return pathname === PUBLICATION_CREDITS_PATH || pathname === `${PUBLICATION_CREDITS_PATH}/`
}

export type ThirdSlot = {
  to: string
  label: 'Publicar' | 'Favoritos'
  state?: { from: string }
}

/** Flutter `AfterBottomNav`: Publicar só para VENUE (tela de nova publicação). Demais: Favoritos. Visitante pede login. */
export function thirdSlot(user: AuthUser | null | undefined): ThirdSlot {
  if (isVenueUser(user)) {
    return { to: NEW_PUBLICATION_PATH, label: 'Publicar' }
  }
  if (user) return { to: '/perfil/favoritos', label: 'Favoritos' }
  return { to: '/login', label: 'Favoritos', state: { from: 'perfil/favoritos' } }
}
