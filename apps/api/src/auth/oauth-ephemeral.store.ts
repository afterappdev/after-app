import { Injectable } from '@nestjs/common';

export const APPLE_WEB_STATE_TTL_MS = 10 * 60 * 1000;
export const APPLE_WEB_EXCHANGE_TTL_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 4000;
const CLEANUP_INTERVAL_MS = 5_000;

export type AppleWebSession = {
  nonce: string;
  redirect: string;
  expiresAt: number;
};

export type AppleWebExchangeRecord<T> = {
  payload: T;
  expiresAt: number;
};

@Injectable()
export class OAuthEphemeralStore {
  private readonly sessions = new Map<string, AppleWebSession>();
  private readonly exchanges = new Map<string, AppleWebExchangeRecord<unknown>>();
  private lastCleanup = 0;

  constructor(private readonly now: () => number = Date.now) {}

  putSession(
    state: string,
    value: { nonce: string; redirect: string },
    ttlMs = APPLE_WEB_STATE_TTL_MS,
  ) {
    this.cleanup();
    this.evictIfNeeded(this.sessions);
    this.sessions.set(state, {
      nonce: value.nonce,
      redirect: value.redirect,
      expiresAt: this.now() + ttlMs,
    });
  }

  consumeSession(state: string): AppleWebSession | null {
    this.cleanup();
    const row = this.sessions.get(state);
    if (!row) return null;
    this.sessions.delete(state);
    if (row.expiresAt <= this.now()) return null;
    return row;
  }

  peekSession(state: string): AppleWebSession | null {
    const row = this.sessions.get(state);
    if (!row || row.expiresAt <= this.now()) return null;
    return row;
  }

  putExchange<T>(code: string, payload: T, ttlMs = APPLE_WEB_EXCHANGE_TTL_MS) {
    this.cleanup();
    this.evictIfNeeded(this.exchanges);
    this.exchanges.set(code, {
      payload,
      expiresAt: this.now() + ttlMs,
    });
  }

  consumeExchange<T>(code: string): T | null {
    this.cleanup();
    const row = this.exchanges.get(code);
    if (!row) return null;
    this.exchanges.delete(code);
    if (row.expiresAt <= this.now()) return null;
    return row.payload as T;
  }

  get sessionCount() {
    return this.sessions.size;
  }

  get exchangeCount() {
    return this.exchanges.size;
  }

  private cleanup() {
    const now = this.now();
    if (
      now - this.lastCleanup < CLEANUP_INTERVAL_MS &&
      this.sessions.size + this.exchanges.size < MAX_ENTRIES
    ) {
      return;
    }
    this.lastCleanup = now;
    for (const [key, row] of this.sessions) {
      if (row.expiresAt <= now) this.sessions.delete(key);
    }
    for (const [key, row] of this.exchanges) {
      if (row.expiresAt <= now) this.exchanges.delete(key);
    }
  }

  private evictIfNeeded(map: Map<string, { expiresAt: number }>) {
    if (map.size < MAX_ENTRIES) return;
    this.cleanup();
    if (map.size < MAX_ENTRIES) return;
    let oldestKey: string | undefined;
    let oldestExp = Number.POSITIVE_INFINITY;
    for (const [key, row] of map) {
      if (row.expiresAt < oldestExp) {
        oldestExp = row.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) map.delete(oldestKey);
  }
}
