import type { Action, AppState, Selection } from "./model";

// Explicit preview and stored selected pairs are complete comparisons.
// The Base/manual question is only for a missing second selection in Two.
export function comparisonEntry(
  state: AppState,
  includeBase: boolean,
  clicked?: Selection,
): { action: Action; prompt?: never } | { prompt: Selection; action?: never } {
  if (state.pending)
    return {
      action: {
        type: "select",
        selection: clicked ?? state.preview ?? state.current,
      },
    };
  if (state.preview)
    return {
      action: { type: "start-compare", one: state.current, two: state.preview },
    };
  if (state.one && state.two)
    return { action: { type: "page", page: "compare" } };
  if (!includeBase) return { prompt: clicked ?? state.current };
  return {
    action: { type: "start-compare", one: clicked ?? state.current, two: null },
  };
}
