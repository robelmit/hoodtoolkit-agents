import { PassThrough } from 'node:stream';
import { ERC20, EvmRpcUnavailable, ZERO_ADDRESS, addressWord, uintWord, type EvmRpc } from '@hoodtoolkit/evm';
import { CURVE, FACTORY, PONS_FACTORY, PONS_TOPICS, buyMaths, withSlippage } from '@hoodtoolkit/pons';
import { describe, expect, it } from 'vitest';
import { InvalidArguments, MAX_BATCH, RPC, TOOLS, checkArguments, createMcpServer, parseMessages, serveStdio, type JsonRpcResponse, type McpServer } from '../src';

const TOKEN = '0x97720cc1daa1ffbfa9d68f3081b2389c5dd9d67d';
const CURVE_ADDRESS = '0xa7efed30692a65c90bf6867af123f335b3214c1a';
const DEPLOYER = '0x00000000000000000000000000000000000000dd';
const TRADER = '0x00000000000000000000000000000000000000ee';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const E18 = 10n ** 18n;
const word = (v: bigint | string): string => (typeof v === 'bigint' ? uintWord(v) : addressWord(v));
const hexString = (s: string): string => `0x${word(32n)}${word(BigInt(s.length))}${Buffer.from(s).toString('hex').padEnd(64, '0')}`;

interface Fakes {
  graduated?: boolean;
  /** Called on every request first; return something to answer it, or undefined to fall through. */
  intercept?: (method: string, params: unknown[]) => unknown;
  feed?: boolean;
  maxConcurrentCalls?: number;
  maxWaitingCalls?: number;
}

function server(fakes: Fakes = {}): { mcp: McpServer; calls: string[] } {
  const calls: string[] = [];
  const curve: Record<string, string> = {
    [CURVE.quoteReserve]: word(3n * E18),
    [CURVE.tokenReserve]: word(400_000_000n * E18),
    [CURVE.sellableTokens]: word(160_000_000n * E18),
    [CURVE.realQuoteReserve]: word(2n * E18),
    [CURVE.graduationThreshold]: word(42n * E18 / 10n),
    [CURVE.feeBps]: word(100n),
    [CURVE.creatorTaxBps]: word(200n),
    [CURVE.pairToken]: word(ZERO_ADDRESS),
    [CURVE.token]: word(TOKEN),
    [CURVE.graduated]: word(fakes.graduated ? 1n : 0n),
    [CURVE.readyToGraduate]: word(0n),
    [CURVE.currentSnipeTaxBps]: word(0n),
  };
  const tradeLog = (side: 'buy' | 'sell', block: number, tax = 0n) => ({
    address: CURVE_ADDRESS,
    topics: [side === 'buy' ? PONS_TOPICS.curveBuy : PONS_TOPICS.curveSell, `0x${word(TRADER)}`, `0x${word(TRADER)}`],
    data: `0x${word(side === 'buy' ? E18 / 100n : 1000n * E18)}${word(side === 'buy' ? 1000n * E18 : E18 / 200n)}${word(E18 / 10_000n)}${word(tax)}`,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex: '0x0',
  });
  const launchLog = (block: number) => ({
    address: PONS_FACTORY,
    topics: [PONS_TOPICS.tokenLaunched, `0x${word(TOKEN)}`, `0x${word(CURVE_ADDRESS)}`, `0x${word(DEPLOYER)}`],
    data: `0x${word(ZERO_ADDRESS)}${word(0n)}${word(42n * E18 / 10n)}`,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex: '0x0',
  });
  const rpc: EvmRpc = {
    async call<T>(method: string, params: unknown[]): Promise<T> {
      calls.push(method);
      const answer = await fakes.intercept?.(method, params);
      if (answer !== undefined) return answer as T;
      if (method === 'eth_blockNumber') return '0x2710' as T;
      if (method === 'eth_getLogs') {
        const filter = params[0] as { address?: string };
        if (filter.address === CURVE_ADDRESS) return [tradeLog('buy', 9_000, E18 / 500n), tradeLog('sell', 9_500)] as T;
        if (filter.address === PONS_FACTORY) return [launchLog(8_000)] as T;
        return [] as T;
      }
      const { to, data } = params[0] as { to: string; data: string };
      const selector = data.slice(0, 10);
      if (to === PONS_FACTORY && selector === FACTORY.getLaunchedToken) {
        const asked = `0x${data.slice(34)}`;
        const exists = asked === TOKEN;
        return `0x${[word(exists ? TOKEN : ZERO_ADDRESS), word(exists ? CURVE_ADDRESS : ZERO_ADDRESS), word(DEPLOYER), word(DEPLOYER), word(ZERO_ADDRESS), word(42n * E18 / 10n), word(0n), word(0n), word(200n), word(0n), word(0n), word(0n), word(0n), word(0n), word(exists ? 1n : 0n)].join('')}` as T;
      }
      if (to === TOKEN || to === USDG) {
        const usdg = to === USDG;
        if (selector === ERC20.name) return hexString(usdg ? 'Global Dollar' : 'HYLIT') as T;
        if (selector === ERC20.symbol) return hexString(usdg ? 'USDG' : 'HYLIT') as T;
        if (selector === ERC20.decimals) return `0x${word(usdg ? 6n : 18n)}` as T;
        if (selector === ERC20.totalSupply) return `0x${word(usdg ? 10n ** 15n : 1_000_000_000n * E18)}` as T;
      }
      if (to === CURVE_ADDRESS && curve[selector]) return `0x${curve[selector]}` as T;
      throw new Error(`no fake for ${method} ${to} ${selector}`);
    },
  };
  const feed = fakes.feed ? { latest: async (limit: number) => [{ address: TOKEN, symbol: 'HYLIT', price: null }].slice(0, limit), trending: async () => [] } : null;
  return { mcp: createMcpServer({ rpc, feed, maxConcurrentCalls: fakes.maxConcurrentCalls, maxWaitingCalls: fakes.maxWaitingCalls }), calls };
}

