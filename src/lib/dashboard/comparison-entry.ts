import type { Action, AppState, Selection } from "./model";

// Base release: ask about Selected 2 once. Opening an existing comparison
// preserves its selections; only the explicit Off action clears them.
export function comparisonEntry(
  state: AppState,
  _includeBase = true,
  clicked?: Selection,
): { action: Action; prompt?: never } | { prompt: Selection; action?: never } {
  if (state.pending) {
    const choice = clicked ?? state.preview;
    return {
      action: choice
        ? { type: "select", selection: choice }
        : { type: "page", page: state.pendingReturn },
    };
  }
  if (state.preview)
    return {
      action: { type: "start-compare", one: state.current, two: state.preview },
    };
  if (state.one) return { action: { type: "page", page: "compare" } };
  return { prompt: clicked ?? state.current };
}
