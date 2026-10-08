import { useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { ProbabilityResult } from './probability';
import { tail } from './probability';
import type { Comparison } from './useCalculation';
import { download } from './storage';
import { Download } from 'lucide-react';

const colors = ['#ac96ff', '#53d5b0', '#f5b96b', '#7ab6ff', '#ef80b3', '#d4dd77', '#b09ddd', '#77d9e8'];
export const pct = (value: number, digits = 3) => {
  const percent = value * 100;
  return percent > 0 && percent < 10 ** -digits ? `${percent.toExponential(3)}%` : `${percent.toLocaleString(undefined, { maximumFractionDigits: digits })}%`;
};
const axis = { fill: '#8792a9', fontSize: 11 };
const tipStyle = { background: '#1c2230', border: '1px solid #3a4051', borderRadius: 8, color: '#eef0f6', fontSize: 12 };

export function DistributionChart({ result, simulated, overlays }: { result?: ProbabilityResult; simulated?: ProbabilityResult; overlays: Comparison[] }) {
  const [view, setView] = useState<'pmf' | 'cdf' | 'tail'>('pmf');
  const [log, setLog] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const data = result?.distribution.slice(1).map((p, i) => {
    const k = i + 1;
    const get = (r: ProbabilityResult) => (view === 'pmf' ? r.distribution[k] : view === 'cdf' ? 1 - tail(r.distribution, k + 1) : tail(r.distribution, k)) * 100;
    const datum: Record<string, number | null> = { k, current: get(result), simulated: simulated ? get(simulated) : null };
    overlays.forEach((o, j) => { datum[`p${j}`] = get(o.result); });
    if (log) Object.keys(datum).filter(key => key !== 'k').forEach(key => { if (datum[key] === 0) datum[key] = null; });
    void p; return datum;
  }) || [];
  const positiveValues = data.flatMap(row => Object.entries(row).filter(([key, value]) => key !== 'k' && value !== null && value > 0).map(([, value]) => value as number));
  const logMinimum = positiveValues.length ? 10 ** Math.floor(Math.log10(Math.min(...positiveValues)) - 1) : 0.000001;
  const csv = () => {
    if (!result) return;
    const mc = simulated || (result.method === 'simulation' ? result : undefined);
    const header = ['activated_nodes', 'probability', 'cumulative_probability', 'probability_at_least', 'simulation_probability', 'simulation_95ci_low', 'simulation_95ci_high', ...overlays.map(o => `probability_p_${o.probability}`)];
    const rows = result.distribution.slice(1).map((p, i) => { const k = i + 1; return [k, p, 1 - tail(result.distribution, k + 1), tail(result.distribution, k), mc?.distribution[k] ?? '', mc?.confidenceIntervals?.[k]?.low ?? '', mc?.confidenceIntervals?.[k]?.high ?? '', ...overlays.map(o => o.result.distribution[k])].join(','); });
    download([header.join(','), ...rows].join('\n'), 'activation-distribution.csv', 'text/csv');
  };
  const svgExport = () => {
    const svg = container.current?.querySelector('svg');
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGElement;
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('style', 'background:#171c27;font-family:Arial,sans-serif');
    download(new XMLSerializer().serializeToString(copy), 'activation-distribution.svg', 'image/svg+xml');
  };
  return <section className="chart-panel">
    <div className="section-title"><div><h2>Activation distribution</h2><p>Every possible outcome, from a single spark to a full cascade.</p></div><div className="export-actions"><button className="subtle" onClick={csv} disabled={!result}><Download size={14} /> CSV</button><button className="subtle" onClick={svgExport} disabled={!result}>SVG</button></div></div>
    <div className="chart-toolbar"><div className="segmented">{(['pmf', 'cdf', 'tail'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v === 'pmf' ? 'Exactly K · PMF' : v === 'cdf' ? 'At most K · CDF' : 'At least K · CCDF'}</button>)}</div><label className="check"><input type="checkbox" checked={log} onChange={e => setLog(e.target.checked)} /> Log scale</label></div>
    {result ? <div className="chart" ref={container}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 15, right: 20, bottom: 15, left: 4 }}>
      <CartesianGrid stroke="#2b3140" vertical={false} strokeDasharray="3 5" />
      <XAxis dataKey="k" tick={axis} axisLine={false} tickLine={false} label={{ value: 'Number of activated nodes · K', position: 'insideBottom', offset: -9, ...axis }} />
      <YAxis scale={log ? 'log' : 'auto'} domain={log ? [logMinimum, 100] : [0, 'auto']} tick={axis} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
      <Tooltip contentStyle={tipStyle} labelFormatter={k => `${k} activated nodes`} formatter={(v, name) => [`${Number(v).toPrecision(8)}%`, name]} />
      {view === 'pmf' ? <Bar dataKey="current" name={result.method === 'exact' ? 'Exact probability' : 'Monte Carlo estimate'} fill="#ac96ff" radius={[5, 5, 0, 0]} maxBarSize={65} isAnimationActive={false} /> : <Line type="monotone" dataKey="current" name="Current probability" stroke="#ac96ff" strokeWidth={3} isAnimationActive={false} />}
      {simulated && <Line type="linear" dataKey="simulated" name="Monte Carlo" stroke="#53d5b0" strokeDasharray="5 3" strokeWidth={2} isAnimationActive={false} />}
      {overlays.map((o, i) => <Line key={o.probability} type="linear" dataKey={`p${i}`} name={`p = ${pct(o.probability, 1)}`} stroke={colors[(i + 1) % colors.length]} strokeWidth={2} isAnimationActive={false} />)}
      {(simulated || overlays.length > 0) && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />}
    </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Build a graph to explore its outcome distribution.</div>}
    <div className="chart-footnote">{log ? 'Zero-probability outcomes are omitted on the logarithmic axis. ' : ''}{result?.method === 'simulation' ? `${result.trials?.toLocaleString()} independent trials. Bin confidence intervals are available in the statistics and CSV.` : 'Exact probabilities use independent directed transmissions, including both directions of undirected connections.'}</div>
  </section>;
}

export function ComparisonCharts({ comparisons }: { comparisons: Comparison[] }) {
  const data = comparisons.map(c => ({ p: c.probability * 100, mean: c.result.mean, all: c.result.all * 100 }));
  return <div className="comparison-charts">{(['mean', 'all'] as const).map(key => <section key={key} className="mini-chart"><h3>{key === 'mean' ? 'Expected activated nodes' : 'Probability of full activation'}</h3><ResponsiveContainer width="100%" height={210}><LineChart data={data} margin={{ left: 0, right: 15, bottom: 10 }}><CartesianGrid stroke="#2b3140" vertical={false} strokeDasharray="3 5" /><XAxis dataKey="p" type="number" domain={[0, 100]} tick={axis} tickFormatter={v => `${v}%`} /><YAxis tick={axis} tickFormatter={v => key === 'all' ? `${v}%` : v} /><Tooltip contentStyle={tipStyle} labelFormatter={v => `Transmission: ${v}%`} formatter={v => key === 'all' ? `${Number(v).toPrecision(6)}%` : Number(v).toFixed(4)} /><Line dataKey={key} type="linear" stroke={key === 'mean' ? '#ac96ff' : '#53d5b0'} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} /></LineChart></ResponsiveContainer><p className="muted">Lines join the computed probability settings below.</p></section>)}</div>;
}
