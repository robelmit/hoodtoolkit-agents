/**
 * `hoodtoolkit-mcp`: the server over stdio, as a desktop agent starts it.
 *
 *   HOOD_RPC_URL     the Robinhood Chain endpoint the tools read (default: the public one, which rate-limits)
 *   REDIS_URL        optional: the launch feed's Redis; adds latest_launches and trending_tokens
 *   FEED_STREAM_KEY  optional: the feed's stream (default stream:market:robinhood)
 *
 * Standard output carries protocol messages only; everything else goes to standard error.
 */

import { DEFAULT_STREAM_KEY, FeedState, readRedisStream } from '@hood-toolkit/bot-core';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_PUBLIC_RPC, chainId, createEvmRpc } from '@hood-toolkit/evm';
import { createMcpServer, serveStdio } from './server';

const say = (message: string): void => void process.stderr.write(`hoodtoolkit-mcp: ${message}\n`);

async function main(): Promise<void> {
  const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;
  const rpcUrl = env('HOOD_RPC_URL') ?? ROBINHOOD_PUBLIC_RPC;
  if (!/^https?:\/\//.test(rpcUrl)) throw new Error('HOOD_RPC_URL must start with http:// or https://');
  const id = await chainId(createEvmRpc({ url: rpcUrl }));
  if (id !== ROBINHOOD_CHAIN_ID) throw new Error(`HOOD_RPC_URL serves chain ${id}, not Robinhood Chain (${ROBINHOOD_CHAIN_ID})`);

  const stop = new AbortController();
  let feed: FeedState | null = null;
  const redisUrl = env('REDIS_URL');
  if (redisUrl) {
    if (!/^rediss?:\/\//.test(redisUrl)) throw new Error('REDIS_URL must start with redis:// or rediss://');
    let Redis: new (url: string, options: { maxRetriesPerRequest: null }) => { on(event: 'error', listener: (error: Error) => void): unknown; disconnect(): void };
    try {
      // Only needed for the feed tools, so it is not a hard dependency of the package.
      const name = 'ioredis';
      ({ Redis } = (await import(name)) as { Redis: typeof Redis });
    } catch {
      throw new Error('REDIS_URL is set, and reading the feed needs the "ioredis" package: npm i ioredis');
    }
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    redis.on('error', (error) => say(`redis: ${error.message}`));
    stop.signal.addEventListener('abort', () => redis.disconnect(), { once: true });
    const state = new FeedState();
    feed = state;
    void readRedisStream(redis as unknown as Parameters<typeof readRedisStream>[0], (event) => state.apply(event), stop.signal, { key: env('FEED_STREAM_KEY') ?? DEFAULT_STREAM_KEY });
  }

  const server = createMcpServer({ rpcUrl, feed });
  say(`serving ${server.tools.length} read-only tools over stdio`);
  await serveStdio(server, process.stdin, process.stdout);
  stop.abort();
}

main().catch((error: unknown) => {
  say(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
