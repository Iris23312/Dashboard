import { bisector } from "d3";
import type { NodeRecord, Observation, Run } from "./model";
export type Section = { offset: number; count: number; stride: number };
export type PackedMeta = {
  fields: string[];
  dictionaries: Record<string, string[]>;
  sections: Record<string, Section>;
  nodeCount: number;
};
export type DepthIndex = { order: Uint32Array; offsets: Uint32Array };
export interface Series<T> {
  length: number;
  at(index: number): T | undefined;
}
export class NumericSeries<T> implements Series<T> {
  readonly length: number;
  values: Float64Array;
  stride: number;
  private decode: (r: Float64Array) => T;
  constructor(
    values: Float64Array,
    stride: number,
    decode: (r: Float64Array) => T,
  ) {
    this.values = values;
    this.stride = stride;
    this.decode = decode;
    this.length = values.length / stride;
  }
  at(i: number) {
    if (i < 0) i += this.length;
    return i < 0 || i >= this.length
      ? undefined
      : this.decode(
          this.values.subarray(i * this.stride, (i + 1) * this.stride),
        );
  }
}
export function makeDepthIndex(
  data: Float64Array,
  fields: string[],
): DepthIndex {
  const stride = fields.length,
    depth = fields.indexOf("depth"),
    x = fields.indexOf("x"),
    buckets: number[][] = [];
  for (let i = 0; i < data.length / stride; i++)
    (buckets[data[i * stride + depth]] ??= []).push(i);
  const order = new Uint32Array(data.length / stride),
    offsets = new Uint32Array(buckets.length + 1);
  let cursor = 0;
  for (let d = 0; d < buckets.length; d++) {
    offsets[d] = cursor;
    const bucket = buckets[d] ?? [];
    bucket.sort((a, b) => data[a * stride + x] - data[b * stride + x]);
    order.set(bucket, cursor);
    cursor += bucket.length;
  }
  offsets[buckets.length] = cursor;
  return { order, offsets };
}
export class NodeStore {
  readonly length: number;
  readonly columns: Record<string, number>;
  readonly stride: number;
  values: Float64Array;
  fields: string[];
  dictionaries: Record<string, string[]>;
  depthIndex: DepthIndex;
  constructor(
    values: Float64Array,
    fields: string[],
    dictionaries: Record<string, string[]>,
    depthIndex: DepthIndex,
  ) {
    this.values = values;
    this.fields = fields;
    this.dictionaries = dictionaries;
    this.depthIndex = depthIndex;
    this.stride = fields.length;
    this.length = values.length / this.stride;
    this.columns = Object.fromEntries(fields.map((f, i) => [f, i]));
  }
  raw(i: number, key: string) {
    return this.values[i * this.stride + this.columns[key]];
  }
  get(id: number | null | undefined): NodeRecord | undefined {
    if (id == null || !Number.isInteger(id) || id < 1 || id > this.length)
      return undefined;
    const r: Record<string, unknown> = {};
    for (let k = 0; k < this.stride; k++) {
      const key = this.fields[k],
        v = this.values[(id - 1) * this.stride + k];
      r[key] = this.dictionaries[key]
        ? this.dictionaries[key][v]
        : Number.isNaN(v)
          ? null
          : key === "layout_satisfies_model"
            ? Boolean(v)
            : v;
    }
    return r as NodeRecord;
  }
  nearest(x: number, y: number, radius: number): number | null {
    const { order, offsets } = this.depthIndex;
    let best: number | null = null,
      distance = radius * radius;
    const bisect = bisector((i: number) => this.raw(i, "x")).left;
    for (let d = 0; d < offsets.length - 1; d++) {
      const start = offsets[d],
        end = offsets[d + 1];
      if (start === end) continue;
      const dy = this.raw(order[start], "y") - y;
      if (dy * dy > distance) continue;
      const hit = bisect(order, x, start, end);
      for (const p of [hit - 1, hit])
        if (p >= start && p < end) {
          const idx = order[p],
            dx = this.raw(idx, "x") - x,
            q = dx * dx + dy * dy;
          if (q <= distance) {
            distance = q;
            best = idx;
          }
        }
    }
    return best;
  }
}
const numberOrNull = (v: number) => (Number.isNaN(v) ? null : v);
export function hydrateRun(
  manifest: any,
  buffer: ArrayBuffer,
  index?: DepthIndex,
): Run {
  const section = (name: string) => {
    const s: Section = manifest.sections[name];
    return new Float64Array(buffer, s.offset, s.count * s.stride);
  };
  const nodes = section("nodes");
  return {
    ...manifest,
    nodes: new NodeStore(
      nodes,
      manifest.fields,
      manifest.dictionaries,
      index ?? makeDepthIndex(nodes, manifest.fields),
    ),
    progress: new NumericSeries<Observation>(section("progress"), 6, (r) => ({
      t: r[0],
      node_id: numberOrNull(r[1]),
      primal: numberOrNull(r[2]),
      dual: numberOrNull(r[3]),
      gap: numberOrNull(r[4]),
      reportedGap: Number.isNaN(r[5]) ? undefined : r[5],
      source: Number.isNaN(r[1]) ? "summary.json" : "tree_nodes.csv",
    })),
    processing: new NumericSeries(section("processing"), 3, (r) => ({
      t: r[0],
      node_id: r[1],
      source: ["node record", "node LP layout", "incumbent event"][r[2]],
    })),
    seenTimes: section("seen"),
  };
}
export function recordedCount(run: Run, t: number) {
  return bisector((v: number) => v).right(run.seenTimes, t + 1e-9);
}
