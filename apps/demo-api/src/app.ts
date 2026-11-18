/**
 * The demo API: a few read-only routes over the tools of `@hood-toolkit/mcp`,
 * with a budget per client and a short cache in front of the RPC endpoint.
 *
 * It is a function from a web-standard `Request` to a `Response`, so it is
 * tested without a socket and runs behind any HTTP server.
 *
 * Every answer is JSON: `{ "data": … }` or `{ "error": { "code", "message" } }`.
 * Nothing here signs, sends or stores anything about a caller.
 */

import { EvmRpcError, EvmRpcUnavailable, type EvmRpc } from '@hood-toolkit/evm';
import { DEFAULT_TOOL_LIMITS, InvalidArguments, TOOLS, ToolFailure, checkArguments, createMcpServer, type LaunchSource, type Tool, type ToolContext, type ToolLimits } from '@hood-toolkit/mcp';
import { RateLimiter, TtlCache } from './guards';

export interface AppOptions {
  readonly rpc: EvmRpc;
  readonly feed?: LaunchSource | null;
  /** Points a client gets a minute (default 30). A token read or a quote costs 1, a trade list 2, a launch list 3. */
  readonly ratePerMinute?: number;
  /** Tool calls running at once across all clients (default 4); past it the answer is 503. */
  readonly maxConcurrent?: number;
  readonly limits?: Partial<ToolLimits>;
  readonly now?: () => number;
}

export interface App {
  /** `client` is what the budget is counted by: the caller's address as the HTTP server saw it. */
  handle(request: Request, client: string): Promise<Response>;
}

interface Route {
  readonly method: 'GET' | 'POST';
  /** Path segments; a segment starting with `:` is an argument of that name. */
  readonly path: readonly string[];
  readonly tool: string;
  readonly summary: string;
  /** Query parameters passed to the tool, and whether each is a number. */
  readonly query?: Readonly<Record<string, 'string' | 'number'>>;
  readonly cost: number;
  /** How long an answer is reused, in milliseconds; 0 for never. */
  readonly ttlMs: number;
  readonly body?: boolean;
}

export const ROUTES: readonly Route[] = [
  { method: 'GET', path: ['v1', 'pons', ':token'], tool: 'pons_token', summary: 'A Pons token: its curve, paired asset, progress, price in the paired asset, fee and tax', cost: 1, ttlMs: 3_000 },
  { method: 'GET', path: ['v1', 'pons', ':token', 'quote'], tool: 'pons_quote', summary: 'Quote a buy or sell on a Pons curve', query: { side: 'string', amountIn: 'string', slippageBps: 'number', wallet: 'string' }, cost: 1, ttlMs: 2_000 },
  { method: 'GET', path: ['v1', 'pons', ':token', 'trades'], tool: 'pons_trades', summary: 'Recent trades on a Pons curve, newest first', query: { blocks: 'number' }, cost: 2, ttlMs: 5_000 },
  { method: 'GET', path: ['v1', 'pons-launches'], tool: 'pons_launches', summary: 'Recent Pons launches, newest first, from the factory', query: { blocks: 'number', limit: 'number' }, cost: 3, ttlMs: 10_000 },
  { method: 'GET', path: ['v1', 'tokens', ':token'], tool: 'token_info', summary: 'What any token says about itself, and whether Pons launched it', cost: 1, ttlMs: 60_000 },
  { method: 'GET', path: ['v1', 'launches'], tool: 'latest_launches', summary: 'The newest launchpad tokens (needs the launch feed)', query: { limit: 'number' }, cost: 1, ttlMs: 2_000 },
  { method: 'GET', path: ['v1', 'trending'], tool: 'trending_tokens', summary: 'The most traded launchpad tokens of the last five minutes (needs the launch feed)', query: { limit: 'number' }, cost: 1, ttlMs: 2_000 },
];

/** Which HTTP status a tool's refusal becomes. Anything not listed is a 500 with a general message. */
const STATUS: Readonly<Record<string, number>> = { INVALID_ARGUMENTS: 400, BAD_AMOUNT: 400, NOT_A_PONS_TOKEN: 404, GRADUATED: 409, ROUNDS_TO_ZERO: 422, FEES_CONSUME_TRADE: 422, BAD_STATE: 502, RPC_ERROR: 502, RPC_UNAVAILABLE: 503, NO_FEED: 404 };
const MAX_BODY_BYTES = 1_048_576;
const MCP_COST = 2;

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } as const;
const toJson = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));

function answer(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(toJson(body), { status, headers: { ...HEADERS, 'Cache-Control': 'no-store', ...headers } });
}

const refuse = (status: number, code: string, message: string, extra: { details?: unknown; headers?: Record<string, string> } = {}): Response =>
  answer(status, { error: { code, message, ...(extra.details !== undefined ? { details: extra.details } : {}) } }, extra.headers);

function match(route: Route, method: string, segments: readonly string[]): Record<string, string> | null {
  if (route.method !== method || route.path.length !== segments.length) return null;
  const args: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const want = route.path[i]!;
    if (want.startsWith(':')) args[want.slice(1)] = segments[i]!;
    else if (want !== segments[i]) return null;
  }
  return args;
}

