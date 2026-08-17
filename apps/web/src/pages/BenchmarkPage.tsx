import { Link } from "react-router-dom";
import { useState } from "react";
import { newInk } from "../lib/factories";

export function BenchmarkPage() {
  const [amount, setAmount] = useState(0);
  const [duration, setDuration] = useState<number>();
  const generate = (count: number) => {
    const start = performance.now();
    const objects = Array.from({ length: count }, (_, index) =>
      newInk({
        notebookId: "benchmark",
        x: index % 800,
        y: (index * 17) % 1200,
        width: 12,
        height: 12,
        zIndex: index,
        points: [
          { x: 0, y: 0, pressure: 0.5, timestamp: Date.now() },
          { x: 12, y: 12, pressure: 0.5, timestamp: Date.now() }
        ],
        color: "#171717",
        size: 2,
        tool: "pen"
      })
    );
    setAmount(objects.length);
    setDuration(performance.now() - start);
  };
  return (
    <main className="debug-page">
      <Link to="/">← Notylo</Link>
      <p className="eyebrow">Performance locale</p>
      <h1>Benchmark du moteur</h1>
      <p>
        Génère des strokes synthétiques en mémoire pour détecter une régression de l’architecture.
      </p>
      <div className="benchmark-actions">
        {[100, 1_000, 10_000, 50_000].map((count) => (
          <button key={count} onClick={() => generate(count)}>
            {count.toLocaleString("fr-FR")} strokes
          </button>
        ))}
      </div>
      {amount > 0 && (
        <div className="benchmark-result">
          <strong>{amount.toLocaleString("fr-FR")}</strong>
          <span>objets générés en {duration?.toFixed(1)} ms</span>
          <small>La visualisation lourde n’est volontairement pas montée dans React.</small>
        </div>
      )}
    </main>
  );
}