let nextId = 0;
type Result = { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] };
const call = async (mcp: McpServer, name: string, args: unknown = {}): Promise<Result> => {
  const response = await mcp.handle({ jsonrpc: '2.0', id: ++nextId, method: 'tools/call', params: { name, arguments: args } });
  return response!.result as Result;
};
const errorOf = (result: Result): { code: string; message: string } => result.structuredContent!['error'] as never;

describe('the protocol', () => {
  it('initializes, echoing a version it speaks and offering the newest otherwise', async () => {
    const { mcp } = server();
    const known = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    expect(known!.result).toMatchObject({ protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'hoodtoolkit' } });
    expect((known!.result as { instructions: string }).instructions).toContain('Robinhood Chain');
    const unknown = await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect((unknown!.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
    expect((await mcp.handle({ jsonrpc: '2.0', id: 3, method: 'ping' }))!.result).toEqual({});
  });

  it('says nothing to a notification and refuses a method or tool it does not have', async () => {
    const { mcp } = server();
    expect(await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect((await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' }))!.error).toMatchObject({ code: RPC.METHOD_NOT_FOUND });
    expect((await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'send_transaction' } }))!.error).toMatchObject({ code: RPC.INVALID_PARAMS });
  });

  it('lists only tools that read, and the feed tools only with a feed', () => {
    expect(server().mcp.tools.map((t) => t.name)).toEqual(['pons_token', 'pons_quote', 'pons_trades', 'pons_launches', 'token_info']);
    const all = server({ feed: true }).mcp.tools;
    expect(all.map((t) => t.name)).toContain('trending_tokens');
    for (const tool of all) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
    expect(TOOLS.some((t) => /send|sign|swap|transfer|withdraw|approve|order/.test(t.name))).toBe(false);
  });

  it('parses one message or a batch, and answers a bad element without losing the good ones', async () => {
    const { mcp } = server();
    const answer = (await mcp.handleBody([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { nope: true }])) as JsonRpcResponse[];
    expect(answer[0]).toMatchObject({ id: 1, result: {} });
    expect(answer[1]).toMatchObject({ id: null, error: { code: RPC.INVALID_REQUEST } });
    expect(() => parseMessages([])).toThrow(/empty batch/);
    expect(() => parseMessages(Array.from({ length: MAX_BATCH + 1 }, () => ({})))).toThrow(/at most/);
  });
});

describe('arguments', () => {
  it('refuses a malformed address or amount before reading anything', async () => {
    const { mcp, calls } = server();
    expect(errorOf(await call(mcp, 'pons_token', { token: 'FWFxnxR1Esvv6Ebcntr357ri1mucV5FiKTG1kEiBpump' })).code).toBe('INVALID_ARGUMENTS');
    expect(errorOf(await call(mcp, 'pons_quote', { token: TOKEN, side: 'buy', amountIn: '0' })).code).toBe('INVALID_ARGUMENTS');
    expect(errorOf(await call(mcp, 'pons_quote', { token: TOKEN, side: 'buy', amountIn: '1', privateKey: 'x' })).message).toContain('unknown name');
    expect(calls).toEqual([]);
    const schema = TOOLS.find((t) => t.name === 'pons_quote')!.input;
    expect(() => checkArguments(schema, { token: TOKEN, side: 'hold', amountIn: '1' })).toThrow(InvalidArguments);
    // A uint256-sized amount is accepted.
    expect(checkArguments(schema, { token: TOKEN, side: 'buy', amountIn: '9'.repeat(77) })).toMatchObject({ side: 'buy' });
  });
});

describe('tools', () => {
  it('reads a Pons token with its paired asset and progress', async () => {
    const result = await call(server().mcp, 'pons_token', { token: TOKEN });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      token: TOKEN,
      symbol: 'HYLIT',
      decimals: 18,
      totalSupply: (1_000_000_000n * E18).toString(),
      curve: CURVE_ADDRESS,
      pairedWith: { address: ZERO_ADDRESS, native: true, symbol: 'ETH', decimals: 18 },
      graduationThreshold: (42n * E18 / 10n).toString(),
      progressPct: 47.61,
      feeBps: '100',
      creatorTaxBps: '200',
      graduated: false,
    });
    expect(result.structuredContent!['spotPriceInPairedAsset']).toBeCloseTo(7.5e-9, 15);
    expect(errorOf(await call(server().mcp, 'pons_token', { token: USDG })).code).toBe('NOT_A_PONS_TOKEN');
  });

  it('quotes a buy exactly as the curve maths does, and refuses a graduated curve with its code', async () => {
    const result = await call(server().mcp, 'pons_quote', { token: TOKEN, side: 'buy', amountIn: (E18 / 100n).toString(), slippageBps: 100 });
    const m = buyMaths({ quoteReserve: 3n * E18, tokenReserve: 400_000_000n * E18, sellableTokens: 160_000_000n * E18, feeBps: 100n, creatorTaxBps: 200n, graduated: false }, E18 / 100n);
    expect(result.structuredContent).toMatchObject({ side: 'buy', amountOut: m.tokensOut.toString(), minAmountOut: withSlippage(m.tokensOut, 100).toString(), fee: m.fee.toString(), creatorTax: m.creatorTax.toString(), snipeTax: '0', refund: '0', pairedWith: { symbol: 'ETH' } });
    expect(errorOf(await call(server({ graduated: true }).mcp, 'pons_quote', { token: TOKEN, side: 'buy', amountIn: '1000' })).code).toBe('GRADUATED');
    expect(errorOf(await call(server().mcp, 'pons_quote', { token: USDG, side: 'sell', amountIn: '1000' })).code).toBe('NOT_A_PONS_TOKEN');
  });

  it('lists a token\'s recent trades newest first, marking a snipe-taxed buy', async () => {
    const { mcp } = server();
    const result = await call(mcp, 'pons_trades', { token: TOKEN, blocks: 5_000 });
    expect(result.structuredContent).toMatchObject({ curve: CURVE_ADDRESS, fromBlock: 5_001, toBlock: 10_000, count: 2 });
    const trades = result.structuredContent!['trades'] as { side: string; snipeTaxed: boolean; block: number; quoteAmount: string }[];
    expect(trades.map((t) => `${t.side}@${t.block}`)).toEqual(['sell@9500', 'buy@9000']);
    // The buy's tax is a fifth of what it paid: its price is not representative.
    expect(trades[1]).toMatchObject({ snipeTaxed: true, quoteAmount: (E18 / 100n).toString() });
    expect(trades[0]!.snipeTaxed).toBe(false);
  });

  it('lists recent launches with names, and reads any token', async () => {
    const { mcp } = server();
    const launches = await call(mcp, 'pons_launches', { limit: 5 });
    expect(launches.structuredContent).toMatchObject({ count: 1, launches: [{ token: TOKEN, curve: CURVE_ADDRESS, deployer: DEPLOYER, pairedWithNative: true, symbol: 'HYLIT', block: 8_000 }] });
    const usdg = await call(mcp, 'token_info', { token: USDG });
    expect(usdg.structuredContent).toEqual({ address: USDG, name: 'Global Dollar', symbol: 'USDG', decimals: 6, totalSupply: (10n ** 15n).toString(), launchedOnPons: false, ponsCurve: null });
    expect((await call(mcp, 'token_info', { token: TOKEN })).structuredContent).toMatchObject({ launchedOnPons: true, ponsCurve: CURVE_ADDRESS });
  });

  it('caps how far back one call reads', async () => {
    const asked: { fromBlock: string; toBlock: string }[] = [];
    const { mcp } = server({ intercept: (method, params) => {
      if (method === 'eth_blockNumber') return '0x10000000';
      if (method === 'eth_getLogs') asked.push(params[0] as never);
      return undefined;
    } });
    await call(mcp, 'pons_launches', { blocks: 400_000 });
    const first = Number(BigInt(asked[0]!.fromBlock));
    expect(0x10000000 - first + 1).toBe(400_000);
  });

  it('serves the feed tools from the feed', async () => {
    const result = await call(server({ feed: true }).mcp, 'latest_launches', { limit: 1 });
    expect(result.structuredContent).toEqual({ tokens: [{ address: TOKEN, symbol: 'HYLIT', price: null }] });
  });

  it('says the endpoint is down rather than inventing an answer', async () => {
    const { mcp } = server({ intercept: () => { throw new EvmRpcUnavailable('eth_call', 'HTTP 429'); } });
    expect(errorOf(await call(mcp, 'pons_token', { token: TOKEN })).code).toBe('RPC_UNAVAILABLE');
  });

  it('holds calls past the concurrency limit in a queue, and refuses only past the queue', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let gated = true;
    const { mcp } = server({
      maxConcurrentCalls: 1,
      maxWaitingCalls: 1,
      intercept: async (method) => {
        if (gated && method === 'eth_call') await gate;
        return undefined;
      },
    });
    const first = call(mcp, 'token_info', { token: USDG });
    const second = call(mcp, 'token_info', { token: USDG });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errorOf(await call(mcp, 'token_info', { token: USDG })).code).toBe('BUSY');
    gated = false;
    release();
    expect((await first).isError).toBeUndefined();
    expect((await second).isError).toBeUndefined();
    // With the queue empty again, calls run.
    expect((await call(mcp, 'token_info', { token: USDG })).isError).toBeUndefined();
  });
});

