import { Link } from "react-router-dom";
import { useState } from "react";
import { newInk } from "../lib/factories";
import { formatNumber, t } from "../i18n";

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
      <p className="eyebrow">{t("debug.localPerformance")}</p>
      <h1>{t("debug.engineBenchmark")}</h1>
      <p>{t("debug.benchmarkIntro")}</p>
      <div className="benchmark-actions">
        {[100, 1_000, 10_000, 50_000].map((count) => (
          <button key={count} onClick={() => generate(count)}>
            {formatNumber(count)} {t("debug.strokes")}
          </button>
        ))}
      </div>
      {amount > 0 && (
        <div className="benchmark-result">
          <strong>{formatNumber(amount)}</strong>
          <span>{t("debug.generated", { duration: duration?.toFixed(1) ?? "0.0" })}</span>
          <small>{t("debug.noHeavyRender")}</small>
        </div>
      )}
    </main>
  );
}
