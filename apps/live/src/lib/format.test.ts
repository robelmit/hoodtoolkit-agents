import { describe, expect, it } from 'vitest';
import { pairLabel, thresholdLabel } from '@/pages/launches';
import { toBase } from '@/pages/token';
import { bps, compactUnits, formatUnits, isAddress, price, short } from './format';
import { parseRoute } from './route';

describe('units', () => {
  it('formats base units exactly', () => {
    expect(formatUnits('4200000000000000000', 18)).toBe('4.2');
    expect(formatUnits('15536000000000000', 18, 4)).toBe('0.0155');
    expect(formatUnits('1000000', 6)).toBe('1');
    expect(formatUnits('0', 18)).toBe('0');
    expect(formatUnits('123456789000000000000000', 18)).toBe('123,456.789');
  });
  it('compacts large token amounts', () => {
    expect(compactUnits('9162884185295977201309792', 18)).toBe('9.16M');
    expect(compactUnits('705122830100418308512975923', 18)).toBe('705.12M');
    expect(compactUnits('500000000000000000', 18)).toBe('0.5');
  });
  it('turns decimals into base units', () => {
    expect(toBase('0.01', 18)).toBe('10000000000000000');
    expect(toBase('1000000', 18)).toBe('1000000000000000000000000');
    expect(toBase('1.5', 6)).toBe('1500000');
    expect(toBase('0.1234567', 6)).toBe('123456');
  });
  it('shows tiny prices without exponents and unknown as a dash', () => {
    expect(price(1.711215671e-9)).toBe('0.00000000171');
    expect(price(2.5)).toBe('2.5');
    expect(price(null)).toBe('—');
  });
  it('reads basis points as percent', () => {
    expect(bps('190')).toBe('1.9%');
    expect(bps(300)).toBe('3%');
  });
});

describe('addresses and routes', () => {
  it('shortens and checks addresses', () => {
    expect(short('0x70fd4f66587eec272ebaea3f859e6d1da6ee60a0')).toBe('0x70fd…60a0');
    expect(isAddress('0x70fd4f66587eec272ebaea3f859e6d1da6ee60a0')).toBe(true);
    expect(isAddress('0x70fd')).toBe(false);
  });
  it('parses hash routes', () => {
    expect(parseRoute('#/token/0xabc')).toEqual({ page: 'token', param: '0xabc' });
    expect(parseRoute('')).toEqual({ page: 'launches', param: null });
    expect(parseRoute('#/nothing')).toEqual({ page: 'launches', param: null });
  });
});

describe('launch labels', () => {
  it('names the pair and gives the ETH threshold only when ETH is the pair', () => {
    expect(pairLabel({ pairedWithNative: true, pairToken: '0x0000000000000000000000000000000000000000' })).toBe('ETH');
    expect(pairLabel({ pairedWithNative: false, pairToken: '0x5e81213613b6b86eab4c6c50d718d34359459786' })).toBe('0x5e81…9786');
    expect(thresholdLabel({ pairedWithNative: true, graduationThreshold: '4200000000000000000' })).toBe('4.2 ETH');
    expect(thresholdLabel({ pairedWithNative: false, graduationThreshold: '26639006882017848277' })).toBeNull();
  });
});
