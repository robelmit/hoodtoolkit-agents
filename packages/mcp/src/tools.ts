/**
 * The tools. Every one of them reads; none signs, sends or moves anything.
 *
 * Each is a thin call into a hoodtoolkit package, with bounds set here so one
 * call cannot run up an unbounded number of RPC reads: a block range is
 * capped, and a list is capped.
 */

import { FILTERED_LOG_SPAN, ZERO_ADDRESS, blockNumber, getLogs, readErc20, type EvmRpc } from '@hood-toolkit/evm';
import {
  NotAPonsToken,
  PONS_FACTORY,
  PONS_TOPICS,
  PonsQuoteError,
  decodeLaunch,
  decodeTrade,
  findLaunch,
  isSnipeTaxed,
  progressPct,
  quote,
  readCurve,
  spotPrice,
} from '@hood-toolkit/pons';
import { ADDRESS_PATTERN, UNITS_PATTERN, type ObjectSchema } from './schema';

/** Tokens from a launch feed, when the server was given one. `FeedState` of `@hood-toolkit/bot-core` fits. */
export interface LaunchSource {
  latest(limit: number): Promise<readonly unknown[]>;
  trending(limit: number): Promise<readonly unknown[]>;
}

export interface ToolContext {
  readonly rpc: EvmRpc;
  readonly feed: LaunchSource | null;
  readonly limits: ToolLimits;
}

export interface ToolLimits {
  /** The most blocks one call reads logs over. Robinhood Chain makes about ten a second. */
  readonly maxBlocks: number;
}

export const DEFAULT_TOOL_LIMITS: ToolLimits = Object.freeze({ maxBlocks: 400_000 });

/** A tool could not do the thing, for a reason the caller can act on. Returned as a tool error, not a protocol error. */
export class ToolFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ToolFailure';
  }
}

export interface Tool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: ObjectSchema;
  /** Listed only when the server has a launch feed. */
  readonly needsFeed?: boolean;
  run(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}

const TOKEN = { type: 'string', description: 'The token contract address (0x and forty hex digits).', pattern: ADDRESS_PATTERN } as const;
/** The address a quote is computed for when the caller names no wallet. A quote does not depend on it. */
const NO_WALLET = '0x000000000000000000000000000000000000dead';

const object = (properties: ObjectSchema['properties'], required: readonly string[] = []): ObjectSchema => ({ type: 'object', properties, required, additionalProperties: false });

/** A Pons token's curve, or a tool failure saying why there is none. */
async function curveOf(rpc: EvmRpc, token: string): Promise<string> {
  const launch = await findLaunch(rpc, token);
  if (!launch) throw new ToolFailure('NOT_A_PONS_TOKEN', 'The Pons factory did not launch this token.');
  return launch.curve;
}

/** The newest blocks to read, capped. */
async function range(rpc: EvmRpc, asked: unknown, fallback: number, limits: ToolLimits): Promise<{ from: number; to: number; blocks: number }> {
  const head = await blockNumber(rpc);
  const blocks = Math.min(typeof asked === 'number' ? asked : fallback, limits.maxBlocks);
  return { from: Math.max(0, head - blocks + 1), to: head, blocks };
}

