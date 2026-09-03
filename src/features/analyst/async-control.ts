export async function withAbortAndTimeout<T>(work: Promise<T>, signal: AbortSignal, timeoutMs: number) {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TOOL_TIMEOUT")), timeoutMs);
  });
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    const result = await Promise.race([work, timeout, aborted]);
    signal.throwIfAborted();
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

