const readable = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });
const oddsNumber = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

function scientific(value: number): string {
  const [mantissa, exponent] = value.toExponential(3).split('e');
  return `${Number(mantissa)}e${exponent}`;
}

/** Keep ordinary percentages through exponent -6, then use scientific notation. */
export function formatFullActivationPercent(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0) return '—';
  const percent = probability * 100;
  return `${percent > 0 && percent < 1e-6 ? scientific(percent) : readable.format(percent)}%`;
}

/** Rounded inverse odds, with named magnitudes up to 999 quadrillion. */
export function formatInverseOdds(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return '—';
  if (probability === 0) return 'No finite inverse (0%)';
  const denominator = 1 / probability;
  if (!Number.isFinite(denominator)) {
    // A positive subnormal probability can have an inverse larger than a double.
    const log = -Math.log10(probability);
    const exponent = Math.floor(log);
    return `1 in ${oddsNumber.format(10 ** (log - exponent))}e+${exponent}`;
  }
  // Compare the probability directly so reciprocal rounding cannot push the
  // exact 999-quadrillion boundary into scientific notation.
  if (probability < 1 / 999e15) return `1 in ${scientific(denominator)}`;
  const rounded = Number(denominator.toPrecision(3));
  const units = [[1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const;
  const unit = units.find(([scale]) => rounded >= scale);
  return `1 in ${unit ? `${oddsNumber.format(rounded / unit[0])} ${unit[1]}` : oddsNumber.format(rounded)}`;
}
