import { Link } from "react-router-dom";
import { useState } from "react";

export function PenDebugPage() {
  const [data, setData] = useState({
    pointerType: "—",
    pressure: 0,
    tiltX: 0,
    tiltY: 0,
    x: 0,
    y: 0,
    rate: 0
  });
  let previous = 0;
  return (
    <main className="debug-page">
      <Link to="/">← Notylo</Link>
      <p className="eyebrow">Diagnostic matériel</p>
      <h1>Test du stylet</h1>
      <p>Écrivez ou effleurez la zone. Ces informations restent dans cette page.</p>
      <div
        className="pen-pad"
        onPointerMove={(event) => {
          const now = performance.now();
          const rate = previous ? 1000 / (now - previous) : 0;
          previous = now;
          setData({
            pointerType: event.pointerType,
            pressure: event.pressure,
            tiltX: event.tiltX,
            tiltY: event.tiltY,
            x: Math.round(event.nativeEvent.offsetX),
            y: Math.round(event.nativeEvent.offsetY),
            rate: Math.round(rate)
          });
        }}
      >
        <span>Zone de test</span>
      </div>
      <dl className="debug-data">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{typeof value === "number" ? value.toFixed(key === "pressure" ? 3 : 0) : value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
