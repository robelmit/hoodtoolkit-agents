import { ArrowClockwiseIcon, RocketLaunchIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { useMemo, useState } from 'react';
import { Address, Empty, Failed, Loading } from '@/components/bits';
import { IconButton, Panel, PillTabs, Table, Tag } from '@/components/kit';
import { api, useLoad, type Launch } from '@/lib/api';
import { explorer, formatUnits, short } from '@/lib/format';
import { go } from '@/lib/route';

type Filter = 'all' | 'eth' | 'other';

/** What the curve is paired with, as far as the launch says: ETH, or another token's address. */
export function pairLabel(launch: Pick<Launch, 'pairedWithNative' | 'pairToken'>): string {
  return launch.pairedWithNative ? 'ETH' : short(launch.pairToken);
}

/** The graduation threshold in ETH when the pair is ETH; another asset's decimals are on the token page. */
export function thresholdLabel(launch: Pick<Launch, 'pairedWithNative' | 'graduationThreshold'>): string | null {
  return launch.pairedWithNative ? `${formatUnits(launch.graduationThreshold, 18, 4)} ETH` : null;
}

export function LaunchesPage() {
  const { data, error, loading, reload } = useLoad(() => api.launches(40), 'launches');
  const [filter, setFilter] = useState<Filter>('all');
  const launches = useMemo(() => (data?.launches ?? []).filter((l) => (filter === 'all' ? true : filter === 'eth' ? l.pairedWithNative : !l.pairedWithNative)), [data, filter]);
  const counts = { eth: data?.launches.filter((l) => l.pairedWithNative).length ?? 0, other: data?.launches.filter((l) => !l.pairedWithNative).length ?? 0 };

  return (
    <Panel
      title="New Pons launches"
      description={data ? `From the Pons factory, blocks ${data.fromBlock.toLocaleString('en-US')} to ${data.toBlock.toLocaleString('en-US')}, newest first.` : 'From the Pons factory, newest first.'}
      icon={<RocketLaunchIcon weight="duotone" />}
      flush
      action={
        <div className="flex items-center gap-2">
          <PillTabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'All' },
              { value: 'eth', label: 'ETH', count: counts.eth },
              { value: 'other', label: 'Other assets', count: counts.other },
            ]}
            className="max-md:hidden"
          />
          <IconButton label="Refresh" onClick={reload}>
            <ArrowClockwiseIcon className={cn(loading && 'animate-spin')} />
          </IconButton>
        </div>
      }
    >
      {error && !data ? (
        <Failed error={error} onRetry={reload} />
      ) : !data ? (
        <Loading>Reading the Pons factory…</Loading>
      ) : (
        <Table
          head={[{ label: 'Token' }, { label: 'Paired with' }, { label: 'Graduates at', align: 'right', hideOnPhone: true }, { label: 'Deployer', hideOnPhone: true }, { label: 'Block', align: 'right' }]}
          empty={launches.length === 0 && <Empty title="No launches in this window">Pons launches show up here as the factory creates them.</Empty>}
        >
          {launches.map((l) => (
            <tr key={l.token} onClick={() => go('token', l.token)} className="cursor-pointer transition-colors hover:bg-muted/50">
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-[13px] font-extrabold text-primary">{(l.symbol ?? l.name ?? '?').slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-[14px] font-bold">{l.name ?? 'Unnamed'}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {l.symbol ? `$${l.symbol}` : 'No symbol'} · <span className="font-mono">{short(l.token)}</span>
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Tag tone={l.pairedWithNative ? 'primary' : 'warn'}>{pairLabel(l)}</Tag>
              </td>
              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums max-sm:hidden">{thresholdLabel(l) ?? <span className="text-muted-foreground">On its page</span>}</td>
              <td className="px-4 py-3 max-sm:hidden">
                <Address value={l.deployer} link={explorer.address(l.deployer)} />
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <a href={explorer.tx(l.tx)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] text-muted-foreground tabular-nums hover:text-foreground">
                  #{l.block.toLocaleString('en-US')}
                </a>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
