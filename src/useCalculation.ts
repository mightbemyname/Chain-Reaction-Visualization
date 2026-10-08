import { useEffect, useRef, useState } from 'react';
import type { Graph } from './model';
import type { ProbabilityResult } from './probability';

export interface Comparison { probability: number; result: ProbabilityResult }
export function useCalculation(graph: Graph, kind: 'exact' | 'simulation' | 'comparison', enabled: boolean, trials: number, seed: string, revision = 0, probabilities: number[] = []) {
  const [result, setResult] = useState<ProbabilityResult>();
  const [resultKey, setResultKey] = useState('');
  const [results, setResults] = useState<Comparison[]>([]);
  const [status, setStatus] = useState<'idle' | 'pending' | 'running' | 'done' | 'cancelled' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Moving nodes changes the drawing, never the probability model.
  const key = JSON.stringify({ nodes: graph.nodes.map(n => n.id), edges: graph.edges, mode: graph.mode, source: graph.source, probability: graph.probability });
  const probabilityKey = JSON.stringify(probabilities);
  const requestKey = JSON.stringify([key, kind, trials, seed, revision, probabilityKey]);
  useEffect(() => {
    let disposed = false;
    setResult(undefined); setResults([]); setProgress(0); setError('');
    if (!enabled || !graph.nodes.length) { setStatus('idle'); return; }
    setStatus('pending');
    timer.current = setTimeout(() => {
      const w = new Worker(new URL('./calculation.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w; setStatus('running');
      w.onmessage = ({ data }) => {
        if (disposed) return;
        if (data.type === 'progress') setProgress(data.progress);
        if (data.type === 'result') { setResultKey(requestKey); setResult(data.result); setResults(data.results || []); setStatus('done'); setProgress(1); w.terminate(); worker.current = null; }
        if (data.type === 'error') { setError(data.message); setStatus('error'); w.terminate(); worker.current = null; }
      };
      w.onerror = () => { if (disposed) return; setError('The calculation worker failed. Try fewer trials or a smaller graph.'); setStatus('error'); w.terminate(); worker.current = null; };
      w.postMessage({ id: revision, graph, kind, trials, seed: seed || undefined, probabilities });
    }, 300);
    return () => { disposed = true; clearTimeout(timer.current); worker.current?.terminate(); worker.current = null; };
    // graph coordinates deliberately excluded from dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, enabled, trials, seed, revision, probabilityKey]);
  const cancel = () => { clearTimeout(timer.current); worker.current?.terminate(); worker.current = null; setStatus('cancelled'); };
  // Invalidate synchronously on render: effects run too late to stop a new graph
  // from indexing the previous graph's result arrays (e.g. its confidence bins).
  const current = enabled && resultKey === requestKey;
  return { result: current ? result : undefined, results: current ? results : [], status, progress, error, cancel, busy: status === 'pending' || status === 'running' };
}