describe('transports', () => {
  it('answers over HTTP: POST only, 202 for notifications, 429 when the host says so', async () => {
    const { mcp } = server();
    const post = (body: string): Request => new Request('http://localhost/mcp', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
    expect((await mcp.handleHttp(new Request('http://localhost/mcp'))).status).toBe(405);
    const ok = await mcp.handleHttp(post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { result: { tools: unknown[] } }).result.tools).toHaveLength(5);
    expect((await mcp.handleHttp(post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })))).status).toBe(202);
    expect((await mcp.handleHttp(post('{not json'))).status).toBe(400);
    const limited = await mcp.handleHttp(post('{}'), { limit: () => 4 });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('4');
  });

  it('answers over stdio, one line per message, and survives a line that is not JSON', async () => {
    const { mcp } = server();
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    const done = serveStdio(mcp, input, output);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    input.write('garbage\n');
    input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'token_info', arguments: { token: USDG } } })}\n`);
    await done;
    const lines = chunks.join('').trim().split('\n').map((line) => JSON.parse(line) as JsonRpcResponse);
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.id === null)!.error).toMatchObject({ code: RPC.PARSE_ERROR });
    expect((lines.find((l) => l.id === 2)!.result as Result).structuredContent).toMatchObject({ symbol: 'USDG' });
  });
});
