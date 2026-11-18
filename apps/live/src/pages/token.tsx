import { ArrowsLeftRightIcon, ChartLineUpIcon, CoinsIcon, GaugeIcon, PercentIcon, ReceiptIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { useState } from 'react';
import { Address, Empty, Failed, Loading, TokenSearch } from '@/components/bits';
import { Panel, PillTabs, Stat, Surface, Table, Tag } from '@/components/kit';
import { ApiError, api, useLoad, type PonsToken } from '@/lib/api';
import { bps, compactUnits, explorer, formatUnits, price } from '@/lib/format';

/** A decimal amount to base units: `toBase('0.01', 18)` is `10000000000000000`. */
export function toBase(amount: string, decimals: number): string {
  const [whole = '0', fraction = ''] = amount.split('.');
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}

const BUY = ['0.001', '0.01', '0.1'] as const;
const SELL = ['1000000', '10000000', '100000000'] as const;

function QuotePanel({ token }: { token: PonsToken }) {
  const pair = token.pairedWith;
  const pairDecimals = pair.decimals;
  const pairSymbol = pair.symbol ?? 'paired asset';
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [pick, setPick] = useState(1);
  const amount = side === 'buy' ? BUY[pick]! : SELL[pick]!;
  const ready = !token.graduated && pairDecimals !== null;
  const amountIn = ready ? toBase(amount, side === 'buy' ? pairDecimals : token.decimals) : null;
  const { data, error, loading } = useLoad(amountIn ? () => api.quote(token.token, side, amountIn) : null, `${token.token}:${side}:${amountIn}`);
  const outDecimals = side === 'buy' ? token.decimals : (pairDecimals ?? 18);
  const outSymbol = side === 'buy' ? (token.symbol ?? 'tokens') : pairSymbol;
  const feeDecimals = pairDecimals ?? 18;

  return (
    <Panel title="Quote a trade" description="Exactly what the curve pays, after its fee and the creator's tax." icon={<ArrowsLeftRightIcon weight="duotone" />}>
      {token.graduated ? (
        <Empty title="This token graduated">It left its curve and trades in its pool now, so there is no curve to quote.</Empty>
      ) : pairDecimals === null ? (
        <Empty title="The paired asset did not say its decimals">Without them an amount cannot be quoted safely, so this one is left out.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <PillTabs
              value={side}
              onChange={(s) => {
                setSide(s);
                setPick(1);
              }}
              items={[
                { value: 'buy', label: 'Buy' },
                { value: 'sell', label: 'Sell' },
              ]}
            />
            <PillTabs
              value={String(pick)}
              onChange={(p) => setPick(Number(p))}
              items={(side === 'buy' ? BUY : SELL).map((a, i) => ({ value: String(i), label: side === 'buy' ? `${a} ${pairSymbol}` : compactUnits(toBase(a, token.decimals), token.decimals) }))}
              className="max-w-full overflow-x-auto"
            />
          </div>
          {error ? (
            <p className="rounded-2xl border border-border bg-background px-4 py-3 text-[13px] text-muted-foreground">{error.message}</p>
          ) : !data || loading ? (
            <Loading>Quoting on the curve…</Loading>
          ) : (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-[12.5px] font-semibold text-muted-foreground">You get</p>
              <p className="mt-1 text-[28px] leading-none font-extrabold tracking-[-0.04em] tabular-nums">
                {side === 'buy' ? compactUnits(data.amountOut, outDecimals) : formatUnits(data.amountOut, outDecimals, 6)} <span className="text-[15px] font-bold text-muted-foreground">{outSymbol}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">At least</dt>
                  <dd className="font-semibold tabular-nums">{side === 'buy' ? compactUnits(data.minAmountOut, outDecimals) : formatUnits(data.minAmountOut, outDecimals, 6)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Slippage</dt>
                  <dd className="font-semibold">{bps(data.slippageBps)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Curve fee</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatUnits(data.fee, feeDecimals, 8)} {pairSymbol}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Creator tax</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatUnits(data.creatorTax, feeDecimals, 8)} {pairSymbol}
                  </dd>
                </div>
              </dl>
              {data.snipeTax !== '0' && <p className="mt-3 text-[12.5px] text-zap">Includes a snipe tax of {formatUnits(data.snipeTax, feeDecimals, 8)} {pairSymbol}: the token launched moments ago.</p>}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function TradesPanel({ token }: { token: PonsToken }) {
  const { data, error, loading, reload } = useLoad(() => api.trades(token.token), `trades:${token.token}`);
  const pairDecimals = token.pairedWith.decimals ?? 18;
  const pairSymbol = token.pairedWith.symbol ?? '';
  return (
    <Panel title="Recent trades" description={data ? `On the curve over the last ${(data.toBlock - data.fromBlock + 1).toLocaleString('en-US')} blocks, newest first.` : 'On the curve, newest first.'} icon={<ReceiptIcon weight="duotone" />} flush>
      {error && !data ? (
        <Failed error={error} onRetry={reload} />
      ) : !data || loading ? (
        <Loading>Reading trades on the curve…</Loading>
      ) : (
        <Table
          head={[{ label: 'Side' }, { label: 'Trader' }, { label: pairSymbol || 'Paired', align: 'right' }, { label: token.symbol ?? 'Tokens', align: 'right', hideOnPhone: true }, { label: 'Block', align: 'right', hideOnPhone: true }]}
          empty={data.trades.length === 0 && <Empty title="No trades in this window">Buys and sells on the curve show up here.</Empty>}
        >
          {data.trades.map((t) => (
            <tr key={`${t.tx}:${t.trader}:${t.tokenAmount}`}>
              <td className="px-4 py-3">
                <Tag tone={t.side === 'buy' ? 'good' : 'bad'}>
                  {t.side === 'buy' ? 'Buy' : 'Sell'}
                  {t.snipeTaxed && ' · snipe'}
                </Tag>
              </td>
              <td className="px-4 py-3">
                <Address value={t.trader} link={explorer.address(t.trader)} />
              </td>
              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{formatUnits(t.quoteAmount, pairDecimals, 6)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:hidden">{compactUnits(t.tokenAmount, token.decimals)}</td>
              <td className="px-4 py-3 text-right max-sm:hidden">
                <a href={explorer.tx(t.tx)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-muted-foreground hover:text-foreground">
                  #{t.block.toLocaleString('en-US')}
                </a>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function NotPons({ address }: { address: string }) {
  const { data, error } = useLoad(() => api.info(address), `info:${address}`);
  return (
    <Surface className="p-6">
      {error ? (
        <Failed error={error} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[18px] font-extrabold tracking-tight">
            {data.name ?? 'This token'} {data.symbol && <span className="text-muted-foreground">${data.symbol}</span>}
          </p>
          <p className="text-[13.5px] text-muted-foreground">Pons did not launch this token, so it has no bonding curve to read or quote. {data.decimals !== null && data.totalSupply !== null && `Its supply is ${compactUnits(data.totalSupply, data.decimals)}.`}</p>
          <Address value={address} link={explorer.token(address)} keep={8} />
        </div>
      )}
    </Surface>
  );
}

export function TokenPage({ address }: { address: string | null }) {
  const { data: token, error, reload } = useLoad(address ? () => api.token(address) : null, `token:${address}`);
  if (!address)
    return (
      <Surface className="flex flex-col gap-4 p-6">
        <div>
          <p className="text-[22px] font-extrabold tracking-tight">Check a token</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Paste a token launched on Pons to see its curve, progress, price, a quote and its recent trades.</p>
        </div>
        <TokenSearch />
      </Surface>
    );
  if (error instanceof ApiError && error.code === 'NOT_A_PONS_TOKEN') return <NotPons address={address} />;
  if (error && !token)
    return (
      <Surface>
        <Failed error={error} onRetry={reload} />
      </Surface>
    );
  if (!token)
    return (
      <Surface>
        <Loading>Reading the curve…</Loading>
      </Surface>
    );

  const pairDecimals = token.pairedWith.decimals;
  const pairSymbol = token.pairedWith.symbol ?? 'paired asset';
  const progress = token.progressPct;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-light text-[18px] font-extrabold text-primary">{(token.symbol ?? token.name ?? '?').slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-[24px] leading-tight font-extrabold tracking-[-0.03em]">
              <span className="truncate">{token.name ?? 'Unnamed'}</span>
              {token.symbol && <span className="text-[16px] font-bold text-muted-foreground">${token.symbol}</span>}
              {token.graduated ? <Tag tone="good">Graduated</Tag> : token.readyToGraduate ? <Tag tone="warn">Ready to graduate</Tag> : <Tag tone="primary">On its curve</Tag>}
            </h1>
            <Address value={token.token} link={explorer.token(token.token)} keep={6} />
          </div>
        </div>
        <div className="w-full lg:max-w-md">
          <TokenSearch />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Curve progress"
          value={progress === null ? '—' : `${progress.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`}
          icon={<GaugeIcon weight="duotone" />}
          note={
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted">
              <span className={cn('block h-full rounded-full', token.graduated ? 'bg-momentum' : 'bg-primary')} style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }} />
            </span>
          }
        />
        <Stat label={`Price in ${pairSymbol}`} value={price(token.spotPriceInPairedAsset)} icon={<ChartLineUpIcon weight="duotone" />} note="Spot price on the curve, per token" />
        <Stat
          label="Raised"
          value={pairDecimals === null ? '—' : `${formatUnits(token.realQuoteReserve, pairDecimals, 4)} ${pairSymbol}`}
          icon={<CoinsIcon weight="duotone" />}
          note={pairDecimals === null ? 'Paired asset decimals unknown' : `Graduates at ${formatUnits(token.graduationThreshold, pairDecimals, 4)} ${pairSymbol}`}
        />
        <Stat label="Fee and tax" value={`${bps(token.feeBps)} + ${bps(token.creatorTaxBps)}`} icon={<PercentIcon weight="duotone" />} note="Curve fee plus the creator's tax, per trade" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <QuotePanel token={token} />
        <Panel title="The curve" description="Read straight from the chain." icon={<ReceiptIcon weight="duotone" />} flush>
          <dl className="divide-y divide-border/70 text-[13px]">
            {[
              ['Curve contract', <Address key="c" value={token.curve} link={explorer.address(token.curve)} />],
              ['Paired with', token.pairedWith.native ? 'ETH (native)' : <Address key="p" value={token.pairedWith.address} link={explorer.token(token.pairedWith.address)} />],
              ['Supply', token.totalSupply === null ? '—' : compactUnits(token.totalSupply, token.decimals)],
              ['Still on the curve', token.sellableTokens === null ? '—' : compactUnits(token.sellableTokens, token.decimals)],
              ['Decimals', String(token.decimals)],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <TradesPanel token={token} />
    </div>
  );
}
