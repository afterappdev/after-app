import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  cancelAccountDeletion,
  changeUserPassword,
  fetchDeletionStatus,
  requestAccountDeletion,
  type DeletionStatusView,
} from '../../api/users'
import { useAuth } from '../../auth/AuthContext'
import { AfterPageHeader } from '../../components/layout/AfterPageHeader'
import { readStoredRecoveryToken } from '../../auth/recoverySession'

function formatRemainingSeconds(seconds: number): string {
  if (seconds <= 0) return 'em breve'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days} dia(s) e ${hours} h`
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours} h e ${mins} min`
}

export function AccountSettingsPage() {
  const { api, logout, user, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const recoveryFromNav = (location.state as { recovery?: boolean } | null)?.recovery
  const recoveryToken = readStoredRecoveryToken()
  const inRecovery = Boolean(recoveryToken || recoveryFromNav)

  const [deletionStatus, setDeletionStatus] = useState<DeletionStatusView | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  const [deletionLoading, setDeletionLoading] = useState(false)
  const [deletionMessage, setDeletionMessage] = useState<string | null>(null)
  const [deletionError, setDeletionError] = useState<string | null>(null)

  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    if (!recoveryToken) return
    let cancelled = false
    void (async () => {
      try {
        const status = await fetchDeletionStatus(recoveryToken)
        if (!cancelled) setDeletionStatus(status)
      } catch (err) {
        if (!cancelled) {
          setStatusError(
            err instanceof ApiError ? err.message : 'Não foi possível carregar status da exclusão.',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recoveryToken])

  async function onChangePassword(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setPwError('Alteração de senha exige sessão normal. Saia e entre novamente após recuperar a conta.')
      return
    }
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
    if (!token) {
      setDeletionError('Solicitar exclusão exige sessão normal, não modo recuperação.')
      return
    }
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

  async function onCancelDeletion() {
    if (!recoveryToken) return
    if (!window.confirm('Cancelar a exclusão pendente e recuperar a conta?')) return
    setCancelLoading(true)
    setCancelMessage(null)
    setCancelError(null)
    try {
      await cancelAccountDeletion(recoveryToken)
      setCancelMessage('Conta recuperada. Entre novamente com e-mail, Google ou Apple.')
      logout()
      navigate('/login', { replace: true, state: { recoveryDone: true } })
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Não foi possível cancelar a exclusão.')
    } finally {
      setCancelLoading(false)
    }
  }

  function onLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="after-canvas vstack gap-3">
      <AfterPageHeader title="Conta e segurança" backTo="/perfil" backLabel="← Perfil" />

      {inRecovery ? (
        <div className="card border-0 shadow-sm border-warning">
          <div className="card-body vstack gap-2">
            <h2 className="h6 mb-0">Recuperação de conta</h2>
            <p className="small text-muted mb-0">
              Exclusão pendente. Cancele abaixo ou saia; a sessão normal volta após novo login.
            </p>
            {statusError ? (
              <div className="alert alert-danger py-2 small mb-0">{statusError}</div>
            ) : null}
            {deletionStatus ? (
              <p className="small mb-0">
                Exclusão definitiva em aproximadamente{' '}
                <strong>{formatRemainingSeconds(deletionStatus.remainingSeconds)}</strong>.
              </p>
            ) : null}
            {cancelMessage ? (
              <div className="alert alert-success py-2 small mb-0">{cancelMessage}</div>
            ) : null}
            {cancelError ? (
              <div className="alert alert-danger py-2 small mb-0">{cancelError}</div>
            ) : null}
            <button
              type="button"
              className="btn btn-warning btn-sm align-self-start"
              disabled={cancelLoading || !recoveryToken}
              onClick={() => void onCancelDeletion()}
            >
              {cancelLoading ? 'Cancelando…' : 'Cancelar exclusão e recuperar conta'}
            </button>
          </div>
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
          {inRecovery && !token ? (
            <p className="small text-muted mb-0">Indisponível no modo recuperação.</p>
          ) : null}
          {pwMessage ? <div className="alert alert-success py-2 small mb-0">{pwMessage}</div> : null}
          {pwError ? <div className="alert alert-danger py-2 small mb-0">{pwError}</div> : null}
          <form onSubmit={(e) => void onChangePassword(e)} className="vstack gap-2">
            <input
              type="password"
              className="form-control form-control-sm"
              autoComplete="current-password"
              placeholder="Senha atual"
              required={Boolean(token)}
              disabled={!token}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              className="form-control form-control-sm"
              autoComplete="new-password"
              minLength={6}
              placeholder="Nova senha"
              required={Boolean(token)}
              disabled={!token}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-warning btn-sm align-self-start"
              disabled={pwLoading || !token}
            >
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
            disabled={deletionLoading || !token || inRecovery}
            onClick={() => void onRequestDeletion()}
          >
            {deletionLoading ? 'Enviando…' : 'Solicitar exclusão'}
          </button>
        </div>
      </div>
    </div>
  )
}
