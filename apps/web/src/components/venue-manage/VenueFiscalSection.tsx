import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../api/client'
import {
  fetchVenueFiscalDocument,
  saveVenueFiscalDocument,
  type VenueFiscalDocument,
} from '../../api/venueOwner'
import type { ApiClient } from '../../api/client'
import { AsyncPanel } from '../common/AsyncPanel'
import {
  digitsOnly,
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
} from '../../utils/brDocument'

type Props = {
  api: ApiClient
  venueId: string
}

export function VenueFiscalSection({ api, venueId }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<VenueFiscalDocument | null>(null)
  const [docType, setDocType] = useState<'CPF' | 'CNPJ'>('CPF')
  const [document, setDocument] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSaved(await fetchVenueFiscalDocument(api, venueId))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar dados fiscais.')
    } finally {
      setLoading(false)
    }
  }, [api, venueId])

  useEffect(() => {
    void load()
  }, [load])

  function validate(): string | null {
    const digits = digitsOnly(document)
    if (!digits) return 'Informe um CPF ou CNPJ.'
    if (docType === 'CNPJ') return isValidCnpj(digits) ? null : 'CNPJ inválido.'
    return isValidCpf(digits) ? null : 'CPF inválido.'
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const message = validate()
    if (message) {
      setToast(message)
      return
    }
    setSaving(true)
    try {
      const next = await saveVenueFiscalDocument(api, venueId, {
        documentType: docType,
        documentNumber: digitsOnly(document),
      })
      setSaved(next)
      setDocument('')
      setToast('Documento salvo com sucesso.')
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const masked =
    saved?.documentDigits && saved.documentType
      ? saved.documentType === 'CNPJ'
        ? formatCnpj(saved.documentDigits)
        : formatCpf(saved.documentDigits)
      : null

  return (
    <div>
      {toast ? (
        <div className="alert alert-info alert-dismissible fade show">
          {toast}
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      ) : null}
      <AsyncPanel loading={loading} error={error} onRetry={() => void load()}>
        <form className="vstack gap-3" onSubmit={onSubmit}>
          {masked ? (
            <p className="small text-muted mb-0">
              Documento cadastrado: <strong>{masked}</strong>
            </p>
          ) : (
            <p className="small text-muted mb-0">Nenhum documento fiscal cadastrado.</p>
          )}
          <div>
            <label className="form-label" htmlFor="fiscal-type">
              Tipo
            </label>
            <select
              id="fiscal-type"
              className="form-select"
              value={docType}
              onChange={(e) => setDocType(e.target.value as 'CPF' | 'CNPJ')}
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="fiscal-doc">
              {docType === 'CNPJ' ? 'CNPJ' : 'CPF'}
            </label>
            <input
              id="fiscal-doc"
              className="form-control"
              inputMode="numeric"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder={docType === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
            />
          </div>
          {saved?.additionalFields?.length ? (
            <p className="small text-muted mb-0">
              Para nota fiscal completa, a API também pode exigir:{' '}
              {saved.additionalFields.join(', ')}.
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-sm align-self-start" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar documento'}
          </button>
        </form>
      </AsyncPanel>
    </div>
  )
}
