import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { completeSocialRegistration, registerAccount } from '../../api/auth'
import { fetchCitiesByState, fetchStates, type CityInState, type StateOption } from '../../api/locations'
import { useAuth } from '../../auth/AuthContext'
import { AGE_BAND_OPTIONS, type AgeBand } from '../../constants/ageBands'
import { digitsOnly, isValidCnpj, isValidCpf } from '../../utils/brDocument'
import { oauthOnboardingFromLocation } from '../../utils/oauthCallback'
import {
  clearPendingSocialOnboarding,
  readPendingSocialOnboarding,
} from '../../utils/socialOnboardingStorage'

type Role = 'USER' | 'VENUE'

export function RegisterPage() {
  const { loginWithAccessToken, user, bootstrapping } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const onboardingToken = useMemo(() => {
    return (
      oauthOnboardingFromLocation(searchParams) ??
      readPendingSocialOnboarding()?.onboardingToken ??
      null
    )
  }, [searchParams])

  const socialPrefill = readPendingSocialOnboarding()

  const [role, setRole] = useState<Role>('USER')
  const [name, setName] = useState(socialPrefill?.name ?? '')
  const [email, setEmail] = useState(socialPrefill?.email ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [stateUf, setStateUf] = useState('')
  const [city, setCity] = useState('')
  const [ageBand, setAgeBand] = useState<AgeBand | ''>('')
  const [documentType, setDocumentType] = useState<'CPF' | 'CNPJ'>('CPF')
  const [documentNumber, setDocumentNumber] = useState('')
  const [states, setStates] = useState<StateOption[]>([])
  const [cities, setCities] = useState<CityInState[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSocial = !!onboardingToken

  const loadStates = useCallback(async () => {
    const api = new ApiClient()
    setStates(await fetchStates(api))
  }, [])

  useEffect(() => {
    void loadStates()
  }, [loadStates])

  async function onStateChange(uf: string) {
    setStateUf(uf)
    setCity('')
    setCities([])
    if (!uf) return
    const api = new ApiClient()
    setCities(await fetchCitiesByState(api, uf))
  }

  if (!bootstrapping && user && !isSocial) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!isSocial && password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    if (role === 'USER' && !ageBand) {
      setError('Selecione a faixa etária.')
      return
    }
    if (role === 'VENUE') {
      const digits = digitsOnly(documentNumber)
      if (documentType === 'CPF' && !isValidCpf(digits)) {
        setError('CPF inválido.')
        return
      }
      if (documentType === 'CNPJ' && !isValidCnpj(digits)) {
        setError('CNPJ inválido.')
        return
      }
    }

    setLoading(true)
    const api = new ApiClient()
    try {
      if (isSocial && onboardingToken) {
        const result = await completeSocialRegistration(api, {
          onboardingToken,
          accountType: role === 'VENUE' ? 'venue' : 'user',
          name,
          state: stateUf,
          city,
          password: password || undefined,
          ageBand: role === 'USER' ? ageBand || undefined : undefined,
          documentType: role === 'VENUE' ? documentType : undefined,
          documentNumber: role === 'VENUE' ? digitsOnly(documentNumber) : undefined,
        })
        clearPendingSocialOnboarding()
        await loginWithAccessToken(result.accessToken)
      } else {
        const result = await registerAccount(api, {
          name,
          email,
          password,
          state: stateUf,
          city,
          role,
          ageBand: role === 'USER' ? ageBand || undefined : undefined,
          documentType: role === 'VENUE' ? documentType : undefined,
          documentNumber: role === 'VENUE' ? digitsOnly(documentNumber) : undefined,
        })
        clearPendingSocialOnboarding()
        await loginWithAccessToken(result.accessToken)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-8 col-xl-7">
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h1 className="h4 after-brand-text mb-1">
              {isSocial ? 'Completar cadastro' : 'Criar conta'}
            </h1>
            <p className="text-muted small mb-3">
              {isSocial
                ? 'Finalize seu perfil After Web. Canal after_web informado à API.'
                : 'Usuário ou estabelecimento (VENUE).'}
            </p>
            {error ? <div className="alert alert-danger py-2 small">{error}</div> : null}
            <form onSubmit={(e) => void onSubmit(e)} className="vstack gap-3">
              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  className={`btn ${role === 'USER' ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => setRole('USER')}
                >
                  Usuário
                </button>
                <button
                  type="button"
                  className={`btn ${role === 'VENUE' ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => setRole('VENUE')}
                >
                  Estabelecimento
                </button>
              </div>

              {!isSocial ? (
                <input
                  type="email"
                  className="form-control"
                  required
                  autoComplete="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              ) : (
                <p className="small text-muted mb-0">E-mail: {email || '—'}</p>
              )}

              <input
                className="form-control"
                required
                minLength={2}
                placeholder="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="row g-2">
                <div className="col-md-4">
                  <select
                    className="form-select"
                    required
                    value={stateUf}
                    onChange={(e) => void onStateChange(e.target.value)}
                  >
                    <option value="">UF</option>
                    {states.map((s) => (
                      <option key={s.uf} value={s.uf}>
                        {s.uf}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-8">
                  <select
                    className="form-select"
                    required
                    value={city}
                    disabled={!stateUf}
                    onChange={(e) => setCity(e.target.value)}
                  >
                    <option value="">Cidade</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {role === 'USER' ? (
                <select
                  className="form-select"
                  required
                  value={ageBand}
                  onChange={(e) => setAgeBand(e.target.value as AgeBand)}
                >
                  <option value="">Faixa etária</option>
                  {AGE_BAND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn ${documentType === 'CPF' ? 'btn-warning' : 'btn-outline-secondary'}`}
                      onClick={() => setDocumentType('CPF')}
                    >
                      CPF
                    </button>
                    <button
                      type="button"
                      className={`btn ${documentType === 'CNPJ' ? 'btn-warning' : 'btn-outline-secondary'}`}
                      onClick={() => setDocumentType('CNPJ')}
                    >
                      CNPJ
                    </button>
                  </div>
                  <input
                    className="form-control"
                    required
                    placeholder={documentType === 'CNPJ' ? 'CNPJ' : 'CPF'}
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                  />
                </>
              )}

              <input
                type="password"
                className="form-control"
                minLength={6}
                required={!isSocial}
                autoComplete="new-password"
                placeholder={isSocial ? 'Senha (opcional)' : 'Senha'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {!isSocial ? (
                <input
                  type="password"
                  className="form-control"
                  minLength={6}
                  required
                  autoComplete="new-password"
                  placeholder="Confirmar senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              ) : null}

              <button type="submit" className="btn btn-warning w-100" disabled={loading}>
                {loading ? 'Criando…' : 'Criar conta'}
              </button>
            </form>
            <p className="small text-muted mt-3 mb-0">
              Já tem conta? <Link to="/login">Entrar</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
