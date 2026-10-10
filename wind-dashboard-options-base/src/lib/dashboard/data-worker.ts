import { makeDepthIndex, type PackedMeta } from "./packed-data";
self.onmessage = async (
  event: MessageEvent<{ url: string; meta: PackedMeta }>,
) => {
  try {
    const response = await fetch(event.data.url);
    if (!response.ok || !response.body) throw Error("Cannot load tree records");
    const buffer = await new Response(
      response.body.pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
    const meta = event.data.meta,
      s = meta.sections.nodes,
      values = new Float64Array(buffer, s.offset, s.count * s.stride);
    const index = makeDepthIndex(values, meta.fields);
    self.postMessage(
      { buffer, index },
      { transfer: [buffer, index.order.buffer, index.offsets.buffer] },
    );
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