export const TOOLS: readonly Tool[] = [
  {
    name: 'pons_token',
    title: 'Read a Pons token',
    description:
      'Reads a token launched on Pons, the launchpad on Robinhood Chain: its curve contract, the asset it is paired with (ETH, the USDG dollar coin, or a tokenized stock) with that asset\'s decimals, the graduation threshold, progress toward graduation in percent, the curve\'s spot price in the paired asset, the curve fee and the creator tax in basis points, and whether it has graduated. Amounts are whole numbers of base units as strings.',
    input: object({ token: TOKEN }, ['token']),
    async run(args, { rpc }) {
      const curve = await readCurve(rpc, await curveOf(rpc, args.token as string));
      const facts = await readErc20(rpc, curve.token);
      return {
        token: curve.token,
        name: facts.name,
        symbol: facts.symbol,
        decimals: curve.tokenDecimals,
        totalSupply: facts.totalSupply,
        curve: curve.curve,
        pairedWith: { address: curve.pairToken, native: curve.native, symbol: curve.pairSymbol, decimals: curve.pairDecimals },
        graduationThreshold: curve.graduationThreshold,
        realQuoteReserve: curve.realQuoteReserve,
        progressPct: progressPct(curve.realQuoteReserve, curve.graduationThreshold),
        spotPriceInPairedAsset: curve.pairDecimals === null ? null : spotPrice(curve, curve.pairDecimals, curve.tokenDecimals),
        sellableTokens: curve.sellableTokens,
        feeBps: curve.feeBps,
        creatorTaxBps: curve.creatorTaxBps,
        graduated: curve.graduated,
        readyToGraduate: curve.readyToGraduate,
      };
    },
  },
  {
    name: 'pons_quote',
    title: 'Quote a Pons trade',
    description:
      'Quotes a buy or a sell of a Pons token on its bonding curve, in the contract\'s own integer arithmetic. amountIn is a whole number of base units as a string: of the paired asset for a buy (wei for ETH, 6-decimal units for USDG), of the token for a sell. Returns the expected output, the least output at the given slippage, the curve fee, the creator tax and any snipe tax (buys in the first seconds after a launch), and a refund when the curve has less left than the buy would take. It only quotes: nothing is built, signed or sent.',
    input: object(
      {
        token: TOKEN,
        side: { type: 'string', description: 'buy (the paired asset in) or sell (tokens in).', enum: ['buy', 'sell'] },
        amountIn: { type: 'string', description: 'Base units of what goes in.', pattern: UNITS_PATTERN },
        slippageBps: { type: 'integer', description: 'Slippage tolerance in basis points (100 = 1 %). Default 300.', minimum: 0, maximum: 5000 },
        wallet: { type: 'string', description: 'The wallet the trade is for. A buy\'s snipe tax depends on it; optional otherwise.', pattern: ADDRESS_PATTERN },
      },
      ['token', 'side', 'amountIn'],
    ),
    async run(args, { rpc }) {
      try {
        const q = await quote(rpc, { side: args.side as 'buy' | 'sell', token: args.token as string, amountIn: BigInt(args.amountIn as string), slippageBps: (args.slippageBps as number | undefined) ?? 300, wallet: (args.wallet as string | undefined) ?? NO_WALLET });
        return {
          side: q.side,
          token: q.token,
          curve: q.curve,
          pairedWith: { address: q.pairToken, native: q.native, symbol: q.state.pairSymbol, decimals: q.state.pairDecimals },
          amountIn: q.amountIn,
          amountOut: q.amountOut,
          minAmountOut: q.minAmountOut,
          slippageBps: q.slippageBps,
          fee: q.fee,
          creatorTax: q.creatorTax,
          snipeTax: q.snipeTax,
          refund: q.refund,
          units: q.side === 'buy' ? { in: 'paired asset base units', out: 'token base units (18 decimals)' } : { in: 'token base units (18 decimals)', out: 'paired asset base units' },
        };
      } catch (error) {
        if (error instanceof NotAPonsToken) throw new ToolFailure('NOT_A_PONS_TOKEN', 'The Pons factory did not launch this token.');
        if (error instanceof PonsQuoteError) throw new ToolFailure(error.code, error.message);
        throw error;
      }
    },
  },
  {
    name: 'pons_trades',
    title: 'Recent trades of a Pons token',
    description:
      'The trades on a Pons token\'s bonding curve over the most recent blocks (default 20,000, about half an hour), newest first, at most 100. Each has the side, the trader, the paired-asset and token amounts in base units, the fee, the tax, the block and the transaction, and whether it was a snipe-taxed buy (a buy in the first seconds after launch whose price is not representative).',
    input: object({ token: TOKEN, blocks: { type: 'integer', description: 'How many recent blocks to read. Default 20,000.', minimum: 1, maximum: 400_000 } }, ['token']),
    async run(args, { rpc, limits }) {
      const curve = await curveOf(rpc, args.token as string);
      const span = await range(rpc, args.blocks, 20_000, limits);
      const logs = await getLogs(rpc, { address: curve, topics: [[PONS_TOPICS.curveBuy, PONS_TOPICS.curveSell]] }, span.from, span.to, FILTERED_LOG_SPAN);
      const trades = logs
        .map((log) => {
          const trade = decodeTrade(log);
          return trade ? { ...trade, snipeTaxed: trade.side === 'buy' && isSnipeTaxed(trade), block: log.blockNumber, tx: log.transactionHash } : null;
        })
        .filter((t) => t !== null)
        .reverse();
      return { token: (args.token as string).toLowerCase(), curve, fromBlock: span.from, toBlock: span.to, count: trades.length, trades: trades.slice(0, 100) };
    },
  },
  {
    name: 'pons_launches',
    title: 'Recent Pons launches',
    description:
      'Tokens launched on Pons over the most recent blocks (default 50,000, about an hour and a half), newest first, read from the Pons factory. Each has the token, its curve, the deployer, the paired asset, the graduation threshold in that asset\'s base units, the block and the transaction; the newest ones also have their name and symbol.',
    input: object({ blocks: { type: 'integer', description: 'How many recent blocks to read. Default 50,000.', minimum: 1, maximum: 400_000 }, limit: { type: 'integer', description: 'How many, at most. Default 10.', minimum: 1, maximum: 50 } }),
    async run(args, { rpc, limits }) {
      const span = await range(rpc, args.blocks, 50_000, limits);
      const logs = await getLogs(rpc, { address: PONS_FACTORY, topics: [PONS_TOPICS.tokenLaunched] }, span.from, span.to, FILTERED_LOG_SPAN);
      const launches = logs
        .map((log) => {
          const launch = decodeLaunch(log);
          return launch ? { ...launch, pairedWithNative: launch.pairToken === ZERO_ADDRESS, block: log.blockNumber, tx: log.transactionHash } : null;
        })
        .filter((l) => l !== null)
        .reverse()
        .slice(0, (args.limit as number | undefined) ?? 10);
      const named = await Promise.all(launches.map(async (launch) => {
        const facts = await readErc20(rpc, launch.token);
        return { ...launch, name: facts.name, symbol: facts.symbol };
      }));
      return { fromBlock: span.from, toBlock: span.to, count: named.length, launches: named };
    },
  },
  {
    name: 'token_info',
    title: 'Read any token',
    description: 'What any ERC-20 on Robinhood Chain says about itself: name, symbol, decimals and total supply (null for anything it does not answer), and whether Pons launched it.',
    input: object({ token: TOKEN }, ['token']),
    async run(args, { rpc }) {
      const facts = await readErc20(rpc, args.token as string);
      const launch = await findLaunch(rpc, args.token as string);
      return { ...facts, launchedOnPons: launch !== null, ponsCurve: launch?.curve ?? null };
    },
  },
  {
    name: 'latest_launches',
    title: 'The newest tokens from the feed',
    description: 'The newest tokens the launch feed has listed since this server started, newest first, with stage, curve progress, price and market cap in US dollars. Figures the feed does not know are null.',
    input: object({ limit: { type: 'integer', description: 'How many, at most. Default 10.', minimum: 1, maximum: 50 } }),
    needsFeed: true,
    async run(args, { feed }) {
      if (!feed) throw new ToolFailure('NO_FEED', 'This server has no launch feed.');
      return { tokens: await feed.latest((args.limit as number | undefined) ?? 10) };
    },
  },
  {
    name: 'trending_tokens',
    title: 'The most traded tokens',
    description: 'The launchpad tokens with the highest dollar volume over the last five minutes, as seen by the launch feed. Tokens whose trades have no dollar value are left out, not counted as zero.',
    input: object({ limit: { type: 'integer', description: 'How many, at most. Default 10.', minimum: 1, maximum: 50 } }),
    needsFeed: true,
    async run(args, { feed }) {
      if (!feed) throw new ToolFailure('NO_FEED', 'This server has no launch feed.');
      return { tokens: await feed.trending((args.limit as number | undefined) ?? 10) };
    },
  },
];
