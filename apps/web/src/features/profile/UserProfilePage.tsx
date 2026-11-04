import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { fetchCitiesByState, fetchStates, type CityInState, type StateOption } from '../../api/locations'
import {
  fetchPromoPreferences,
  setPromoPreferencesEnabled,
} from '../../api/promoNotifications'
import { fetchUserMe, updateUserMe } from '../../api/users'
import { uploadFile } from '../../api/uploads'
import { useAuth } from '../../auth/AuthContext'
import {
  AGE_BAND_OPTIONS,
  AGE_BAND_REQUIRED_MESSAGE,
  type AgeBand,
} from '../../constants/ageBands'
import { resolveMediaUrl } from '../../utils/mediaUrl'

export function UserProfilePage() {
  const { api, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [stateUf, setStateUf] = useState('')
  const [city, setCity] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [ageBand, setAgeBand] = useState<AgeBand | ''>('')
  const [states, setStates] = useState<StateOption[]>([])
  const [cities, setCities] = useState<CityInState[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [promoEnabled, setPromoEnabled] = useState<boolean | null>(null)
  const [promoBusy, setPromoBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [me, stateRows, promo] = await Promise.all([
        fetchUserMe(api),
        fetchStates(api),
        fetchPromoPreferences(api).catch(() => null),
      ])
      setName(me.name)
      setStateUf(me.state)
      setCity(me.city)
      setAvatarUrl(me.avatarUrl ?? null)
      setAgeBand((me.ageBand as AgeBand | null) ?? '')
      setStates(stateRows)
      if (promo) setPromoEnabled(promo.enabled)
      if (me.state) {
        setCitiesLoading(true)
        try {
          setCities(await fetchCitiesByState(api, me.state))
        } finally {
          setCitiesLoading(false)
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o perfil.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function onStateChange(uf: string) {
    setStateUf(uf)
    setCity('')
    setCities([])
    if (!uf) return
    setCitiesLoading(true)
    try {
      setCities(await fetchCitiesByState(api, uf))
    } catch {
      setCities([])
    } finally {
      setCitiesLoading(false)
    }
  }

  async function onPickAvatar(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadFile(api, file)
      setAvatarUrl(uploaded.url || null)
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Falha no upload.')
    } finally {
      setUploading(false)
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (name.trim().length < 2) {
      setToast('Preencha o nome.')
      return
    }
    if (!stateUf || !city) {
      setToast('Selecione estado e cidade.')
      return
    }
    if (!ageBand) {
      setToast(AGE_BAND_REQUIRED_MESSAGE)
      return
    }
    setSaving(true)
    try {
      await updateUserMe(api, {
        name: name.trim(),
        state: stateUf,
        city,
        avatarUrl,
        ageBand,
      })
      await refreshUser()
      setToast('Perfil salvo.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function onTogglePromo(enabled: boolean) {
    setPromoBusy(true)
    try {
      const next = await setPromoPreferencesEnabled(api, enabled)
      setPromoEnabled(next.enabled)
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível atualizar avisos.')
    } finally {
      setPromoBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-warning" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning">
        {error}
        <button type="button" className="btn btn-sm btn-outline-dark ms-2" onClick={() => void load()}>
          Tentar novamente
        </button>
      </div>
    )
  }

  const avatarSrc = resolveMediaUrl(avatarUrl)

  return (
    <div className="mx-auto vstack gap-4" style={{ maxWidth: 520 }}>
      {toast ? (
        <div className="alert alert-info alert-dismissible fade show">
          {toast}
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      ) : null}

      <div>
        <h1 className="h4 after-brand-text mb-1">Meu perfil</h1>
        <p className="text-muted small mb-0">Dados da sua conta After.</p>
      </div>

      <form className="card border-0 shadow-sm" onSubmit={onSave}>
        <div className="card-body vstack gap-3">
          <div className="text-center">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="rounded-circle object-fit-cover" width={96} height={96} />
            ) : (
              <div className="rounded-circle bg-light mx-auto d-flex align-items-center justify-content-center" style={{ width: 96, height: 96 }}>
                <span className="text-muted">Foto</span>
              </div>
            )}
            <div className="mt-2 d-flex flex-wrap justify-content-center gap-2">
              <label className="btn btn-sm btn-outline-primary mb-0">
                {uploading ? 'Enviando…' : 'Alterar foto'}
                <input
                  type="file"
                  accept="image/*"
                  className="d-none"
                  disabled={uploading}
                  onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
                />
              </label>
              {avatarUrl ? (
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setAvatarUrl(null)}>
                  Remover
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="profile-name">
              Nome
            </label>
            <input
              id="profile-name"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-state">
                Estado
              </label>
              <select
                id="profile-state"
                className="form-select"
                value={stateUf}
                onChange={(e) => void onStateChange(e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {states.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-city">
                Cidade
              </label>
              <select
                id="profile-city"
                className="form-select"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                disabled={!stateUf || citiesLoading}
              >
                <option value="">{citiesLoading ? 'Carregando…' : 'Selecione'}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="profile-age">
              Faixa etária
            </label>
            <select
              id="profile-age"
              className="form-select"
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value as AgeBand)}
              required
            >
              <option value="">Selecione</option>
              {AGE_BAND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      <section>
        <p className="text-muted small fw-bold mb-2">AVISOS</p>
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="promo-alerts"
                checked={promoEnabled ?? false}
                disabled={promoEnabled === null || promoBusy}
                onChange={(e) => void onTogglePromo(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="promo-alerts">
                <span className="fw-semibold d-block">Receber promoções e eventos da minha cidade</span>
                <span className="small text-muted">
                  Avisos quando estabelecimentos da sua cidade publicarem promoções ou eventos para hoje.
                </span>
              </label>
            </div>
            {promoEnabled === null ? (
              <p className="small text-muted mb-0 mt-2">Preferências indisponíveis no momento.</p>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="vstack gap-2">
        <Link to="/perfil/favoritos" className="btn btn-outline-secondary text-start">
          Favoritos
        </Link>
        <Link to="/perfil/notificacoes" className="btn btn-outline-secondary text-start">
          Notificações
        </Link>
        <Link to="/perfil/bloqueados" className="btn btn-outline-secondary text-start">
          Bloqueados
        </Link>
      </nav>
    </div>
  )
}
