import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  fetchCreditPackages,
  fetchCreditPurchaseById,
  fetchCreditPurchases,
  fetchCreditWallet,
  fetchVipCreditPackages,
} from '../../api/credits'
import { AsyncPanel } from '../../components/common/AsyncPanel'
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

function formatMoney(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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

  const selectedPack = useMemo(() => {
    if (!selectedKey) return null
    return checkoutPackForKey(selectedKey, packages, vipOffer)
  }, [selectedKey, packages, vipOffer])

  const checkoutOpen = !!packParam && !!selectedPack && packParam === selectedKey

  function openCheckout(key: string) {
    setUserPicked(true)
    setSelectedKey(key)
    setSearchParams({ pack: key })
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

  return (
    <div className="mx-auto vstack gap-3" style={{ maxWidth: 640 }}>
      <div className="d-flex align-items-center gap-2">
        <Link to="/estabelecimento/creditos" className="btn btn-sm btn-outline-secondary">
          ← Créditos
        </Link>
        <h1 className="h5 mb-0">Comprar créditos</h1>
      </div>

      <AsyncPanel loading={loading} error={error} onRetry={() => void load()}>
        <div className="row g-2 mb-3">
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body">
                <p className="small text-muted mb-1">Comum</p>
                <p className="fs-4 fw-bold mb-0">{balance}</p>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body">
                <p className="small text-muted mb-1">VIP</p>
                <p className="fs-4 fw-bold mb-0">{vipBalance}</p>
              </div>
            </div>
          </div>
        </div>

        {checkoutOpen && selectedPack ? (
          <WebCheckoutPanel
            pack={selectedPack}
            payerEmail={user?.email}
            onPaid={() => void onCheckoutPaid()}
            onBack={closeCheckout}
          />
        ) : (
          <>
            <h2 className="h6">Pacotes comuns</h2>
            <div className="vstack gap-2 mb-4">
              {packages.length === 0 ? (
                <p className="text-muted small">Nenhum pacote disponível.</p>
              ) : (
                packages.map((pkg) => (
                  <div key={pkg.key} className="card border-0 shadow-sm">
                    <div className="card-body d-flex justify-content-between align-items-center gap-2">
                      <div>
                        <strong>{pkg.credits} crédito(s)</strong>
                        <p className="small text-muted mb-0">{pkg.key}</p>
                      </div>
                      <div className="text-end">
                        <p className="mb-0 fw-semibold">{formatMoney(pkg.priceBrl)}</p>
                        <button
                          type="button"
                          className="btn btn-sm btn-warning mt-1"
                          onClick={() => openCheckout(pkg.key)}
                        >
                          Comprar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h2 className="h6">Pacote VIP</h2>
            {vipCatalogError && !vipOffer ? (
              <p className="text-muted small">{vipCatalogError}</p>
            ) : vipOffer ? (
              <div className="card border-0 shadow-sm border-warning mb-4">
                <div className="card-body d-flex justify-content-between align-items-center gap-2">
                  <div>
                    <strong>{vipOffer.credits} crédito VIP</strong>
                    <p className="small text-muted mb-0">
                      {vipCheckoutReady
                        ? formatMoney(vipWebCheckoutPack(vipOffer)?.priceBrl ?? vipOffer.priceBrl)
                        : `Referência ${formatMoney(vipOffer.referencePriceBrl)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-warning"
                    disabled={!vipCheckoutReady}
                    onClick={() => vipCheckoutReady && openCheckout(vipOffer.key)}
                  >
                    {vipCheckoutReady ? 'Comprar VIP' : 'Indisponível'}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        <h2 className="h6">Histórico de compras</h2>
        {purchases.length === 0 ? (
          <p className="text-muted small">Nenhuma compra registrada.</p>
        ) : (
          <ul className="list-group list-group-flush">
            {purchases.map((item) => (
              <li key={item.id} className="list-group-item px-0">
                <div className="d-flex justify-content-between gap-2">
                  <span>
                    {item.credits} créd. {item.modality === 'VIP' ? 'VIP' : 'comum'} —{' '}
                    {purchaseStatusLabel(item.status)}
                  </span>
                  <span className="text-muted small">{formatMoney(item.amountPaid)}</span>
                </div>
                {purchaseProviderLabel(item.provider) ? (
                  <p className="small text-muted mb-0">{purchaseProviderLabel(item.provider)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AsyncPanel>
    </div>
  )
}
