import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  cancelBanner,
  createBanner,
  fetchBannerHistory,
  fetchBannerPricing,
} from '../../api/banners'
import { fetchCreditWallet, redeemCreditCoupon } from '../../api/credits'
import { uploadFile } from '../../api/uploads'
import { AsyncPanel } from '../../components/common/AsyncPanel'
import { PromoMonthCalendar, startOfDay } from '../../components/credits/PromoMonthCalendar'
import { useAuth } from '../../auth/AuthContext'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { newPublicationIdempotencyKey } from '../../utils/publicationIdempotency'
import {
  allowedVipPushTimingsForDate,
  labelVipPushTiming,
  type VipPushTimingChoice,
} from '../../utils/vipPushTiming'
import type { BannerHistoryItem } from './types'

type BillingPlan = 'common' | 'vip'

function formatDayKeyBr(dayKey: string): string {
  const [y, m, d] = dayKey.split('-')
  if (!y || !m || !d) return dayKey
  return `${d}/${m}/${y}`
}

function historyDatesLabel(item: BannerHistoryItem): string {
  const rows = item.schedules ?? []
  const labels = rows
    .map((s) => s.displayDate?.slice(0, 10))
    .filter((v): v is string => !!v)
    .sort()
    .map(formatDayKeyBr)
  return labels.length ? labels.join(', ') : 'Sem datas'
}

