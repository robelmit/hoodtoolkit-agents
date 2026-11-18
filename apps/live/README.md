# hoodtoolkit Live

The toolkit working on Robinhood Chain, in a browser:

- **Launches**: every Pons launch from the factory, newest first, with what it is paired with and where it graduates.
- **Token check**: a Pons token's bonding curve, progress, spot price, amount raised, fee and creator tax, an exact quote for a buy or a sell, and its recent trades.
- **Developers**: the API routes behind the site, the MCP server for AI agents, and the packages on npm.

It is a static site. Every number comes from the [demo API](../demo-api), which reads the chain with the open-source `@hood-toolkit` packages. It holds no key, connects no wallet and sends nothing.

## Run it

```
pnpm --filter @hood-toolkit/demo-api start      # the API, on 127.0.0.1:8787
pnpm --filter @hood-toolkit/live dev            # the site, proxied to that API
```

`DEMO_API` points the development server at another API. For a build served apart from the API, set `VITE_API_URL` before `pnpm --filter @hood-toolkit/live build`; without it the site calls its own origin, for the API and the site served together.

## Built with

Vite, React 19, Tailwind 4, shadcn components with Phosphor icons, and DM Sans: the same look as soltoolkit Live and soltoolkit pay. Dark only.

## Tests

```
pnpm --filter @hood-toolkit/live test
```

Unit amounts, base-unit conversion, prices, labels and routes. The site was also run against the public Robinhood Chain endpoint: the launch list, a token page with its quote, and its trades.

## Licence

MIT
