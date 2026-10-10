import { hydrateRun } from "./packed-data";
import type { Run } from "./model";
export async function loadPackedRun(
  id: string,
  signal: AbortSignal,
): Promise<Run> {
  const response = await fetch("/api/runs/" + encodeURIComponent(id), {
    signal,
  });
  if (!response.ok) throw Error("Cannot load run");
  const meta = await response.json();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./data-worker.ts", import.meta.url), {
      type: "module",
    });
    const abort = () => {
      worker.terminate();
      reject(new DOMException("Loading cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    const finish = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    worker.onmessage = (e) => {
      finish();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(hydrateRun(meta, e.data.buffer, e.data.index));
    };
    worker.onerror = (e) => {
      finish();
      reject(Error(e.message));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    worker.postMessage({
      url: new URL(meta.dataFile, window.location.origin).href,
      meta,
    });
  });
}
