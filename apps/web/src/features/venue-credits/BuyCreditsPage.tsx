import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  fetchCreditPackages,
  fetchCreditPurchases,
  fetchCreditWallet,
  fetchVipCreditPackages,
} from '../../api/credits'
import { AsyncPanel } from '../../components/common/AsyncPanel'
import { useAuth } from '../../auth/AuthContext'
import { purchaseProviderLabel, purchaseStatusLabel } from '../../utils/purchaseLabels'
import type { CreditPackage, CreditPurchase } from './types'

function formatMoney(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BuyCreditsPage() {
  const { api } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [vipBalance, setVipBalance] = useState(0)
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [vipPackages, setVipPackages] = useState<CreditPackage[]>([])
  const [purchases, setPurchases] = useState<CreditPurchase[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [wallet, common, vip, history] = await Promise.all([
        fetchCreditWallet(api),
        fetchCreditPackages(api),
        fetchVipCreditPackages(api),
        fetchCreditPurchases(api),
      ])
      setBalance(wallet.balance)
      setVipBalance(wallet.vipBalance)
      setPackages(common.filter((p) => p.key !== 'welcome'))
      setVipPackages(vip)
      setPurchases(history)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar pacotes.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto vstack gap-3" style={{ maxWidth: 640 }}>
      <div className="d-flex align-items-center gap-2">
        <Link to="/estabelecimento/creditos" className="btn btn-sm btn-outline-secondary">
          ← Créditos
        </Link>
        <h1 className="h5 mb-0">Comprar créditos</h1>
      </div>

      <div className="alert alert-info small mb-0">
        Checkout PIX/cartão entra na <strong>Fase 09</strong>. Aqui você vê pacotes e histórico; pagamento em breve nesta rota.
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
                    <button type="button" className="btn btn-sm btn-primary mt-1" disabled title="Fase 09">
                      Comprar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <h2 className="h6">Pacote VIP</h2>
        <div className="vstack gap-2 mb-4">
          {vipPackages.map((pkg) => (
            <div key={pkg.key} className="card border-0 shadow-sm border-warning">
              <div className="card-body d-flex justify-content-between align-items-center gap-2">
                <div>
                  <strong>{pkg.credits} crédito VIP</strong>
                  <p className="small text-muted mb-0">Referência {formatMoney(pkg.referencePriceBrl)}</p>
                </div>
                <button type="button" className="btn btn-sm btn-warning" disabled title="Fase 09">
                  Comprar VIP
                </button>
              </div>
            </div>
          ))}
        </div>

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
