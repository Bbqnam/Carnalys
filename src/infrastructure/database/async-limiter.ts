/** FIFO resource budget shared across analysis requests in this process. */
export function createAsyncLimiter(maximum: number) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Invalid concurrency budget");
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function limited<T>(work: () => Promise<T>): Promise<T> {
    if (active >= maximum) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try { return await work(); }
    finally {
      const next = waiting.shift();
      if (next) next(); // Hand this occupied slot directly to the next task.
      else active--;
    }
  };
}
