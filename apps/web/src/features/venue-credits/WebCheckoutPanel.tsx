import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import {
  createPixCreditCharge,
  fetchCardCheckoutConfig,
  fetchCreditPurchaseById,
  payCardCreditPurchase,
} from '../../api/credits'
import { FiscalInvoiceSection } from '../../components/checkout/FiscalInvoiceSection'
import { MercadoPagoCardBrick } from '../../components/checkout/MercadoPagoCardBrick'
import type { CardBrickSubmitPayload } from '../../components/checkout/mercadoPagoSdk'
import { useAuth } from '../../auth/AuthContext'
import {
  applyCardPayResult,
  applyCardPollStatus,
  beginCardSubmit,
  CARD_DUPLICATE_SUBMIT_MESSAGE,
  CARD_POLL_TIMEOUT_MESSAGE,
  cardAttemptAllowsMethodSwitch,
  createCardIdempotencyKey,
  type CardAttempt,
} from '../../utils/cardCheckout'
import { friendlyCardConfigError, friendlyPixError } from '../../utils/checkoutErrors'
import {
  clearCheckoutSession,
  readCheckoutSession,
  saveCheckoutSession,
} from '../../utils/checkoutSession'
import {
  createFiscalFormState,
  fiscalPayloadFromForm,
  rememberVenueFiscalDocument,
  validateFiscalForm,
  type FiscalFormState,
} from '../../utils/fiscalPurchase'
import { createPurchasePoller } from '../../utils/purchasePoll'
import { isTerminalPurchaseStatus, purchaseStatusLabel } from '../../utils/purchaseLabels'
import { qrImageSrc } from '../../utils/pixCharge'
import { isVipCreditPackage, vipWebCheckoutPack } from '../../utils/vipCatalog'
import { fetchVenueFiscalDocument } from '../../api/venueOwner'
import type { CreditPackage, PixChargeResult } from './types'

type PayMethod = 'pix' | 'card'

type Props = {
  pack: CreditPackage
  payerEmail?: string | null
  onPaid: () => void
  onBack: () => void
}

