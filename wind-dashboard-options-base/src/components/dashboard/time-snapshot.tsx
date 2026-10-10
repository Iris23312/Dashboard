import { useId, useState } from "react";
import { Info } from "../icons";
import { Card, Fields } from "./result-views";
import {
  fmt,
  num,
  snapshot,
  type Run,
  type Selection,
} from "@/lib/dashboard/model";

export function TimeSnapshot({
  run,
  selection,
  color,
}: {
  run: Run;
  selection: Selection;
  color: string;
}) {
  const q = snapshot(run, selection);
  const [showMeaning, setShowMeaning] = useState(false);
  const helpId = useId();
  const recordedTime = (t: number | null | undefined) =>
    t == null ? "Not recorded" : fmt(t, 6) + " s";
  return (
    <Card title="Time snapshot" className="time-info-card">
      <div className="snapshot-selected-time">
        <span>Selected time</span>
        <strong>{recordedTime(selection.t)}</strong>
      </div>
      <div className="snapshot-gap">
        <span>Gap · recorded bounds</span>
        <strong className="large-gap" style={{ color }}>
          {q.obs?.gap == null ? "Not recorded" : fmt(q.obs.gap, 6) + "%"}
        </strong>
      </div>
      <Fields
        items={[
          ["Bounds recorded at", recordedTime(q.obs?.t)],
          [
            "Global dual bound",
            q.obs?.dual == null ? "Not recorded" : fmt(q.obs.dual, 9),
          ],
          ["Displayed solution found at", recordedTime(q.incumbent?.time_s)],
          [
            "Highlighted path endpoint",
            q.nodeId == null ? "Not recorded" : "Node " + num(q.nodeId),
          ],
        ]}
      />
    </Card>
  );
}
