/** Formatting for chain values. Amounts arrive as whole numbers of base units in strings; no float touches them until display. */

/** Base units to a decimal string, trimmed: `formatUnits('4200000000000000000', 18)` is `4.2`. */
export function formatUnits(base: string, decimals: number, maxFraction = 6): string {
  if (!/^-?\d+$/.test(base)) return base;
  const negative = base.startsWith('-');
  const digits = (negative ? base.slice(1) : base).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  let fraction = decimals > 0 ? digits.slice(digits.length - decimals) : '';
  fraction = fraction.slice(0, maxFraction).replace(/0+$/, '');
  const grouped = BigInt(whole).toLocaleString('en-US');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

/** A token amount in base units, short: `9.16M`, `705.12M`, `1.2B`. */
export function compactUnits(base: string, decimals: number): string {
  if (!/^\d+$/.test(base)) return base;
  const scale = 10n ** BigInt(Math.max(0, decimals - 2));
  const hundredths = Number(BigInt(base) / scale) / 100;
  if (hundredths < 1000) return formatUnits(base, decimals, 4);
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(hundredths);
}

/** A very small price without scientific notation: `0.0000000017`. Null stays an em dash. */
export function price(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const digits = Math.min(20, Math.max(2, -Math.floor(Math.log10(value)) + 2));
  return value.toFixed(digits).replace(/0+$/, '');
}

/** `0x70fd…60a0`. */
export function short(address: string, keep = 4): string {
  return address.length <= keep * 2 + 3 ? address : `${address.slice(0, keep + 2)}…${address.slice(-keep)}`;
}

/** Basis points as a percent: `190` is `1.9%`. */
export function bps(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : '—';
}

export const isAddress = (text: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(text.trim());

export const EXPLORER = 'https://robinhoodchain.blockscout.com';
export const explorer = {
  address: (address: string) => `${EXPLORER}/address/${address}`,
  token: (address: string) => `${EXPLORER}/token/${address}`,
  tx: (hash: string) => `${EXPLORER}/tx/${hash}`,
  block: (block: number) => `${EXPLORER}/block/${block}`,
};