function formatMoney(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function WebCheckoutPanel(props: Props) {
  const { api, user } = useAuth()
  const [pack, setPack] = useState(props.pack)
  const [method, setMethod] = useState<PayMethod>('pix')
  const [fiscal, setFiscal] = useState<FiscalFormState>(() =>
    createFiscalFormState(props.payerEmail),
  )
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [pixCharge, setPixCharge] = useState<PixChargeResult | null>(null)
  const [pixCreating, setPixCreating] = useState(false)

  const [cardAttempt, setCardAttempt] = useState<CardAttempt>(() => ({
    idempotencyKey: createCardIdempotencyKey(),
    phase: 'ready',
  }))
  const submitLockRef = useRef(false)

  const poller = useMemo(
    () =>
      createPurchasePoller({
        fetchStatus: async (purchaseId) => {
          const row = await fetchCreditPurchaseById(api, purchaseId)
          return row.status
        },
      }),
    [api],
  )

  const vipBlocked = isVipCreditPackage(pack) && vipWebCheckoutPack(pack) == null
  const price = pack.priceBrl ?? 0
  const canSwitchMethod = cardAttemptAllowsMethodSwitch(cardAttempt) && !pixCharge

  useEffect(() => {
    setPack(props.pack)
  }, [props.pack])

  useEffect(() => {
    const venueId = user?.venueId
    if (!venueId) return
    void (async () => {
      try {
        const doc = await fetchVenueFiscalDocument(api, venueId)
        setFiscal((prev) =>
          rememberVenueFiscalDocument(prev, {
            documentType: doc.documentType,
            documentDigits: doc.documentDigits,
            legalName: user?.name,
          }),
        )
      } catch {
        /* optional prefill */
      }
    })()
  }, [api, user?.venueId, user?.name])

  useEffect(() => {
    const session = readCheckoutSession()
    if (!session || session.packageKey !== props.pack.key) return
    void (async () => {
      try {
        const row = await fetchCreditPurchaseById(api, session.purchaseId)
        if (row.status.toUpperCase() === 'PAID') {
          clearCheckoutSession()
          setMessage('Pagamento confirmado pelo servidor.')
          props.onPaid()
          return
        }
        if (isTerminalPurchaseStatus(row.status)) {
          clearCheckoutSession()
          setError(`Compra ${purchaseStatusLabel(row.status).toLowerCase()}.`)
          return
        }
        if (session.method === 'pix' && session.pix) {
          setPixCharge({
            purchaseId: session.purchaseId,
            ...session.pix,
            status: row.status,
          })
          startPoll(session.purchaseId, 'pix')
        } else if (session.method === 'card') {
          setMethod('card')
          setCardAttempt((prev) => ({
            ...prev,
            phase: 'pending',
            purchaseId: session.purchaseId,
          }))
          startPoll(session.purchaseId, 'card')
        }
      } catch (err) {
        setError(friendlyPixError(err))
      }
    })()
    return () => poller.stop()
  }, [api, poller, props.onPaid, props.pack.key])

  function startPoll(purchaseId: string, kind: 'pix' | 'card') {
    poller.start({
      purchaseId,
      onStatus: (status) => {
        if (kind === 'pix') {
          setPixCharge((prev) => (prev ? { ...prev, status } : prev))
        } else {
          setCardAttempt((prev) => applyCardPollStatus(prev, status).attempt)
        }
        if (status.toUpperCase() === 'PAID') {
          clearCheckoutSession()
          setMessage('Pagamento confirmado pelo servidor.')
          props.onPaid()
        } else if (isTerminalPurchaseStatus(status) && status.toUpperCase() !== 'PAID') {
          clearCheckoutSession()
        }
      },
      onTimeout: () => {
        if (kind === 'card') {
          setCardAttempt((prev) => ({
            ...prev,
            pollTimedOut: true,
            message: CARD_POLL_TIMEOUT_MESSAGE,
          }))
        } else {
          setMessage(CARD_POLL_TIMEOUT_MESSAGE)
        }
      },
      onFatalError: (err) => setError(friendlyPixError(err)),
    })
  }

  async function selectCard() {
    if (!canSwitchMethod) return
    setMethod('card')
    if (publicKey || configLoading) return
    setConfigLoading(true)
    setConfigError(null)
    try {
      const config = await fetchCardCheckoutConfig(api)
      if (!config.publicKey.trim()) throw new ApiError('Chave pública ausente.', 503)
      setPublicKey(config.publicKey.trim())
    } catch (err) {
      setConfigError(friendlyCardConfigError(err))
    } finally {
      setConfigLoading(false)
    }
  }

  async function createPix() {
    if (vipBlocked || pixCreating || pixCharge) return
    const fiscalError = validateFiscalForm(fiscal)
    if (fiscalError) {
      setError(fiscalError)
      return
    }
    setPixCreating(true)
    setError(null)
    setMessage(null)
    poller.stop()
    try {
      const charge = await createPixCreditCharge(
        api,
        pack.key,
        fiscalPayloadFromForm(fiscal),
      )
      setPixCharge(charge)
      saveCheckoutSession({
        purchaseId: charge.purchaseId,
        method: 'pix',
        packageKey: pack.key,
        pix: {
          qrCodeText: charge.qrCodeText,
          qrCodeImage: charge.qrCodeImage,
          expiresAt: charge.expiresAt,
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
        },
      })
      if (!isTerminalPurchaseStatus(charge.status)) {
        startPoll(charge.purchaseId, 'pix')
      } else if (charge.status.toUpperCase() === 'PAID') {
        clearCheckoutSession()
        props.onPaid()
      }
    } catch (err) {
      setError(friendlyPixError(err))
    } finally {
      setPixCreating(false)
    }
  }

  const onCardSubmit = useCallback(
    async (form: CardBrickSubmitPayload) => {
      if (submitLockRef.current || !cardAttemptAllowsMethodSwitch(cardAttempt)) {
        setError(CARD_DUPLICATE_SUBMIT_MESSAGE)
        throw new Error(CARD_DUPLICATE_SUBMIT_MESSAGE)
      }
      if (form.installments !== 1 || form.paymentType !== 'credit_card') {
        const msg = 'Somente cartão de crédito à vista está disponível.'
        setError(msg)
        throw new Error(msg)
      }
      const fiscalError = validateFiscalForm(fiscal)
      if (fiscalError) {
        setError(fiscalError)
        throw new Error(fiscalError)
      }
      if (vipBlocked) {
        const msg =
          'A compra de créditos VIP ainda não está disponível. Nenhum pagamento foi iniciado.'
        setError(msg)
        throw new Error(msg)
      }
      submitLockRef.current = true
      let next = beginCardSubmit(cardAttempt, createCardIdempotencyKey)
      setCardAttempt(next)
      setError(null)
      try {
        const raw = await payCardCreditPurchase(api, {
          packageKey: pack.key,
          idempotencyKey: next.idempotencyKey,
          token: form.token,
          paymentMethodId: form.paymentMethodId,
          fiscal: fiscalPayloadFromForm(fiscal),
        })
        const step = applyCardPayResult(next, raw)
        setCardAttempt(step.attempt)
        if (step.attempt.message) setMessage(step.attempt.message)
        if (step.reloadWallet) {
          clearCheckoutSession()
          props.onPaid()
        } else if (step.poll && step.attempt.purchaseId) {
          saveCheckoutSession({
            purchaseId: step.attempt.purchaseId,
            method: 'card',
            packageKey: pack.key,
          })
          startPoll(step.attempt.purchaseId, 'card')
        }
        if (step.rejectBrick) throw new Error(step.attempt.message ?? 'Pagamento recusado.')
      } catch (err) {
        if (!(err instanceof Error && err.message === CARD_DUPLICATE_SUBMIT_MESSAGE)) {
          setError(err instanceof ApiError ? err.message : 'Falha no pagamento com cartão.')
        }
        throw err
      } finally {
        submitLockRef.current = false
      }
    },
    [api, cardAttempt, fiscal, pack.key, props, vipBlocked],
  )

  const pixExpired =
    pixCharge?.expiresAt != null &&
    !isTerminalPurchaseStatus(pixCharge.status) &&
    Date.now() > new Date(pixCharge.expiresAt).getTime()

  const qrSrc = qrImageSrc(pixCharge?.qrCodeImage)

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body vstack gap-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div>
            <p className="small text-muted mb-1">Pacote</p>
            <p className="fw-semibold mb-0">
              {pack.credits} crédito(s){isVipCreditPackage(pack) ? ' VIP' : ''} —{' '}
              {formatMoney(price)}
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onBack}>
            Trocar pacote
          </button>
        </div>

        {vipBlocked ? (
          <div className="alert alert-warning small mb-0">
            Compra VIP indisponível neste catálogo. Nenhum pagamento será iniciado.
          </div>
        ) : null}

        <FiscalInvoiceSection
          state={fiscal}
          onChange={setFiscal}
          disabled={!!pixCharge || cardAttempt.phase === 'submitting' || cardAttempt.phase === 'pending'}
        />

        <div className="btn-group w-100" role="group">
          <button
            type="button"
            className={`btn ${method === 'pix' ? 'btn-warning' : 'btn-outline-secondary'}`}
            disabled={!canSwitchMethod}
            onClick={() => canSwitchMethod && setMethod('pix')}
          >
            PIX
          </button>
          <button
            type="button"
            className={`btn ${method === 'card' ? 'btn-warning' : 'btn-outline-secondary'}`}
            disabled={!canSwitchMethod}
            onClick={() => void selectCard()}
          >
            Cartão
          </button>
        </div>

        {error ? <div className="alert alert-warning small mb-0">{error}</div> : null}
        {message ? <div className="alert alert-success small mb-0">{message}</div> : null}

        {method === 'pix' ? (
          <div className="vstack gap-2">
            {!pixCharge ? (
              <button
                type="button"
                className="btn btn-warning"
                disabled={vipBlocked || pixCreating}
                onClick={() => void createPix()}
              >
                {pixCreating ? 'Gerando PIX…' : 'Gerar QR Code PIX'}
              </button>
            ) : (
              <>
                <p className="small mb-0">
                  Status: <strong>{purchaseStatusLabel(pixCharge.status)}</strong>
                  {pixExpired ? ' (expirado — gere um novo PIX se necessário)' : null}
                </p>
                {qrSrc ? (
                  <img src={qrSrc} alt="QR Code PIX" className="mx-auto d-block" width={220} height={220} />
                ) : null}
                {pixCharge.qrCodeText ? (
                  <div>
                    <label className="form-label small">Copia e cola</label>
                    <textarea
                      className="form-control form-control-sm font-monospace"
                      rows={4}
                      readOnly
                      value={pixCharge.qrCodeText}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-dark mt-2"
                      onClick={() => void navigator.clipboard.writeText(pixCharge.qrCodeText ?? '')}
                    >
                      Copiar código
                    </button>
                  </div>
                ) : null}
                <p className="small text-muted mb-0">
                  Créditos entram só após confirmação do servidor (webhook/polling). Não feche antes de pagar.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="vstack gap-2">
            {configLoading ? <p className="small text-muted mb-0">Carregando cartão…</p> : null}
            {configError ? <div className="alert alert-warning small mb-0">{configError}</div> : null}
            {cardAttempt.message ? (
              <div className="alert alert-info small mb-0">{cardAttempt.message}</div>
            ) : null}
            {publicKey && cardAttempt.phase !== 'approved' ? (
              <>
                <p id="card-payment-notice" className="small text-muted mb-0">
                  Dados do cartão ficam no formulário seguro do Mercado Pago. A After não armazena número nem CVV.
                </p>
                <MercadoPagoCardBrick
                  publicKey={publicKey}
                  amount={price}
                  payerEmail={props.payerEmail}
                  enabled={!vipBlocked && cardAttempt.phase !== 'submitting'}
                  onSubmit={onCardSubmit}
                  onError={(msg) => setError(msg)}
                />
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
