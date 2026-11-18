import { CodeIcon, GithubLogoIcon, RocketLaunchIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { useEffect, useState } from 'react';
import { TokenSearch } from '@/components/bits';
import { Surface, Tag } from '@/components/kit';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { href, useRoute, type Page } from '@/lib/route';
import { DevelopersPage } from '@/pages/developers';
import { LaunchesPage } from '@/pages/launches';
import { TokenPage } from '@/pages/token';

const NAV: { page: Page; label: string; Icon: typeof RocketLaunchIcon }[] = [
  { page: 'launches', label: 'Launches', Icon: RocketLaunchIcon },
  { page: 'token', label: 'Token check', Icon: ShieldCheckIcon },
  { page: 'developers', label: 'Developers', Icon: CodeIcon },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="9" fill="#141416" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#2a2a2d" />
      <path d="M10 8h3.5v6.2h5V8H22v16h-3.5v-6.3h-5V24H10z" fill="#6cc864" />
    </svg>
  );
}

/** Whether the API answers, asked every 30 seconds. */
function ApiStatus() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    const check = (): void =>
      void api.health().then(
        (h) => setUp(h.ok),
        () => setUp(false),
      );
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="hidden items-center gap-2.5 rounded-full border border-border bg-card py-1 pr-3.5 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex">
          <span className={cn('grid size-8 place-items-center rounded-full', up === null ? 'bg-muted' : up ? 'bg-primary-light' : 'bg-risk-bg')}>
            <span className={cn('size-2 rounded-full', up === null ? 'bg-muted-foreground' : up ? 'animate-pulse bg-momentum' : 'bg-risk')} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-bold">{up === null ? 'Connecting' : up ? 'Robinhood Chain' : 'API offline'}</span>
            <span className="text-[11px] text-muted-foreground">{up ? 'Live data · chain 4663' : 'Demo API'}</span>
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{up ? 'Reading Robinhood Chain through the free demo API' : 'The demo API is not answering'}</TooltipContent>
    </Tooltip>
  );
}

function NavLinks({ page, mobile = false }: { page: Page; mobile?: boolean }) {
  return (
    <nav data-mobile={mobile || undefined} aria-label="Pages" className={cn('flex items-center gap-0.5 rounded-full bg-muted/70 p-1 shadow-[inset_0_0_0_0.5px_var(--border)]', mobile ? 'w-max' : 'h-10')}>
      {NAV.map(({ page: p, label, Icon }) => {
        const active = p === page;
        return (
          <a
            key={p}
            href={href(p)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] tracking-[-0.01em] whitespace-nowrap transition-colors',
              active ? 'bg-card font-semibold text-foreground shadow-[0_1px_0_var(--border-shadow),inset_0_0_0_0.5px_var(--border)]' : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon weight={active ? 'duotone' : 'regular'} className={cn('size-[18px]', active && 'text-primary')} />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

function Intro() {
  return (
    <Surface className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-xl">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Tag tone="primary">Open source</Tag>
          <Tag>MIT</Tag>
          <Tag>No keys held</Tag>
        </div>
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em] text-balance sm:text-[36px]">Tools for Robinhood Chain launchpads, running live</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">Pons launches as they happen, each token&apos;s bonding curve, progress, price, exact quotes and recent trades. Every number on this site comes from the open-source hoodtoolkit packages, read straight from the chain.</p>
      </div>
      <div className="w-full lg:max-w-md">
        <TokenSearch />
      </div>
    </Surface>
  );
}

export function App() {
  const route = useRoute();
  useEffect(() => {
    document.querySelector('nav[data-mobile] [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [route.page]);
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <a href={href('launches')} className="flex items-center gap-2" aria-label="hoodtoolkit Live home">
            <BrandMark />
            <span className="text-[19px] leading-none font-extrabold tracking-[-0.04em]">
              hoodtoolkit<span className="text-primary"> live</span>
            </span>
          </a>
          <div className="mx-auto hidden lg:block">
            <NavLinks page={route.page} />
          </div>
          <div className="ml-auto flex items-center gap-3 lg:ml-0">
            <ApiStatus />
            <a href="https://github.com/robelmit/hoodtoolkit-sdk" target="_blank" rel="noreferrer" aria-label="hoodtoolkit on GitHub" className="grid size-9 place-items-center rounded-full border border-border bg-card transition-colors hover:bg-muted">
              <GithubLogoIcon weight="duotone" className="size-[18px]" />
            </a>
          </div>
        </div>
        <div className="overflow-x-auto px-4 pb-3 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          <NavLinks page={route.page} mobile />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6">
        {route.page === 'launches' && (
          <>
            <Intro />
            <LaunchesPage />
          </>
        )}
        {route.page === 'token' && <TokenPage key={route.param ?? 'none'} address={route.param} />}
        {route.page === 'developers' && <DevelopersPage />}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <BrandMark className="size-5" />
            hoodtoolkit is open source under the MIT licence. It reads public chain data and never holds a key.
          </span>
          <span>
            From the team behind{' '}
            <a href="https://hexa.trade" target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              Hexa
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
