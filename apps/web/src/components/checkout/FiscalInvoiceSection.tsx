import type { FiscalFormState } from '../../utils/fiscalPurchase'
import { digitsOnly, formatCnpj, formatCpf } from '../../utils/brDocument'

type Props = {
  state: FiscalFormState
  onChange: (next: FiscalFormState) => void
  disabled?: boolean
}

export function FiscalInvoiceSection(props: Props) {
  const { state, disabled } = props

  function patch(partial: Partial<FiscalFormState>) {
    props.onChange({ ...state, ...partial })
  }

  function onDocumentChange(raw: string) {
    const max = state.personType === 'CNPJ' ? 14 : 11
    let digits = digitsOnly(raw)
    if (digits.length > max) digits = digits.slice(0, max)
    const masked = state.personType === 'CNPJ' ? formatCnpj(digits) : formatCpf(digits)
    patch({ documentMasked: masked })
  }

  return (
    <div className="border rounded p-3 vstack gap-2">
      <div className="form-check">
        <input
          id="invoice-requested"
          type="checkbox"
          className="form-check-input"
          checked={state.invoiceRequested}
          disabled={disabled}
          onChange={(e) => patch({ invoiceRequested: e.target.checked })}
        />
        <label className="form-check-label small" htmlFor="invoice-requested">
          Quero nota fiscal (CPF/CNPJ)
        </label>
      </div>
      {!state.invoiceRequested ? (
        <p className="small text-muted mb-0">Sem nota: nenhum dado fiscal é enviado ao pagamento.</p>
      ) : (
        <>
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn ${state.personType === 'CPF' ? 'btn-warning' : 'btn-outline-secondary'}`}
              disabled={disabled}
              onClick={() => patch({ personType: 'CPF', documentMasked: '' })}
            >
              CPF
            </button>
            <button
              type="button"
              className={`btn ${state.personType === 'CNPJ' ? 'btn-warning' : 'btn-outline-secondary'}`}
              disabled={disabled}
              onClick={() => patch({ personType: 'CNPJ', documentMasked: '' })}
            >
              CNPJ
            </button>
          </div>
          <input
            className="form-control form-control-sm"
            placeholder="Nome ou razão social"
            value={state.name}
            disabled={disabled}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <input
            className="form-control form-control-sm"
            placeholder={state.personType === 'CNPJ' ? 'CNPJ' : 'CPF'}
            value={state.documentMasked}
            disabled={disabled}
            onChange={(e) => onDocumentChange(e.target.value)}
            inputMode="numeric"
          />
          <input
            className="form-control form-control-sm"
            placeholder="E-mail fiscal"
            type="email"
            value={state.email}
            disabled={disabled}
            onChange={(e) => patch({ email: e.target.value, emailTouched: true })}
          />
        </>
      )}
    </div>
  )
}
