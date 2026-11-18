/**
 * The demo API: every answer is `{ data }` or `{ error: { code, message } }`. Amounts are whole numbers of base units
 * as strings; unknown values are null, never zero. A busy or rate-limited answer is tried again a few times.
 */

import { useCallback, useEffect, useState } from 'react';

const BASE = (import.meta.env['VITE_API_URL'] as string | undefined)?.replace(/\/$/, '') ?? '';

export interface PairedAsset {
  readonly address: string;
  readonly native: boolean;
  readonly symbol: string | null;
  readonly decimals: number | null;
}

export interface Launch {
  readonly token: string;
  readonly curve: string;
  readonly deployer: string;
  readonly pairToken: string;
  readonly graduationThreshold: string;
  readonly pairedWithNative: boolean;
  readonly block: number;
  readonly tx: string;
  readonly name?: string | null;
  readonly symbol?: string | null;
}

export interface Launches {
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly count: number;
  readonly launches: readonly Launch[];
}

export interface PonsToken {
  readonly token: string;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly decimals: number;
  readonly totalSupply: string | null;
  readonly curve: string;
  readonly pairedWith: PairedAsset;
  readonly graduationThreshold: string;
  readonly realQuoteReserve: string;
  readonly progressPct: number | null;
  readonly spotPriceInPairedAsset: number | null;
  readonly sellableTokens: string | null;
  readonly feeBps: string;
  readonly creatorTaxBps: string;
  readonly graduated: boolean;
  readonly readyToGraduate: boolean;
}

export interface Trade {
  readonly side: 'buy' | 'sell';
  readonly trader: string;
  readonly quoteAmount: string;
  readonly tokenAmount: string;
  readonly fee: string;
  readonly tax: string;
  readonly snipeTaxed: boolean;
  readonly block: number;
  readonly tx: string;
}

export interface Trades {
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly count: number;
  readonly trades: readonly Trade[];
}

export interface Quote {
  readonly side: 'buy' | 'sell';
  readonly amountIn: string;
  readonly amountOut: string;
  readonly minAmountOut: string;
  readonly slippageBps: number;
  readonly fee: string;
  readonly creatorTax: string;
  readonly snipeTax: string;
  readonly refund: string;
  readonly pairedWith: PairedAsset;
}

export interface TokenInfo {
  readonly address: string;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly totalSupply: string | null;
  readonly launchedOnPons: boolean;
  readonly ponsCurve: string | null;
}

export interface RouteInfo {
  readonly method: string;
  readonly path: string;
  readonly query: readonly string[];
  readonly cost: number;
  readonly summary: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const RETRY = new Set(['BUSY', 'RATE_LIMITED', 'RPC_UNAVAILABLE']);

export async function get<T>(path: string, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
    } catch {
      throw new ApiError('OFFLINE', 'The API is not answering.');
    }
    const body = (await response.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
    if (response.ok && body && 'data' in body) return body.data as T;
    const code = body?.error?.code ?? `HTTP_${response.status}`;
    if (RETRY.has(code) && attempt < tries) {
      const wait = Number(response.headers.get('Retry-After') ?? '2');
      await new Promise((resolve) => setTimeout(resolve, Math.min(8, Math.max(1, wait)) * 1000));
      continue;
    }
    throw new ApiError(code, body?.error?.message ?? 'The request could not be answered.');
  }
}

export const api = {
  health: () => get<{ ok: boolean; feed: boolean }>('/health', 1),
  index: () => get<{ name: string; routes: readonly RouteInfo[] }>('/v1', 1),
  launches: (limit = 30) => get<Launches>(`/v1/pons-launches?limit=${limit}`),
  token: (token: string) => get<PonsToken>(`/v1/pons/${token}`),
  info: (token: string) => get<TokenInfo>(`/v1/tokens/${token}`),
  trades: (token: string) => get<Trades>(`/v1/pons/${token}/trades`),
  quote: (token: string, side: 'buy' | 'sell', amountIn: string) => get<Quote>(`/v1/pons/${token}/quote?side=${side}&amountIn=${amountIn}`),
};

/** Loads once per key, with a reload; keeps the last answer while reloading. */
export function useLoad<T>(load: (() => Promise<T>) | null, key: string) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: load !== null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!load) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error: unknown) => live && setState((s) => ({ data: s.data, error: error instanceof ApiError ? error : new ApiError('FAILED', String(error)), loading: false })),
    );
    return () => {
      live = false;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
