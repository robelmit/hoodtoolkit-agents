# Demo API

A small, read-only HTTP API for Robinhood Chain launchpad tokens, with a budget per client. It is the free public endpoint of the project, and it is everything you need to run the same API yourself.

It reads the chain through one RPC endpoint. It holds no key, signs nothing, and stores nothing about a caller.

## Run it

```
pnpm --filter @hoodtoolkit/demo-api start
curl http://127.0.0.1:8787/
```

`GET /` lists the routes. Without `HOOD_RPC_URL` it reads the chain's public endpoint, which rate-limits.

## Routes

Every answer is JSON: `{ "data": … }` or `{ "error": { "code", "message" } }`.

| Route | Cost | What |
|---|---|---|
| `GET /v1/pons/{token}` | 1 | A Pons token: curve, paired asset and its decimals, progress, price in the paired asset, fee, creator tax |
| `GET /v1/pons/{token}/quote?side=buy\|sell&amountIn=&slippageBps=&wallet=` | 1 | A quote on the curve. `amountIn` is base units: of the paired asset for a buy, of the token for a sell |
| `GET /v1/pons/{token}/trades?blocks=` | 2 | Recent trades on the curve, newest first |
| `GET /v1/pons-launches?blocks=&limit=` | 3 | Recent Pons launches, newest first |
| `GET /v1/tokens/{token}` | 1 | What any token says about itself, and whether Pons launched it |
| `GET /v1/launches?limit=` | 1 | The newest tokens (with the launch feed) |
| `GET /v1/trending?limit=` | 1 | The most traded tokens of the last five minutes (with the launch feed) |
| `POST /mcp` | 2 | The same tools over the Model Context Protocol |
| `GET /health` | — | `{ "ok": true, "feed": … }` |

Each route is one tool of [`@hoodtoolkit/mcp`](../../packages/mcp); the arguments and the answers are the same.

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_ARGUMENTS`, `BAD_AMOUNT` | The message says which argument and why |
| 404 | `NOT_A_PONS_TOKEN`, `NO_ROUTE` | Pons did not launch that token, or there is no such route |
| 409 | `GRADUATED` | The token left its curve and trades in its pool now |
| 422 | `ROUNDS_TO_ZERO`, `FEES_CONSUME_TRADE` | The amount is too small to trade |
| 429 | `RATE_LIMITED` | Over the budget; `Retry-After` says how many seconds |
| 502 | `RPC_ERROR`, `BAD_STATE` | The endpoint answered with an error, or the curve reported something it should not |
| 503 | `BUSY`, `RPC_UNAVAILABLE` | Too many reads running, or the endpoint is not answering |
| 500 | `FAILED` | Anything else. The message is general on purpose |

## Budget

A client gets `RATE_PER_MINUTE` points a minute (30 by default), refilled evenly; each route costs the points in the table. Answers are reused for a few seconds (a minute for a token's own facts), so the same question is not read from the chain twice in a row. At most `MAX_CONCURRENT` reads run at once; past that the answer is 503, not a queue.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `HOOD_RPC_URL` | The public endpoint | Your Robinhood Chain endpoint. The API checks it serves chain 4663 |
| `PORT`, `HOST` | `8787`, `127.0.0.1` | Where it listens. Set `HOST=0.0.0.0` to listen on every interface |
| `RATE_PER_MINUTE` | `30` | Points per client per minute |
| `MAX_CONCURRENT` | `4` | Reads running at once |
| `RPC_PER_SECOND` | `10` | Calls a second to the endpoint; `0` turns pacing off |
| `TRUST_PROXY` | unset | `1` when exactly one reverse proxy of yours is in front: clients are counted by the address it appended to `X-Forwarded-For`. Without a proxy leave it unset, or a caller could name any address and escape the budget |
| `REDIS_URL`, `FEED_STREAM_KEY` | — | The launch feed's Redis; adds `/v1/launches` and `/v1/trending` |

## Limits

- The budget and the cache are in memory: one process, and a restart forgets both.
- A client is an IP address. Callers behind one address share a budget.
- No API keys. For a paid or private service, put your own authentication in front.

## Tests

```
pnpm --filter @hoodtoolkit/demo-api test
```

13 tests call the app as a function from `Request` to `Response` against a faked chain. The server was also started locally against the public Robinhood Chain endpoint and called with curl: launches, a token, a sell quote, a token Pons did not launch, and the MCP endpoint.

## Licence

MIT
