import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { changeUserPassword, requestAccountDeletion } from '../../api/users'
import { useAuth } from '../../auth/AuthContext'

export function AccountSettingsPage() {
  const { api, logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const recovery = (location.state as { recovery?: boolean } | null)?.recovery

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  const [deletionLoading, setDeletionLoading] = useState(false)
  const [deletionMessage, setDeletionMessage] = useState<string | null>(null)
  const [deletionError, setDeletionError] = useState<string | null>(null)

  async function onChangePassword(event: FormEvent) {
    event.preventDefault()
    setPwLoading(true)
    setPwMessage(null)
    setPwError(null)
    try {
      await changeUserPassword(api, currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setPwMessage('Senha alterada.')
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha.')
    } finally {
      setPwLoading(false)
    }
  }

  async function onRequestDeletion() {
    if (
      !window.confirm(
        'Solicitar exclusão da conta? Você receberá instruções por e-mail e haverá período de carência conforme a API.',
      )
    ) {
      return
    }
    setDeletionLoading(true)
    setDeletionMessage(null)
    setDeletionError(null)
    try {
      await requestAccountDeletion(api)
      setDeletionMessage(
        'Pedido registrado. Confirme pelo e-mail se a API enviar link (token). Conta permanece até conclusão do fluxo.',
      )
    } catch (err) {
      setDeletionError(err instanceof ApiError ? err.message : 'Não foi possível solicitar exclusão.')
    } finally {
      setDeletionLoading(false)
    }
  }

  function onLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto vstack gap-3" style={{ maxWidth: 560 }}>
      <div className="d-flex align-items-center gap-2">
        <Link to="/perfil" className="btn btn-sm btn-outline-secondary">
          ← Perfil
        </Link>
        <h1 className="h5 mb-0">Conta e segurança</h1>
      </div>

      {recovery ? (
        <div className="alert alert-warning small mb-0">
          Sua conta tem exclusão pendente. Use as opções abaixo ou faça login novamente após cancelar
          pelo fluxo de recuperação da API.
        </div>
      ) : null}

      <div className="card border-0 shadow-sm">
        <div className="card-body vstack gap-2">
          <p className="small text-muted mb-0">Sessão</p>
          <p className="mb-0">
            {user?.name} — {user?.email}
          </p>
          <button type="button" className="btn btn-outline-secondary btn-sm align-self-start" onClick={onLogout}>
            Sair
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body vstack gap-3">
          <h2 className="h6 mb-0">Alterar senha</h2>
          {pwMessage ? <div className="alert alert-success py-2 small mb-0">{pwMessage}</div> : null}
          {pwError ? <div className="alert alert-danger py-2 small mb-0">{pwError}</div> : null}
          <form onSubmit={(e) => void onChangePassword(e)} className="vstack gap-2">
            <input
              type="password"
              className="form-control form-control-sm"
              autoComplete="current-password"
              placeholder="Senha atual"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              className="form-control form-control-sm"
              autoComplete="new-password"
              minLength={6}
              placeholder="Nova senha"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button type="submit" className="btn btn-warning btn-sm align-self-start" disabled={pwLoading}>
              {pwLoading ? 'Salvando…' : 'Atualizar senha'}
            </button>
          </form>
        </div>
      </div>

      <div className="card border-0 shadow-sm border-danger">
        <div className="card-body vstack gap-2">
          <h2 className="h6 mb-0">Exclusão de conta</h2>
          <p className="small text-muted mb-0">
            Fluxo autenticado via API. Para solicitar por e-mail sem login, use a página institucional
            de exclusão na raiz do site.
          </p>
          {deletionMessage ? (
            <div className="alert alert-info py-2 small mb-0">{deletionMessage}</div>
          ) : null}
          {deletionError ? (
            <div className="alert alert-danger py-2 small mb-0">{deletionError}</div>
          ) : null}
          <button
            type="button"
            className="btn btn-outline-danger btn-sm align-self-start"
            disabled={deletionLoading}
            onClick={() => void onRequestDeletion()}
          >
            {deletionLoading ? 'Enviando…' : 'Solicitar exclusão'}
          </button>
        </div>
      </div>
    </div>
  )
}
