# hoodtoolkit-agents

Robinhood Chain launchpad data for AI agents and for apps, from the team behind the Hexa trading terminal: a read-only MCP server and a small rate-limited HTTP API over the same tools.

| Piece | What it does |
|---|---|
| [`@hoodtoolkit/mcp`](packages/mcp) | A Model Context Protocol server over stdio or HTTP: read a Pons token, quote on its curve, list its trades and recent launches, read any token. No key, and no tool that signs or sends |
| [demo-api](apps/demo-api) | The same tools as plain HTTP routes, with a budget per client and a short cache in front of the RPC endpoint |

## Principles

- **Nothing here signs, sends or holds a key.**
- **Unknown is never zero.** A value that could not be read stays `null`.
- **Read, never assume.** Pons sets the graduation threshold and the paired asset per launch, and pairs tokens with ETH, a 6-decimal dollar coin, or tokenized stocks.
- **No API key needed.** Everything runs against a Robinhood Chain RPC endpoint you choose.

## Develop

Node 22.13 or newer and pnpm to work on the repository; the published packages run on Node 20 or newer.

This repository uses packages of [hoodtoolkit-sdk](https://github.com/robelmit/hoodtoolkit-sdk) and [hoodtoolkit-bots](https://github.com/robelmit/hoodtoolkit-bots). Until those are on npm, clone them beside this one and run `pnpm install && pnpm build` there first; `.pnpmfile.cjs` then links the local copies.

```bash
pnpm install
pnpm check        # build, typecheck, test, lint
```

## The hoodtoolkit family

| Repository | What it holds |
|---|---|
| [hoodtoolkit-sdk](https://github.com/robelmit/hoodtoolkit-sdk) | The Pons SDK and the shared EVM client |
| [hoodtoolkit-feed](https://github.com/robelmit/hoodtoolkit-feed) | The launch feed: launches, curve trades and graduations as a stream of events |
| [hoodtoolkit-bots](https://github.com/robelmit/hoodtoolkit-bots) | Telegram and Discord community bots |
| **hoodtoolkit-agents** (this one) | A read-only MCP server for AI agents, and an HTTP API |

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Licence

[MIT](LICENSE)
