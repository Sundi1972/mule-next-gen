import { useEffect, useState } from 'react';
import { addToTally, AGGREGATE_SEEDS, emptyAggregate, GENERATORS, mapsForSeed, type Aggregate, type Players } from './gallery';

export interface AggregateProgress {
  aggregate: Aggregate;
  done: number;
}

const finished = new Map<Players, Aggregate>();

// Seeds per slice: small enough that the page stays responsive while the run works through all of them.
const SLICE = 8;

/** Tallies the checker's reports over seeds 1 to AGGREGATE_SEEDS for one size, a slice at a time. */
export function useAggregate(players: Players): AggregateProgress {
  const [progress, setProgress] = useState<AggregateProgress>(() => startOf(players));

  useEffect(() => {
    const cached = finished.get(players);
    if (cached) {
      setProgress({ aggregate: cached, done: AGGREGATE_SEEDS });
      return;
    }
    const aggregate = emptyAggregate();
    let seed = 1;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      for (const end = Math.min(seed + SLICE, AGGREGATE_SEEDS + 1); seed < end; seed++) {
        const maps = mapsForSeed(seed, players);
        for (const g of GENERATORS) addToTally(aggregate[g], maps[g].report);
      }
      const done = seed - 1;
      if (done === AGGREGATE_SEEDS) finished.set(players, aggregate);
      setProgress({ aggregate: structuredClone(aggregate), done });
      if (done < AGGREGATE_SEEDS) timer = setTimeout(step, 0);
    };
    setProgress({ aggregate: emptyAggregate(), done: 0 });
    timer = setTimeout(step, 0);
    return () => clearTimeout(timer);
  }, [players]);

  return progress;
}

function startOf(players: Players): AggregateProgress {
  const cached = finished.get(players);
  return cached ? { aggregate: cached, done: AGGREGATE_SEEDS } : { aggregate: emptyAggregate(), done: 0 };
}
