# @hoodtoolkit/mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for Robinhood Chain launchpad tokens. An AI agent can ask it to read a Pons token and its bonding curve, quote a trade on it, list its recent trades, list recent launches, or read any token.

It holds no key. It has no tool that signs, sends or changes anything.

## Use it from an agent

Add it to your MCP client's configuration (the file and its exact shape depend on the client):

```json
{
  "mcpServers": {
    "hoodtoolkit": {
      "command": "npx",
      "args": ["-y", "@hoodtoolkit/mcp"],
      "env": { "HOOD_RPC_URL": "https://your-rpc.example" }
    }
  }
}
```

Without `HOOD_RPC_URL` it uses Robinhood Chain's public endpoint, which rate-limits. The server checks that the endpoint serves chain 4663 before it starts.

## Tools

| Tool | What it answers |
|---|---|
| `pons_token` | A Pons token: its curve, the asset it is paired with and that asset's decimals, the graduation threshold, progress in percent, the curve's price in the paired asset, the fee and the creator tax, graduated or not |
| `pons_quote` | A buy or sell quote on the curve, in the contract's own arithmetic: output, least output at your slippage, fee, creator tax, snipe tax, refund |
| `pons_trades` | The trades on a token's curve over recent blocks, newest first, with snipe-taxed buys marked |
| `pons_launches` | Recent Pons launches from the factory, newest first, with names |
| `token_info` | What any token says about itself, and whether Pons launched it |
| `latest_launches` | The newest tokens of the [launch feed](https://github.com/robelmit/hoodtoolkit-feed/tree/main/packages/feed) |
| `trending_tokens` | The most traded tokens of the last five minutes, from the launch feed |

The last two are offered only when the server reads the launch feed: set `REDIS_URL` to the feed's Redis (and install `ioredis`).

## What an agent can rely on

- **Read the paired asset first.** Pons tokens trade against ETH, the USDG dollar coin, or tokenized stocks. An amount is meaningless without the paired asset's decimals, and every tool that returns one says which asset it is in.
- **Unknown is null, never zero.**
- **Amounts are strings** of whole base units, so no digit is lost in JSON.
- **A tool that cannot do the thing says why**, with `isError: true` and a code: `NOT_A_PONS_TOKEN`, `GRADUATED`, `ROUNDS_TO_ZERO`, `RPC_UNAVAILABLE`, and so on.
- **Arguments are checked against the published schema.** Unknown names are refused.
- **Every tool is annotated read-only.**

## Over HTTP

`createMcpServer(options).handleHttp(request)` takes a web-standard `Request` and returns a `Response` (Streamable HTTP, stateless, JSON answers). It has no authentication of its own; use its `limit` hook or put it behind your own. The [demo API](../../apps/demo-api) serves it at `/mcp` with a budget per client.

## Bounds

| Bound | Default | Option |
|---|---|---|
| Tool calls running at once | 4 | `maxConcurrentCalls` |
| Calls held waiting for a slot; past that, `BUSY` | 16 | `maxWaitingCalls` |
| Blocks one call reads logs over | 400,000 (about eleven hours) | `limits.maxBlocks` |
| Trades returned by `pons_trades` | 100 | — |
| Launches returned by `pons_launches` | 50 | — |

## What it does not do

- No trading tools. `pons_quote` quotes; building a transaction for an agent's own wallet is a separate piece of work (the [Pons SDK](https://github.com/robelmit/hoodtoolkit-sdk/tree/main/packages/pons) can build and verify one).
- After a token graduates it trades in a Uniswap v4 pool, which these tools do not quote.
- No holder maps or safety scores yet.

## Tests

```
pnpm --filter @hoodtoolkit/mcp test
```

15 tests cover the protocol, the argument checks, each tool against a faked chain, the call queue, and both transports. The server was also run over stdio against the public Robinhood Chain endpoint, and every tool answered on live data.

## Licence

MIT
