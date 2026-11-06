import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  fetchCreditPackages,
  fetchCreditPurchaseById,
  fetchCreditPurchases,
  fetchCreditWallet,
  fetchVipCreditPackages,
} from '../../api/credits'
import { AsyncPanel } from '../../components/common/AsyncPanel'
import { IconLock } from '../../components/icons/AfterIcons'
import { AfterPageHeader } from '../../components/layout/AfterPageHeader'
import { useAuth } from '../../auth/AuthContext'
import { purchaseProviderLabel, purchaseStatusLabel } from '../../utils/purchaseLabels'
import { reconcilePendingPurchases } from '../../utils/purchasePoll'
import {
  firstDisplayableVipOffer,
  isVipCreditPackage,
  preferredInitialPackageKey,
  sortCommonCreditPackages,
  vipWebCheckoutPack,
} from '../../utils/vipCatalog'
import type { CreditPackage, CreditPurchase } from './types'
import { WebCheckoutPanel } from './WebCheckoutPanel'
import { BuyCreditsPackageTile } from './BuyCreditsPackageTile'
import { BuyCreditsWalletBadge } from './BuyCreditsWalletBadge'
import {
  buildOfferList,
  formatMoney,
} from './buyCreditsHelpers'

function checkoutPackForKey(
  key: string,
  common: CreditPackage[],
  vipOffer: CreditPackage | null,
): CreditPackage | null {
  if (vipOffer?.key === key) {
    return vipWebCheckoutPack(vipOffer) ?? vipOffer
  }
  return common.find((p) => p.key === key) ?? null
}

