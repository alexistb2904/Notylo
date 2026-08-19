import { Link } from "react-router-dom";
import { useState } from "react";
import { t } from "../i18n";

export function PenDebugPage() {
  const [data, setData] = useState({ pointerType: "—", pressure: 0, tiltX: 0, tiltY: 0, x: 0, y: 0, rate: 0 });
  let previous = 0;
  return (
    <main className="debug-page">
      <Link to="/">← Notylo</Link>
      <p className="eyebrow">{t("debug.hardware")}</p>
      <h1>{t("debug.penTest")}</h1>
      <p>{t("debug.penIntro")}</p>
      <div
        className="pen-pad"
        onPointerMove={(event) => {
          const now = performance.now();
          const rate = previous ? 1000 / (now - previous) : 0;
          previous = now;
          setData({ pointerType: event.pointerType, pressure: event.pressure, tiltX: event.tiltX, tiltY: event.tiltY, x: Math.round(event.nativeEvent.offsetX), y: Math.round(event.nativeEvent.offsetY), rate: Math.round(rate) });
        }}
      >
        <span>{t("debug.testArea")}</span>
      </div>
      <dl className="debug-data">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{typeof value === "number" ? value.toFixed(key === "pressure" ? 3 : 0) : value}</dd></div>
        ))}
      </dl>
    </main>
  );
}