export function createApp(options: AppOptions): App {
  const now = options.now ?? Date.now;
  const feed = options.feed ?? null;
  const context: ToolContext = { rpc: options.rpc, feed, limits: { ...DEFAULT_TOOL_LIMITS, ...options.limits } };
  const tools = new Map<string, Tool>(TOOLS.map((tool) => [tool.name, tool]));
  const routes = ROUTES.filter((route) => feed !== null || !tools.get(route.tool)?.needsFeed);
  const limiter = new RateLimiter(Math.max(1, options.ratePerMinute ?? 30), undefined, now);
  const cache = new TtlCache(5_000, now);
  const maxConcurrent = Math.max(1, options.maxConcurrent ?? 4);
  const mcp = createMcpServer({ rpc: options.rpc, feed, limits: options.limits, maxConcurrentCalls: maxConcurrent, maxWaitingCalls: 0 });
  let running = 0;

  const index = {
    name: 'hoodtoolkit demo API',
    about: 'Read-only. Every answer is {"data": …} or {"error": {"code", "message"}}. Unknown values are null, never zero. Token amounts are whole numbers of base units as strings.',
    limits: { pointsPerMinute: options.ratePerMinute ?? 30, note: 'Each route costs points; past the budget the answer is 429 with Retry-After.' },
    routes: [...routes.map((r) => ({ method: r.method, path: `/${r.path.join('/')}`, query: r.query ? Object.keys(r.query) : [], cost: r.cost, summary: r.summary })), { method: 'POST', path: '/mcp', query: [], cost: MCP_COST, summary: 'The same tools over the Model Context Protocol (JSON-RPC)' }],
  };

  async function run(route: Route, raw: Record<string, unknown>): Promise<Response> {
    const tool = tools.get(route.tool)!;
    let args: Record<string, unknown>;
    try {
      args = checkArguments(tool.input, raw);
    } catch (error) {
      if (error instanceof InvalidArguments) return refuse(400, 'INVALID_ARGUMENTS', error.message);
      throw error;
    }
    const read = async (): Promise<unknown> => {
      if (running >= maxConcurrent) throw new ToolFailure('BUSY', 'The server is busy. Try again in a moment.');
      running += 1;
      try {
        return await tool.run(args, context);
      } finally {
        running -= 1;
      }
    };
    try {
      const key = `${route.tool}:${JSON.stringify(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)))}`;
      const data = route.ttlMs > 0 ? await cache.get(key, route.ttlMs, read) : await read();
      return answer(200, { data });
    } catch (error) {
      if (error instanceof ToolFailure) {
        if (error.code === 'BUSY') return refuse(503, 'BUSY', error.message, { headers: { 'Retry-After': '2' } });
        return refuse(STATUS[error.code] ?? 500, error.code, error.message, { details: error.details });
      }
      if (error instanceof EvmRpcUnavailable) return refuse(503, 'RPC_UNAVAILABLE', 'The Robinhood Chain endpoint is not answering. Try again shortly.', { headers: { 'Retry-After': '5' } });
      if (error instanceof EvmRpcError) return refuse(502, 'RPC_ERROR', 'The Robinhood Chain endpoint answered with an error.');
      // What went wrong inside stays inside: a caller gets a general sentence, never a stack or an endpoint's address.
      return refuse(500, 'FAILED', 'The request could not be answered.');
    }
  }

  async function handle(request: Request, client: string): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    // The index is also at /v1, so a site served from the same origin as the API can read it.
    if ((segments.length === 0 || (segments.length === 1 && segments[0] === 'v1')) && method === 'GET') return answer(200, { data: index }, { 'Cache-Control': 'public, max-age=300' });
    if (segments.length === 1 && segments[0] === 'health' && method === 'GET') return answer(200, { data: { ok: true, feed: feed !== null } });

    if (segments.length === 1 && segments[0] === 'mcp') {
      const response = await mcp.handleHttp(request, { limit: () => limiter.take(client, MCP_COST) });
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, headers });
    }

    for (const route of routes) {
      const fromPath = match(route, method, segments);
      if (!fromPath) continue;
      const retryAfter = limiter.take(client, route.cost);
      if (retryAfter !== null) return refuse(429, 'RATE_LIMITED', 'Too many requests. This is a free demo endpoint; run your own for more.', { headers: { 'Retry-After': String(retryAfter) } });
      const raw: Record<string, unknown> = { ...fromPath };
      for (const [name, kind] of Object.entries(route.query ?? {})) {
        const value = url.searchParams.get(name);
        if (value === null || value === '') continue;
        raw[name] = kind === 'number' ? (/^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value) : value;
      }
      if (route.body) {
        if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return refuse(413, 'TOO_LARGE', 'The body is too large.');
        let body: unknown;
        try {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) return refuse(413, 'TOO_LARGE', 'The body is too large.');
          body = JSON.parse(text);
        } catch {
          return refuse(400, 'INVALID_ARGUMENTS', 'The body is not JSON.');
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) return refuse(400, 'INVALID_ARGUMENTS', 'The body must be a JSON object.');
        Object.assign(raw, body);
      }
      return run(route, raw);
    }

    if (ROUTES.some((route) => route.path.length === segments.length && match({ ...route, method: route.method === 'GET' ? 'POST' : 'GET' }, method, segments))) return refuse(405, 'METHOD_NOT_ALLOWED', 'That route does not take this method.');
    return refuse(404, 'NO_ROUTE', 'No such route. GET / lists them.');
  }

  return { handle };
}
