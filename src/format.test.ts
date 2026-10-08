import { describe, expect, it } from 'vitest';
import { formatFullActivationPercent, formatInverseOdds } from './format';

describe('full activation display', () => {
  it.each([
    [0, '0%'], [1, '100%'], [.00694, '0.694%'],
    [6.79e-8, '0.00000679%'], [1e-8, '0.000001%'],
    [6.79e-9, '6.79e-7%'], [1e-9, '1e-7%'],
  ])('formats probability %s as %s', (p, expected) => {
    expect(formatFullActivationPercent(p)).toBe(expected);
  });
  it.each([
    [1, '1 in 1'], [.1, '1 in 10'], [1 / 15000, '1 in 15 thousand'],
    [1 / 15000000, '1 in 15 million'], [1 / 2.5e9, '1 in 2.5 billion'],
    [1 / 2e12, '1 in 2 trillion'], [1 / 999e15, '1 in 999 quadrillion'],
    [1 / 999.1e15, '1 in 9.991e+17'], [1 / 999999, '1 in 1 million'],
    [1e-18, '1 in 1e+18'], [1e-24, '1 in 1e+24'],
    [0, 'No finite inverse (0%)'],
  ])('formats inverse odds for %s as %s', (p, expected) => {
    expect(formatInverseOdds(p)).toBe(expected);
  });
  it('handles a positive probability whose inverse overflows without displaying infinity', () => {
    expect(formatInverseOdds(Number.MIN_VALUE)).toBe('1 in 2.02e+323');
  });
});
