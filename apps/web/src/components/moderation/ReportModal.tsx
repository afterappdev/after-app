import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ReportReason, ReportTargetType } from '../../api/reports'
import { REPORT_REASONS } from '../../constants/reportReasons'

type Props = {
  show: boolean
  title: string
  targetType: ReportTargetType
  targetId: string
  onClose: () => void
  onSubmit: (
    targetType: ReportTargetType,
    targetId: string,
    reason: ReportReason,
    description: string,
  ) => Promise<void>
}

export function ReportModal({
  show,
  title,
  targetType,
  targetId,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState<ReportReason>('INAPPROPRIATE')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!show) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(targetType, targetId, reason, description.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1}>
        <div className="modal-dialog">
          <form className="modal-content" onSubmit={handleSubmit}>
            <div className="modal-header">
              <h2 className="modal-title h5">{title}</h2>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body vstack gap-3">
              {error ? <div className="alert alert-danger py-2">{error}</div> : null}
              <div>
                <label className="form-label" htmlFor="report-reason">
                  Motivo
                </label>
                <select
                  id="report-reason"
                  className="form-select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                >
                  {REPORT_REASONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="report-desc">
                  Detalhes (opcional)
                </label>
                <textarea
                  id="report-desc"
                  className="form-control"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar denúncia'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  )
}
