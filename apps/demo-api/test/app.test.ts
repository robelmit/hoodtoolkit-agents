import { ERC20, EvmRpcError, ZERO_ADDRESS, addressWord, uintWord, type EvmRpc } from '@hood-toolkit/evm';
import { CURVE, FACTORY, PONS_FACTORY } from '@hood-toolkit/pons';
import { describe, expect, it } from 'vitest';
import { ROUTES, createApp } from '../src/app';
import { RateLimiter, TtlCache } from '../src/guards';

const TOKEN = '0x97720cc1daa1ffbfa9d68f3081b2389c5dd9d67d';
const CURVE_ADDRESS = '0xa7efed30692a65c90bf6867af123f335b3214c1a';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const E18 = 10n ** 18n;
const word = (v: bigint | string): string => (typeof v === 'bigint' ? uintWord(v) : addressWord(v));

function harness(options: { fail?: (method: string) => Error | null; feed?: boolean; ratePerMinute?: number; maxConcurrent?: number; gate?: Promise<void> } = {}) {
  let now = 1_000_000;
  const calls: string[] = [];
  const curve: Record<string, string> = {
    [CURVE.quoteReserve]: word(3n * E18),
    [CURVE.tokenReserve]: word(400_000_000n * E18),
    [CURVE.sellableTokens]: word(160_000_000n * E18),
    [CURVE.realQuoteReserve]: word(2n * E18),
    [CURVE.graduationThreshold]: word(42n * E18 / 10n),
    [CURVE.feeBps]: word(100n),
    [CURVE.creatorTaxBps]: word(0n),
    [CURVE.pairToken]: word(ZERO_ADDRESS),
    [CURVE.token]: word(TOKEN),
    [CURVE.graduated]: word(0n),
    [CURVE.readyToGraduate]: word(0n),
    [CURVE.currentSnipeTaxBps]: word(0n),
  };
  const rpc: EvmRpc = {
    async call<T>(method: string, params: unknown[]): Promise<T> {
      calls.push(method);
      const failure = options.fail?.(method);
      if (failure) throw failure;
      if (options.gate) await options.gate;
      if (method === 'eth_blockNumber') return '0x2710' as T;
      if (method === 'eth_getLogs') return [] as T;
      const { to, data } = params[0] as { to: string; data: string };
      const selector = data.slice(0, 10);
      if (to === PONS_FACTORY && selector === FACTORY.getLaunchedToken) {
        const exists = data.endsWith(TOKEN.slice(2));
        return `0x${[word(exists ? TOKEN : ZERO_ADDRESS), word(exists ? CURVE_ADDRESS : ZERO_ADDRESS), word(ZERO_ADDRESS), word(ZERO_ADDRESS), word(ZERO_ADDRESS), word(0n), word(0n), word(0n), word(0n), word(0n), word(0n), word(0n), word(0n), word(0n), word(exists ? 1n : 0n)].join('')}` as T;
      }
      if (to === CURVE_ADDRESS && curve[selector]) return `0x${curve[selector]}` as T;
      if (selector === ERC20.decimals) return `0x${word(to === USDG ? 6n : 18n)}` as T;
      return '0x' as T;
    },
  };
  const feed = options.feed ? { latest: async () => [{ address: TOKEN, price: null }], trending: async () => [] } : null;
  const app = createApp({ rpc, feed, ratePerMinute: options.ratePerMinute, maxConcurrent: options.maxConcurrent, now: () => now });
  const get = (path: string, client = 'a'): Promise<Response> => app.handle(new Request(`http://api.test${path}`), client);
  const post = (path: string, body: unknown, client = 'a'): Promise<Response> => app.handle(new Request(`http://api.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), client);
  const json = async (response: Response): Promise<{ data?: Record<string, unknown>; error?: { code: string; message: string } }> => (await response.json()) as never;
  return { app, get, post, json, calls, tick: (ms: number) => (now += ms) };
}

describe('routes', () => {
  it('lists itself, and leaves the feed routes out when there is no feed', async () => {
    const h = harness();
    const paths = ((await h.json(await h.get('/'))).data!['routes'] as { path: string }[]).map((r) => r.path);
    expect(paths).toEqual(expect.arrayContaining(['/v1/pons/:token', '/v1/pons/:token/quote', '/v1/pons/:token/trades', '/v1/pons-launches', '/v1/tokens/:token', '/mcp']));
    expect(paths).not.toContain('/v1/launches');
    expect(await h.json(await h.get('/v1'))).toEqual(await h.json(await h.get('/')));
    expect((await h.get('/v1/launches')).status).toBe(404);
    expect(await h.json(await h.get('/health'))).toEqual({ data: { ok: true, feed: false } });
    const withFeed = harness({ feed: true });
    expect(await withFeed.json(await withFeed.get('/v1/launches'))).toEqual({ data: { tokens: [{ address: TOKEN, price: null }] } });
  });

  it('reads a Pons token and quotes on its curve, with amounts as strings', async () => {
    const h = harness();
    const token = await h.json(await h.get(`/v1/pons/${TOKEN}`));
    expect(token.data).toMatchObject({ token: TOKEN, curve: CURVE_ADDRESS, progressPct: 47.61, pairedWith: { native: true, symbol: 'ETH', decimals: 18 } });
    const quote = await h.get(`/v1/pons/${TOKEN}/quote?side=buy&amountIn=10000000000000000&slippageBps=100`);
    expect(quote.status).toBe(200);
    expect(quote.headers.get('access-control-allow-origin')).toBe('*');
    expect((await h.json(quote)).data).toMatchObject({ side: 'buy', amountIn: '10000000000000000', slippageBps: 100, fee: '100000000000000', snipeTax: '0' });
  });

  it('reuses an answer for a moment instead of reading the chain again', async () => {
    const h = harness();
    await h.get(`/v1/pons/${TOKEN}`);
    const reads = h.calls.length;
    await h.get(`/v1/pons/${TOKEN}`);
    expect(h.calls.length).toBe(reads);
    h.tick(3_001);
    await h.get(`/v1/pons/${TOKEN}`);
    expect(h.calls.length).toBeGreaterThan(reads);
  });

  it('answers what is not a Pons token, a bad address and a bad amount with a status and a code', async () => {
    const h = harness();
    const notPons = await h.get(`/v1/pons/${USDG}`);
    expect(notPons.status).toBe(404);
    expect((await h.json(notPons)).error!.code).toBe('NOT_A_PONS_TOKEN');
    expect((await h.get('/v1/pons/not-an-address')).status).toBe(400);
    expect((await h.get(`/v1/pons/${TOKEN}/quote?side=buy&amountIn=-1`)).status).toBe(400);
    expect((await h.get(`/v1/pons/${TOKEN}/quote?side=hold&amountIn=1`)).status).toBe(400);
  });

  it('lists recent trades and launches, and reads any token', async () => {
    const h = harness();
    expect((await h.json(await h.get(`/v1/pons/${TOKEN}/trades?blocks=1000`))).data).toMatchObject({ curve: CURVE_ADDRESS, fromBlock: 9_001, toBlock: 10_000, count: 0 });
    expect((await h.json(await h.get('/v1/pons-launches?limit=5'))).data).toMatchObject({ count: 0 });
    expect((await h.json(await h.get(`/v1/tokens/${USDG}`))).data).toMatchObject({ address: USDG, decimals: 6, name: null, launchedOnPons: false });
  });

  it('says the endpoint failed, and leaks nothing of an error it did not expect', async () => {
    const down = harness({ fail: () => new EvmRpcError('eth_call', -32000, 'connect ECONNREFUSED 10.0.0.5:8545 key=abc') });
    const response = await down.get(`/v1/tokens/${USDG}`);
    // A token's own views that fail read as unknown, but the factory read behind it is an error.
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|key=/);
    const broken = harness({ fail: (method) => (method === 'eth_call' ? new Error('internal detail at /srv/secret') : null) });
    const failed = await broken.get(`/v1/pons/${TOKEN}`);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('/srv/secret');
  });

  it('answers 405 for the wrong method, 404 for no route, and CORS preflight', async () => {
    const h = harness();
    expect((await h.post(`/v1/pons/${TOKEN}`, {})).status).toBe(405);
    expect((await h.get('/v2/anything')).status).toBe(404);
    const preflight = await h.app.handle(new Request('http://api.test/v1/pons-launches', { method: 'OPTIONS' }), 'a');
    expect(preflight.status).toBe(204);
  });

  it('serves the MCP endpoint and counts it against the budget', async () => {
    const h = harness({ ratePerMinute: 4 });
    const listed = await h.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(((await listed.json()) as { result: { tools: unknown[] } }).result.tools).toHaveLength(5);
    expect((await h.post('/mcp', { jsonrpc: '2.0', id: 2, method: 'ping' })).status).toBe(200);
    expect((await h.post('/mcp', { jsonrpc: '2.0', id: 3, method: 'ping' })).status).toBe(429);
  });

  it('has one tool behind each route, each with a cost', () => {
    for (const route of ROUTES) expect(route.cost).toBeGreaterThan(0);
    expect(new Set(ROUTES.map((r) => r.tool)).size).toBe(ROUTES.length);
  });
});

describe('the budget', () => {
  it('counts by client and by what a route costs, and says when to come back', async () => {
    const h = harness({ ratePerMinute: 6 });
    // A launch list costs 3 of the 6 points.
    expect((await h.get('/v1/pons-launches')).status).toBe(200);
    expect((await h.get('/v1/pons-launches?limit=2')).status).toBe(200);
    const limited = await h.get('/v1/pons-launches?limit=3');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
    expect((await h.get('/v1/pons-launches?limit=3', 'someone-else')).status).toBe(200);
  });

  it('refuses work past what it runs at once', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ maxConcurrent: 1, gate });
    const first = h.get(`/v1/tokens/${USDG}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const busy = await h.get(`/v1/tokens/${TOKEN}`);
    expect(busy.status).toBe(503);
    release();
    expect((await first).status).toBe(200);
  });

  it('refills evenly, never past the burst', () => {
    let now = 0;
    const limiter = new RateLimiter(60, 2, () => now, 10);
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([null, null, 1]);
    now = 1_000;
    expect(limiter.take('a')).toBeNull();
  });
});

describe('the cache', () => {
  it('shares one read between callers, expires, and drops a read that failed', async () => {
    let now = 0;
    let reads = 0;
    const cache = new TtlCache(3, () => now);
    const read = async (): Promise<number> => ++reads;
    expect(await Promise.all([cache.get('k', 1_000, read), cache.get('k', 1_000, read)])).toEqual([1, 1]);
    now = 1_001;
    expect(await cache.get('k', 1_000, read)).toBe(2);
    await expect(cache.get('bad', 1_000, async () => { throw new Error('no'); })).rejects.toThrow('no');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await cache.get('bad', 1_000, async () => 7)).toBe(7);
  });
});
