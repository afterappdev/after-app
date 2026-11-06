import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiClient, ApiError } from '../../api/client'
import { completeSocialRegistration, registerAccount } from '../../api/auth'
import { searchCities } from '../../api/locations'
import { IconEye, IconLock, IconMail, IconPerson, IconPin, IconStore } from '../../components/icons/AfterIcons'
import type { CityOption } from '../home/types'
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
  const [cityQuery, setCityQuery] = useState('')
  const [cityHits, setCityHits] = useState<CityOption[]>([])
  const [ageBand, setAgeBand] = useState<AgeBand | ''>('')
  const [documentType, setDocumentType] = useState<'CPF' | 'CNPJ'>('CPF')
  const [documentNumber, setDocumentNumber] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSocial = !!onboardingToken

  useEffect(() => {
    const q = cityQuery.trim()
    if (q.length < 2) {
      setCityHits([])
      return
    }
    const timer = window.setTimeout(() => {
      const api = new ApiClient()
      void searchCities(api, q)
        .then(setCityHits)
        .catch(() => setCityHits([]))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [cityQuery])

  function pickCity(option: CityOption) {
    setCity(option.name)
    setStateUf(option.uf)
    setCityQuery(option.uf ? `${option.name}, ${option.uf}` : option.name)
    setCityHits([])
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

  const docOk =
    role !== 'VENUE' ||
    (documentType === 'CPF' ? isValidCpf(digitsOnly(documentNumber)) : isValidCnpj(digitsOnly(documentNumber)))
  const ready =
    name.trim().length >= 2 &&
    city.trim().length > 0 &&
    stateUf.trim().length > 0 &&
    (isSocial || (email.trim().length > 0 && password.length >= 6 && password === confirmPassword)) &&
    (role !== 'USER' || !!ageBand) &&
    docOk

  return (
    <div className="after-auth-card after-auth-card--wide after-auth-card--register">
      <h1 className="after-auth-title after-register-title">Crie sua conta</h1>
      <p className="after-register-hint">
        <IconPerson size={14} /> Todos os campos são obrigatórios
      </p>
      {error ? <div className="alert alert-danger py-2 small mt-2 mb-0">{error}</div> : null}
      <form onSubmit={(e) => void onSubmit(e)} className="text-start after-register-form">
        <p className="after-register-label">Tipo de conta</p>
        <div className="d-flex gap-2 after-register-role-row">
          <button type="button" className={`after-choice ${role === 'USER' ? 'after-choice--on' : ''}`} onClick={() => setRole('USER')}>
            <IconPerson size={18} /> Usuário
          </button>
          <button type="button" className={`after-choice ${role === 'VENUE' ? 'after-choice--on' : ''}`} onClick={() => setRole('VENUE')}>
            <IconStore size={18} /> Local
          </button>
        </div>
        {role === 'USER' ? (
          <label className="after-field mb-2">
            <IconPerson size={18} />
            <select
              required
              className={ageBand ? undefined : 'after-field-hint'}
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value as AgeBand)}
            >
              <option value="">Selecione sua faixa etária</option>
              {AGE_BAND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <p className="after-register-label">Tipo de documento</p>
            <div className="d-flex gap-2 mb-2">
              <button type="button" className={`after-choice ${documentType === 'CPF' ? 'after-choice--on' : ''}`} onClick={() => setDocumentType('CPF')}>
                CPF
              </button>
              <button type="button" className={`after-choice ${documentType === 'CNPJ' ? 'after-choice--on' : ''}`} onClick={() => setDocumentType('CNPJ')}>
                CNPJ
              </button>
            </div>
            <label className="after-field mb-2">
              <IconPin />
              <input
                required
                inputMode="numeric"
                placeholder={documentType === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </label>
          </>
        )}
        {!isSocial ? (
          <label className="after-field mb-2">
            <IconMail />
            <input type="email" required autoComplete="email" placeholder="Digite seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        ) : (
          <p className="small text-muted">E-mail: {email || '—'}</p>
        )}
        <label className="after-field mb-2">
          <IconPerson />
          <input required minLength={2} placeholder="Nome ou nome do local" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="after-field mb-2">
          <IconPin />
          <input
            required
            placeholder="Digite sua cidade"
            value={cityQuery}
            onChange={(e) => {
              setCityQuery(e.target.value)
              setCity('')
              setStateUf('')
            }}
          />
        </label>
        {cityHits.length > 0 ? (
          <ul className="list-unstyled border rounded-3 bg-white mb-2 after-city-hits">
            {cityHits.map((hit) => (
              <li key={`${hit.name}-${hit.uf}`}>
                <button
                  type="button"
                  className="after-city-hit-btn"
                  onClick={() => pickCity(hit)}
                >
                  {hit.name}{hit.uf ? `, ${hit.uf}` : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="after-field mb-2">
          <IconLock />
          <input
            type={showPassword ? 'text' : 'password'}
            minLength={6}
            required={!isSocial}
            autoComplete="new-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Mostrar senha">
            <IconEye />
          </button>
        </label>
        {!isSocial ? (
          <label className="after-field mb-2">
            <IconLock />
            <input
              type={showConfirm ? 'text' : 'password'}
              minLength={6}
              required
              autoComplete="new-password"
              placeholder="Confirme sua senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShowConfirm((v) => !v)} aria-label="Mostrar confirmação">
              <IconEye />
            </button>
          </label>
        ) : null}
        <button type="submit" className="after-submit-muted" disabled={loading || !ready}>
          {loading ? 'Criando…' : 'Criar Conta'}
        </button>
      </form>
      <p className="mt-2 mb-0 text-center after-auth-signup-muted">
        Já tem conta? <Link className="after-link-orange" to="/login">Entrar</Link>
      </p>
    </div>
  )
}
