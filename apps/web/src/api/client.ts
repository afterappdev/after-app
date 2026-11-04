import { getApiBaseUrl } from '../config/env'
import {
  buildQueryString,
  isOptionalAuthGet,
  normalizeApiPath,
} from './optionalAuth'

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
    options?: { omitAuth?: boolean; authPath?: string; isRetry?: boolean },
  ): Promise<T> {
    const omitAuth = options?.omitAuth ?? false
    const authPath = options?.authPath ?? normalizeApiPath(path)
    const isRetry = options?.isRetry ?? false

    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type') && body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    const token = omitAuth ? null : this.getToken()
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

    const sentAuthorization = !omitAuth && !isRetry && !!this.getToken()

    if (response.status === 401 && sentAuthorization) {
      this.onUnauthorized?.()
      if (
        !isRetry &&
        method === 'GET' &&
        isOptionalAuthGet(authPath)
      ) {
        return this.request<T>(method, path, body, init, {
          omitAuth: true,
          authPath,
          isRetry: true,
        })
      }
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

  get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ) {
    const authPath = normalizeApiPath(path)
    const qs = buildQueryString(query)
    return this.request<T>('GET', `${authPath}${qs}`, undefined, undefined, {
      authPath,
    })
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

  async upload<T = Record<string, unknown>>(path: string, file: File): Promise<T> {
    const form = new FormData()
    form.append('file', file)
    const headers = new Headers()
    const token = this.getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
    let response: Response
    try {
      response = await fetch(url, { method: 'POST', headers, body: form })
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
    if (response.status === 401) {
      this.onUnauthorized?.()
    }
    if (!response.ok) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'message' in parsed &&
        typeof (parsed as { message: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : `Erro HTTP ${response.status}`
      throw new ApiError(message, response.status, parsed)
    }
    return parsed as T
  }
}