export function BuyCreditsPage() {
  const { api, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [vipBalance, setVipBalance] = useState(0)
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [vipOffer, setVipOffer] = useState<CreditPackage | null>(null)
  const [vipCatalogError, setVipCatalogError] = useState<string | null>(null)
  const [purchases, setPurchases] = useState<CreditPurchase[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [userPicked, setUserPicked] = useState(false)

  const packParam = searchParams.get('pack')

  const vipCheckoutReady = vipOffer != null && vipWebCheckoutPack(vipOffer) != null

  const loadWallet = useCallback(async () => {
    const wallet = await fetchCreditWallet(api)
    setBalance(wallet.balance)
    setVipBalance(wallet.vipBalance)
  }, [api])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [wallet, commonRaw, vipRaw, history] = await Promise.all([
        fetchCreditWallet(api),
        fetchCreditPackages(api),
        fetchVipCreditPackages(api).catch(() => [] as CreditPackage[]),
        fetchCreditPurchases(api),
      ])
      const common = sortCommonCreditPackages(
        commonRaw.filter((p) => p.key !== 'welcome' && !isVipCreditPackage(p)),
      )
      const vip = firstDisplayableVipOffer(vipRaw)
      const checkoutReady = vip != null && vipWebCheckoutPack(vip) != null
      setBalance(wallet.balance)
      setVipBalance(wallet.vipBalance)
      setPackages(common)
      setVipOffer(vip)
      setVipCatalogError(vip ? null : 'Pacote VIP indisponível no catálogo.')
      setPurchases(history)

      setSelectedKey((prev) => {
        const known = new Set([...common.map((p) => p.key), ...(vip ? [vip.key] : [])])
        if (packParam && known.has(packParam)) return packParam
        if (userPicked && prev && known.has(prev)) return prev
        return preferredInitialPackageKey({
          vipOffer: vip,
          vipCheckoutReady: checkoutReady,
          commonPackages: common,
        })
      })

      const reconciled = await reconcilePendingPurchases({
        purchases: history,
        fetchById: (id) => fetchCreditPurchaseById(api, id),
      })
      setPurchases(reconciled.purchases)
      if (reconciled.anyBecamePaid) await loadWallet()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar pacotes.')
    } finally {
      setLoading(false)
    }
  }, [api, loadWallet, packParam, userPicked])

  useEffect(() => {
    void load()
  }, [load])

  const offers = useMemo(
    () => buildOfferList(packages, vipOffer),
    [packages, vipOffer],
  )

  const selectedPack = useMemo(() => {
    if (!selectedKey) return null
    return checkoutPackForKey(selectedKey, packages, vipOffer)
  }, [selectedKey, packages, vipOffer])

  const checkoutOpen = !!packParam && !!selectedPack && packParam === selectedKey

  const canContinue =
    !!selectedKey &&
    !!selectedPack &&
    (isVipCreditPackage(selectedPack)
      ? vipCheckoutReady
      : selectedPack.priceBrl != null && selectedPack.priceBrl > 0)

  function selectPackage(key: string) {
    setUserPicked(true)
    setSelectedKey(key)
    if (packParam) {
      searchParams.delete('pack')
      setSearchParams(searchParams)
    }
  }

  function openCheckout() {
    if (!selectedKey || !canContinue) return
    setUserPicked(true)
    setSearchParams({ pack: selectedKey })
  }

  function closeCheckout() {
    searchParams.delete('pack')
    setSearchParams(searchParams)
  }

  async function onCheckoutPaid() {
    await loadWallet()
    const history = await fetchCreditPurchases(api)
    const reconciled = await reconcilePendingPurchases({
      purchases: history,
      fetchById: (id) => fetchCreditPurchaseById(api, id),
    })
    setPurchases(reconciled.purchases)
    closeCheckout()
  }

  const totalLabel = selectedPack?.priceBrl != null ? `Total: ${formatMoney(selectedPack.priceBrl)}` : null

  return (
    <div className="after-canvas after-canvas--wide buy-credits-page vstack gap-2">
      <AfterPageHeader
        title="Comprar créditos"
        backTo="/perfil"
        backLabel="← Perfil do local"
        actions={
          !loading && !error ? (
            <BuyCreditsWalletBadge commonBalance={balance} vipBalance={vipBalance} />
          ) : null
        }
      />

      <AsyncPanel loading={loading} error={error} onRetry={() => void load()}>
        {checkoutOpen && selectedPack ? (
          <WebCheckoutPanel
            pack={selectedPack}
            payerEmail={user?.email}
            onPaid={() => void onCheckoutPaid()}
            onBack={closeCheckout}
          />
        ) : (
          <div className="buy-credits-split">
            <div className="buy-credits-main">
              <h2 className="buy-section-title">Escolha um pacote</h2>

              {vipCatalogError && !vipOffer ? (
                <p className="small text-muted mb-0">{vipCatalogError}</p>
              ) : null}

              <div className="buy-pack-list">
                {offers.length === 0 ? (
                  <p className="text-muted small mb-0">Nenhum pacote disponível.</p>
                ) : (
                  offers.map((pack) => (
                    <BuyCreditsPackageTile
                      key={pack.key}
                      pack={pack}
                      selected={pack.key === selectedKey}
                      commonPackages={packages}
                      onSelect={() => selectPackage(pack.key)}
                    />
                  ))
                )}
              </div>

              <div className="buy-pay-bar">
                <button
                  type="button"
                  className="buy-pay-btn"
                  disabled={!canContinue}
                  onClick={openCheckout}
                >
                  <span>Continuar para pagamento</span>
                  {totalLabel ? <span className="buy-pay-total">{totalLabel}</span> : null}
                </button>
                <p className="buy-pay-secure mb-0">
                  <IconLock size={14} />
                  Pagamento 100% seguro
                </p>
              </div>
            </div>

            <aside className="buy-credits-aside">
              <div className="card shadow-sm buy-history-card h-100">
                <div className="card-body">
                  <h2 className="buy-section-title mb-2">Histórico de compras</h2>
                  {purchases.length === 0 ? (
                    <p className="text-muted small mb-0">Nenhuma compra ainda.</p>
                  ) : (
                    <ul className="list-group list-group-flush buy-history-list">
                      {purchases.map((item) => (
                        <li key={item.id} className="list-group-item px-0">
                          <div className="d-flex justify-content-between gap-2">
                            <span className="small">
                              {item.credits} créd. {item.modality === 'VIP' ? 'VIP' : 'comum'} —{' '}
                              {purchaseStatusLabel(item.status)}
                            </span>
                            <span
                              className={`small fw-semibold ${item.modality === 'VIP' ? 'buy-price-vip' : 'buy-price-common'}`}
                            >
                              {formatMoney(item.amountPaid)}
                            </span>
                          </div>
                          {purchaseProviderLabel(item.provider) ? (
                            <p className="small text-muted mb-0">
                              {purchaseProviderLabel(item.provider)}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </AsyncPanel>
    </div>
  )
}
