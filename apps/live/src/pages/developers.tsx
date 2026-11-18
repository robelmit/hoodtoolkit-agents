import { CheckIcon, CodeIcon, CopyIcon, PackageIcon, RobotIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Failed, Loading } from '@/components/bits';
import { Panel, PillTabs, Table, Tag } from '@/components/kit';
import { api, useLoad } from '@/lib/api';

function Code({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="relative rounded-2xl border border-border bg-background">
      <button type="button" aria-label="Copy code" onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
        {copied ? <CheckIcon weight="bold" className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
      </button>
      <pre className="overflow-x-auto p-4 pr-12 font-mono text-[12px] leading-relaxed text-foreground/90">{code}</pre>
    </div>
  );
}

const PACKAGES = [
  ['@hood-toolkit/pons', 'Decode Pons launches and trades, read a curve, quote exactly, build and verify the unsigned transaction'],
  ['@hood-toolkit/evm', 'A small JSON-RPC client for Robinhood Chain with log ranges the public endpoint serves'],
  ['@hood-toolkit/feed', 'Every launch, curve trade and graduation as one stream, to standard output or Redis'],
  ['@hood-toolkit/bot-core', 'Token cards, trending and a buy bot for Telegram and Discord'],
  ['@hood-toolkit/mcp', 'A read-only MCP server for AI agents, over stdio or HTTP'],
] as const;

const SNIPPETS = {
  sdk: `npm install @hood-toolkit/pons @hood-toolkit/evm

import { createEvmRpc } from '@hood-toolkit/evm';
import { quote } from '@hood-toolkit/pons';

const rpc = createEvmRpc({ url: process.env.HOOD_RPC_URL });
const buy = await quote(rpc, {
  side: 'buy',
  token: '0x…token',
  amountIn: 10_000_000_000_000_000n, // 0.01 ETH in wei
  slippageBps: 300,
  wallet: '0x…your-wallet',
});`,
  mcp: `{
  "mcpServers": {
    "hoodtoolkit": {
      "command": "npx",
      "args": ["-y", "@hood-toolkit/mcp"],
      "env": { "HOOD_RPC_URL": "https://your-robinhood-chain-endpoint" }
    }
  }
}`,
  curl: `curl https://your-host/v1/pons-launches?limit=5
curl https://your-host/v1/pons/0x…token
curl "https://your-host/v1/pons/0x…token/quote?side=buy&amountIn=10000000000000000"`,
} as const;

export function DevelopersPage() {
  const { data, error, reload } = useLoad(() => api.index(), 'index');
  const [tab, setTab] = useState<keyof typeof SNIPPETS>('sdk');
  return (
    <div className="flex flex-col gap-6">
      <Panel title="The API behind this site" description="Read-only routes over the same tools, with a budget per caller. Run it yourself with one RPC endpoint." icon={<CodeIcon weight="duotone" />} flush>
        {error && !data ? (
          <Failed error={error} onRetry={reload} />
        ) : !data ? (
          <Loading>Asking the API for its routes…</Loading>
        ) : (
          <Table head={[{ label: 'Route' }, { label: 'What' }, { label: 'Cost', align: 'right' }]}>
            {data.routes.map((r) => (
              <tr key={`${r.method} ${r.path}`}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="mr-2 inline-flex h-5 items-center rounded-md bg-momentum-bg px-1.5 font-mono text-[11px] font-medium text-momentum">{r.method}</span>
                  <span className="font-mono text-[12.5px]">{r.path}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.summary}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.cost}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Use it" description="From your code, an AI agent, or the command line." icon={<RobotIcon weight="duotone" />}>
          <div className="flex flex-col gap-3">
            <PillTabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'sdk', label: 'SDK' },
                { value: 'mcp', label: 'MCP' },
                { value: 'curl', label: 'curl' },
              ]}
              className="self-start"
            />
            <Code code={SNIPPETS[tab]} />
          </div>
        </Panel>
        <Panel title="Packages" description="MIT licensed, on npm under @hood-toolkit." icon={<PackageIcon weight="duotone" />} flush>
          <ul className="divide-y divide-border/70">
            {PACKAGES.map(([name, what]) => (
              <li key={name} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <a href={`https://www.npmjs.com/package/${name}`} target="_blank" rel="noreferrer" className="font-mono text-[12.5px] font-medium hover:text-primary">
                    {name}
                  </a>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{what}</p>
                </div>
                <Tag>MIT</Tag>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
