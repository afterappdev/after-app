import { getApiBaseUrl } from '../config/env'

export class ApiError extends Error {
  readonly statusCode: number
  readonly body: unknown

  constructor(message: string, statusCode: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.body = body
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type ApiClientOptions = {
  getToken?: () => string | null
  onUnauthorized?: () => void
}

export class ApiClient {
  private token: string | null = null
  private readonly getToken: () => string | null
  private readonly onUnauthorized?: () => void

  constructor(options: ApiClientOptions = {}) {
    this.getToken = options.getToken ?? (() => this.token)
    this.onUnauthorized = options.onUnauthorized
  }

  setToken(token: string | null) {
    this.token = token
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type') && body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    const token = this.getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(
        `Não foi possível conectar à API em ${getApiBaseUrl()}.`,
        0,
      )
    }

    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = text
      }
    }

    if (response.status === 401 && token) {
      this.onUnauthorized?.()
    }

    if (!response.ok) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'message' in parsed &&
        typeof (parsed as { message: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : typeof parsed === 'string' && parsed.trim()
            ? parsed
            : `Erro HTTP ${response.status}`
      throw new ApiError(message, response.status, parsed)
    }

    return parsed as T
  }

  get<T>(path: string) {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body)
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body)
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body)
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }
}
