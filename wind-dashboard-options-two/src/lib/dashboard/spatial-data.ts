import type { Cell } from "./model";

export type SpatialCell = Omit<Cell, "t_w" | "b_w">;
export type FinalLayout = {
  run_id: string;
  title: string;
  unmapped_selected_cells: number;
  lambdas: number[];
  cells: Cell[];
};

const grids = new Map<string, Promise<Map<number, SpatialCell>>>();

export function loadSpatialGrid(id: string) {
  let pending = grids.get(id);
  if (!pending) {
    pending = fetch("/api/grids/" + encodeURIComponent(id))
      .then(async (response) => {
        if (!response.ok) throw Error("Could not load grid coordinates");
        const cells = (await response.json()) as SpatialCell[];
        return new Map(cells.map((cell) => [cell.cell_id, cell]));
      })
      .catch((error) => {
        grids.delete(id);
        throw error;
      });
    grids.set(id, pending);
  }
  return pending;
}
