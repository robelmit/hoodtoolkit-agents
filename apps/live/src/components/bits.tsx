import { ArrowSquareOutIcon, CheckIcon, CircleNotchIcon, CopyIcon, MagnifyingGlassIcon, PlugsIcon } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { RaisedButton } from '@/components/kit';
import type { ApiError } from '@/lib/api';
import { isAddress, short } from '@/lib/format';
import { go } from '@/lib/route';

/** A short address in mono, with copy and a link to the explorer. */
export function Address({ value, link, keep = 4 }: { value: string; link: string; keep?: number }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted-foreground">
      <span title={value}>{short(value, keep)}</span>
      <button
        type="button"
        aria-label="Copy address"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => toast.error('Could not copy'),
          );
        }}
        className="grid size-6 place-items-center rounded-full hover:bg-muted hover:text-foreground"
      >
        {copied ? <CheckIcon weight="bold" className="size-3.5 text-primary" /> : <CopyIcon className="size-3.5" />}
      </button>
      <a href={link} target="_blank" rel="noreferrer" aria-label="Open in the explorer" onClick={(e) => e.stopPropagation()} className="grid size-6 place-items-center rounded-full hover:bg-muted hover:text-foreground">
        <ArrowSquareOutIcon className="size-3.5" />
      </a>
    </span>
  );
}

/** Paste a token address, go to its page. */
export function TokenSearch({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(initial), [initial]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!isAddress(text)) return setInvalid(true);
    setInvalid(false);
    go('token', text.trim().toLowerCase());
  };
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-1.5">
      <div className="flex gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 focus-within:ring-2 focus-within:ring-ring/50">
          <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a token address (0x…)" aria-label="Token address" aria-invalid={invalid} spellCheck={false} className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground" />
        </label>
        <RaisedButton type="submit">Check</RaisedButton>
      </div>
      {invalid && <p className="px-2 text-[13px] text-destructive">That is not a Robinhood Chain address.</p>}
    </form>
  );
}

/** What a card shows while it loads, when it failed, or when there is nothing. */
export function Loading({ children = 'Reading the chain…' }: { children?: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-12 text-[13px] text-muted-foreground">
      <CircleNotchIcon className="size-4 animate-spin" />
      {children}
    </p>
  );
}

export function Failed({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const offline = error.code === 'OFFLINE' || error.code.startsWith('HTTP_5');
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-risk-bg text-risk">
        <PlugsIcon weight="duotone" className="size-5" />
      </span>
      <p className="text-[14px] font-bold">{offline ? 'The API is not answering' : 'That did not work'}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{offline ? 'Start the hoodtoolkit demo API beside this site, or set VITE_API_URL to one that runs.' : error.message}</p>
      {onRetry && (
        <RaisedButton tone="muted" size="sm" onClick={onRetry}>
          Try again
        </RaisedButton>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <p className="text-[14px] font-bold">{title}</p>
      {children && <p className="max-w-sm text-[13px] text-muted-foreground">{children}</p>}
    </div>
  );
}