export function CreditsBannersPage() {
  const { api } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [vipBalance, setVipBalance] = useState(0)
  const [creditPerDay, setCreditPerDay] = useState(1)
  const [vipCreditPerDay, setVipCreditPerDay] = useState(1)
  const [history, setHistory] = useState<BannerHistoryItem[]>([])

  const [billingPlan, setBillingPlan] = useState<BillingPlan>('common')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()))
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set())
  const [vipPushTimingByDate, setVipPushTimingByDate] = useState<
    Record<string, VipPushTimingChoice>
  >({})

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const publishIdempotencyKeyRef = useRef<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [couponCode, setCouponCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const syncVipPushTiming = useCallback(
    (dates: Set<string>, plan: BillingPlan, now = new Date()) => {
      if (plan !== 'vip') {
        setVipPushTimingByDate({})
        return
      }
      setVipPushTimingByDate((prev) => {
        const next: Record<string, VipPushTimingChoice> = {}
        for (const label of dates) {
          const options = allowedVipPushTimingsForDate(label, now)
          if (options.length === 0) continue
          const current = prev[label]
          next[label] = current && options.includes(current) ? current : options[0]
        }
        return next
      })
    },
    [],
  )

  const vipPushSelectionReady = useCallback(
    (dates: Set<string>, timings: Record<string, VipPushTimingChoice>, now = new Date()) => {
      if (dates.size === 0) return false
      for (const label of dates) {
        const timing = timings[label]
        const options = allowedVipPushTimingsForDate(label, now)
        if (!timing || !options.includes(timing)) return false
      }
      return true
    },
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [wallet, pricing, bannerHistory] = await Promise.all([
        fetchCreditWallet(api),
        fetchBannerPricing(api).catch(() => ({
          creditPerDisplayDay: 1,
          vipCreditPerDisplayDay: 1,
          commonCreditsPerVipDay: 0,
        })),
        fetchBannerHistory(api),
      ])
      setBalance(wallet.balance)
      setVipBalance(wallet.vipBalance)
      setCreditPerDay(
        pricing.creditPerDisplayDay > 0 ? pricing.creditPerDisplayDay : 1,
      )
      setVipCreditPerDay(
        pricing.vipCreditPerDisplayDay > 0 ? pricing.vipCreditPerDisplayDay : 1,
      )
      setHistory(bannerHistory)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar créditos.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (billingPlan !== 'vip') return
    const id = window.setInterval(() => {
      syncVipPushTiming(selectedDates, billingPlan)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [billingPlan, selectedDates, syncVipPushTiming])

  const isVip = billingPlan === 'vip'
  const dayCount = selectedDates.size
  const costPerDay = isVip ? vipCreditPerDay : creditPerDay
  const publishCost = dayCount * costPerDay
  const available = isVip ? vipBalance : balance

  const sortedSelected = useMemo(
    () => [...selectedDates].sort(),
    [selectedDates],
  )

  function showToast(message: string) {
    setToast(message)
  }

  function toggleDay(dayKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dayKey)) next.delete(dayKey)
      else next.add(dayKey)
      syncVipPushTiming(next, billingPlan)
      return next
    })
  }

  function onBillingPlanChange(plan: BillingPlan) {
    setBillingPlan(plan)
    syncVipPushTiming(selectedDates, plan)
  }

  async function onPickImage(file: File | null) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 10MB.')
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadFile(api, file)
      setImageUrl(uploaded.url || null)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Falha no upload.')
    } finally {
      setUploading(false)
    }
  }

  function fillFromHistory(item: BannerHistoryItem) {
    setImageUrl(item.imageUrl ?? null)
    setTitle((item.title ?? '').trim())
    setDescription((item.description ?? '').trim())
    setSelectedDates(new Set())
    syncVipPushTiming(new Set(), billingPlan)
    showToast('Revise os dados e escolha as novas datas.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function publishBanner() {
    if (publishing) return
    if (!imageUrl) {
      showToast('Selecione uma imagem da publicação.')
      return
    }
    const titleTrim = title.trim()
    const descriptionTrim = description.trim()
    if (!titleTrim) {
      showToast('Informe o título da promoção.')
      return
    }
    if (!descriptionTrim) {
      showToast('Informe uma breve descrição.')
      return
    }
    if (selectedDates.size === 0) {
      showToast('Selecione ao menos uma data.')
      return
    }
    if (isVip) {
      syncVipPushTiming(selectedDates, billingPlan)
      if (!vipPushSelectionReady(selectedDates, vipPushTimingByDate)) {
        showToast(
          'Escolha um horário de aviso push VIP para cada data. Se um horário expirou, selecione outra opção.',
        )
        return
      }
    }
    if (available < publishCost) {
      showToast(
        isVip
          ? `Saldo VIP insuficiente. É preciso ${publishCost} crédito(s) VIP.`
          : `Saldo comum insuficiente. É preciso ${publishCost} crédito(s).`,
      )
      return
    }

    const vipSummary = isVip
      ? sortedSelected
          .map((d) => `${formatDayKeyBr(d)}: ${labelVipPushTiming(vipPushTimingByDate[d]!)}`)
          .join('\n')
      : ''
    const confirmText = isVip
      ? `Publicar ${publishCost} crédito(s) VIP?\n\n${vipSummary}`
      : `Publicar por ${publishCost} crédito(s) comum?`
    if (!window.confirm(confirmText)) return

    const idempotencyKey =
      publishIdempotencyKeyRef.current ?? (publishIdempotencyKeyRef.current = newPublicationIdempotencyKey())
    setPublishing(true)
    try {
      const dates = sortedSelected
      if (isVip) {
        await createBanner(
          api,
          {
            imageUrl,
            title: titleTrim,
            description: descriptionTrim,
            vipDates: dates,
            vipPublications: dates.map((date) => ({
              date,
              pushTiming: vipPushTimingByDate[date]!,
            })),
          },
          idempotencyKey,
        )
      } else {
        await createBanner(
          api,
          {
            imageUrl,
            title: titleTrim,
            description: descriptionTrim,
            dates,
          },
          idempotencyKey,
        )
      }
      publishIdempotencyKeyRef.current = null
      setImageUrl(null)
      setTitle('')
      setDescription('')
      setSelectedDates(new Set())
      setBillingPlan('common')
      setVipPushTimingByDate({})
      showToast(isVip ? 'Publicação VIP agendada na HOME.' : 'Publicação agendada na HOME.')
      await load()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível publicar.')
    } finally {
      setPublishing(false)
    }
  }

  async function cancelPublication(id: string) {
    if (cancellingId || !id) return
    if (!window.confirm('Excluir esta promoção? Os créditos já consumidos não são devolvidos.')) {
      return
    }
    setCancellingId(id)
    try {
      await cancelBanner(api, id)
      showToast('Promoção cancelada.')
      await load()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível cancelar.')
    } finally {
      setCancellingId(null)
    }
  }

  async function onRedeemCoupon(event: FormEvent) {
    event.preventDefault()
    const code = couponCode.trim()
    if (!code || redeeming) return
    setRedeeming(true)
    try {
      const result = await redeemCreditCoupon(api, code)
      setBalance(result.balance)
      setVipBalance(result.vipBalance)
      setCouponCode('')
      showToast(`Cupom aplicado: +${result.creditAmount} crédito(s).`)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Cupom inválido.')
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="mx-auto vstack gap-3" style={{ maxWidth: 720 }}>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <Link to="/estabelecimento" className="btn btn-sm btn-outline-secondary mb-2">
            ← Painel
          </Link>
          <h1 className="h4 after-brand-text mb-0">Créditos e publicações</h1>
        </div>
        <Link to="/estabelecimento/creditos/comprar" className="btn btn-warning">
          Comprar créditos
        </Link>
      </div>

      {toast ? (
        <div className="alert alert-info alert-dismissible fade show mb-0">
          {toast}
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      ) : null}

      <AsyncPanel loading={loading} error={error} onRetry={() => void load()}>
        <div className="row g-2 mb-3">
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body">
                <p className="small text-muted mb-1">Créditos comuns</p>
                <p className="fs-3 fw-bold mb-0">{balance}</p>
                <p className="small text-muted mb-0">
                  {creditPerDay} créd./dia na publicação comum
                </p>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100 border-warning">
              <div className="card-body">
                <p className="small text-muted mb-1">Créditos VIP</p>
                <p className="fs-3 fw-bold mb-0">{vipBalance}</p>
                <p className="small text-muted mb-0">
                  {vipCreditPerDay} créd. VIP/dia + push
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <h2 className="h6">Cupom de créditos (Web)</h2>
            <form className="row g-2 align-items-end" onSubmit={(e) => void onRedeemCoupon(e)}>
              <div className="col-sm-8">
                <label className="form-label small" htmlFor="coupon-code">
                  Código
                </label>
                <input
                  id="coupon-code"
                  className="form-control"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  autoComplete="off"
                  disabled={redeeming}
                />
              </div>
              <div className="col-sm-4">
                <button type="submit" className="btn btn-outline-dark w-100" disabled={redeeming}>
                  {redeeming ? 'Aplicando…' : 'Resgatar'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <h2 className="h5">Nova publicação</h2>
        <p className="text-muted small">
          Envie a imagem e escolha as datas. O débito usa o saldo retornado pela API após a
          publicação.
        </p>

        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body vstack gap-3">
            <div>
              <p className="fw-semibold small mb-2">1. Imagem</p>
              <input
                ref={fileInputRef}
                type="file"
                className="d-none"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="btn btn-outline-secondary w-100 p-0 overflow-hidden"
                style={{ minHeight: 168 }}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <span className="py-5 d-block">Enviando…</span>
                ) : imageUrl ? (
                  <img
                    src={resolveMediaUrl(imageUrl)}
                    alt="Prévia"
                    className="w-100 object-fit-cover"
                    style={{ maxHeight: 220 }}
                  />
                ) : (
                  <span className="py-5 d-block text-muted small">
                    Toque para selecionar • PNG/JPG • máx. 10MB
                  </span>
                )}
              </button>
            </div>

            <div>
              <p className="fw-semibold small mb-2">2. Texto</p>
              <input
                className="form-control mb-2"
                placeholder="Título da promoção"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <textarea
                className="form-control"
                rows={3}
                placeholder="Breve descrição"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            <div>
              <p className="fw-semibold small mb-2">3. Plano</p>
              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  className={`btn ${billingPlan === 'common' ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => onBillingPlanChange('common')}
                >
                  Comum
                </button>
                <button
                  type="button"
                  className={`btn ${billingPlan === 'vip' ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => onBillingPlanChange('vip')}
                >
                  VIP
                </button>
              </div>
            </div>

            <div>
              <p className="fw-semibold small mb-2">4. Datas</p>
              <PromoMonthCalendar
                month={calendarMonth}
                selected={selectedDates}
                onToggle={toggleDay}
                onPrevMonth={() =>
                  setCalendarMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                  )
                }
                onNextMonth={() =>
                  setCalendarMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                  )
                }
              />
              {sortedSelected.length > 0 ? (
                <p className="small mt-2 mb-0">
                  Selecionadas: {sortedSelected.map(formatDayKeyBr).join(', ')}
                </p>
              ) : null}
            </div>

            {isVip && sortedSelected.length > 0 ? (
              <div>
                <p className="fw-semibold small mb-2">5. Horário push VIP</p>
                <div className="vstack gap-2">
                  {sortedSelected.map((dateLabel) => {
                    const options = allowedVipPushTimingsForDate(dateLabel)
                    const value = vipPushTimingByDate[dateLabel] ?? options[0]
                    return (
                      <div
                        key={dateLabel}
                        className="d-flex flex-wrap align-items-center gap-2 border rounded p-2"
                      >
                        <span className="small fw-semibold">{formatDayKeyBr(dateLabel)}</span>
                        <select
                          className="form-select form-select-sm"
                          style={{ maxWidth: 260 }}
                          value={value ?? ''}
                          disabled={options.length === 0}
                          onChange={(e) =>
                            setVipPushTimingByDate((prev) => ({
                              ...prev,
                              [dateLabel]: e.target.value as VipPushTimingChoice,
                            }))
                          }
                        >
                          {options.map((opt) => (
                            <option key={opt} value={opt}>
                              {labelVipPushTiming(opt)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <p className="small mb-0">
                Custo estimado: <strong>{publishCost}</strong> crédito(s){' '}
                {isVip ? 'VIP' : 'comum'} ({dayCount} dia(s) × {costPerDay})
              </p>
              <button
                type="button"
                className="btn btn-warning"
                disabled={publishing || uploading}
                onClick={() => void publishBanner()}
              >
                {publishing ? 'Publicando…' : 'Publicar na HOME'}
              </button>
            </div>
          </div>
        </div>

        <h2 className="h6">Histórico de publicações</h2>
        {history.length === 0 ? (
          <p className="text-muted small">Nenhuma publicação ainda.</p>
        ) : (
          <ul className="list-group list-group-flush mb-4">
            {history.map((item) => {
              const cancelled = (item.status ?? '').toUpperCase() === 'CANCELLED'
              const preview = resolveMediaUrl(item.imageUrl)
              return (
                <li key={item.id} className="list-group-item px-0">
                  <div className="d-flex gap-2 align-items-start">
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        width={56}
                        height={56}
                        className="rounded object-fit-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="bg-light rounded flex-shrink-0"
                        style={{ width: 56, height: 56 }}
                      />
                    )}
                    <div className="flex-grow-1 min-w-0">
                      <p className="mb-0 fw-semibold text-truncate">
                        {(item.title ?? '').trim() || historyDatesLabel(item)}
                      </p>
                      <p className="small text-muted mb-0 text-truncate">
                        {historyDatesLabel(item)}
                        {item.creditsCost != null ? ` • ${item.creditsCost} créd.` : ''}
                      </p>
                      {cancelled ? (
                        <span className="badge text-bg-danger mt-1">Cancelada</span>
                      ) : null}
                    </div>
                    <div className="dropdown">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary dropdown-toggle"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        disabled={cancellingId === item.id}
                      >
                        {cancellingId === item.id ? '…' : 'Ações'}
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li>
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => fillFromHistory(item)}
                          >
                            Publicar novamente
                          </button>
                        </li>
                        {!cancelled ? (
                          <li>
                            <button
                              type="button"
                              className="dropdown-item text-danger"
                              onClick={() => void cancelPublication(item.id)}
                            >
                              Excluir promoção
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </AsyncPanel>
    </div>
  )
}
