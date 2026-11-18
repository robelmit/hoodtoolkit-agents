/**
 * The toolkit look, shared with soltoolkit pay and soltoolkit Live: cards with a solid 2px bottom edge, raised pill
 * buttons with a darker edge, pill tab groups, round icon buttons, tiny uppercase section labels.
 */

import { cn } from 'cn';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/** A card: #141416, 1px border, 20px radius, 2px solid bottom edge. */
export function Surface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('relative overflow-hidden rounded-[20px] border border-border bg-card text-card-foreground shadow-[0_2px_0_var(--border-shadow)]', className)} {...props} />;
}

/** A green icon on a round tinted disc. */
export function IconDisc({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-primary-light text-primary [&_svg]:size-[18px]', className)}>{children}</span>;
}

/** A titled card with one body. `flush` lets a table reach the edges. */
export function Panel({ title, description, icon, action, children, className, flush = false }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <Surface className={className}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <IconDisc>{icon}</IconDisc>}
          <div className="min-w-0">
            <h2 className="text-[15px] leading-tight font-bold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn(flush ? 'p-0' : 'p-4')}>{children}</div>
    </Surface>
  );
}

/** A single figure with its icon: for rows of headline numbers. */
export function Stat({ label, value, icon, note }: { label: string; value: ReactNode; icon: ReactNode; note?: ReactNode }) {
  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
        <IconDisc className="size-8">{icon}</IconDisc>
      </div>
      <span className="truncate text-[24px] leading-none font-extrabold tracking-[-0.04em] tabular-nums">{value}</span>
      {note && <span className="text-[12px] text-muted-foreground">{note}</span>}
    </Surface>
  );
}

/** TODAY, CHARGING: 10.5px, bold, uppercase, 0.16em tracking, muted. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('mb-2.5 px-1 text-[10.5px] font-bold tracking-[0.16em] text-muted-foreground uppercase', className)}>{children}</h2>;
}

/** A small rounded label. */
export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'primary' | 'good' | 'bad' | 'warn' }) {
  const tones = { muted: 'border border-border text-muted-foreground', primary: 'bg-primary-light text-primary-text', good: 'bg-momentum-bg text-momentum', bad: 'bg-risk-bg text-risk', warn: 'bg-zap-bg text-zap' } as const;
  return <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-bold', tones[tone])}>{children}</span>;
}

type Tone = 'primary' | 'muted';
const TONE: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shadow)] hover:brightness-105',
  muted: 'bg-muted text-foreground shadow-[0_3px_0_var(--border-shadow)] hover:bg-[#232327]',
};

/** The raised pill button: a darker edge under it that disappears as it is pressed. */
export function RaisedButton({ tone = 'primary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-extrabold transition-all select-none active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        size === 'sm' ? 'h-9 px-4 text-[12.5px] font-semibold' : 'h-10 px-5 text-[14px]',
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}

/** 36px round button with a border. */
export function IconButton({ className, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted [&_svg]:size-[18px]', className)} {...props} />;
}

/** The pill tab group: a muted track with an inset hairline, the active tab raised on a card-coloured pill. */
export function PillTabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (value: T) => void; items: readonly { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex h-10 items-center gap-0.5 rounded-full bg-muted/70 p-1 shadow-[inset_0_0_0_0.5px_var(--border)]', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex h-full items-center justify-center gap-1.5 rounded-full px-3.5 text-[13.5px] tracking-[-0.01em] whitespace-nowrap transition-[color,background-color,box-shadow] duration-200',
              active ? 'bg-card font-semibold text-foreground shadow-[0_1px_0_var(--border-shadow),inset_0_0_0_0.5px_var(--border)]' : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="rounded-full bg-primary-light px-1.5 text-[11px] font-bold text-primary-text">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A table head row and body rows: plain HTML in the reference look. */
export function Table({ head, children, empty }: { head: readonly { label: string; align?: 'right'; hideOnPhone?: boolean }[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h.label} className={cn('px-4 py-2.5 text-[10.5px] font-bold tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase', h.align === 'right' && 'text-right', h.hideOnPhone && 'max-sm:hidden')}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
