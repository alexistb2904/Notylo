import { HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import { locale } from "../i18n";
import { formatStorageMessage, storageMessages } from "../i18n/storage";
import "./StorageStatusCard.css";

interface StorageStatus {
  readonly usage: number;
  readonly quota: number;
  readonly persisted?: boolean;
}

export function StorageStatusCard() {
  const [status, setStatus] = useState<StorageStatus>();
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      if (!navigator.storage?.estimate) {
        if (active) setSupported(false);
        return;
      }
      try {
        const estimate = await navigator.storage.estimate();
        if (!active) return;
        const usage = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;
        const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : undefined;
        if (active) setStatus({ usage, quota, persisted });
      } catch {
        if (active) setSupported(false);
      }
    };

    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const ratio = status?.quota ? status.usage / status.quota : 0;
  const percent = Math.min(100, Math.round(ratio * 100));
  const nearlyFull = ratio >= 0.8;

  return (
    <section className="profile-card profile-card-wide storage-status-card" aria-labelledby="profile-storage-title">
      <div className="profile-card-heading">
        <HardDrive size={19} />
        <div>
          <h2 id="profile-storage-title">{storageMessages.title}</h2>
          <p>{storageMessages.description}</p>
        </div>
      </div>

      {!supported ? (
        <p className="profile-muted">{storageMessages.unsupported}</p>
      ) : !status ? (
        <p className="profile-muted" role="status">{storageMessages.loading}</p>
      ) : (
        <div className="storage-status-details">
          <div className="storage-status-summary">
            <strong>
              {formatStorageMessage(storageMessages.used, {
                used: formatBytes(status.usage),
                quota: formatBytes(status.quota)
              })}
            </strong>
            <span>{formatStorageMessage(storageMessages.percentage, { percent })}</span>
          </div>
          <progress
            className="storage-status-progress"
            max={status.quota || 1}
            value={status.usage}
            aria-label={formatStorageMessage(storageMessages.percentage, { percent })}
          />
          <p className={`profile-muted${nearlyFull ? " storage-status-warning" : ""}`}>
            {nearlyFull
              ? storageMessages.nearlyFull
              : status.persisted
                ? storageMessages.persistent
                : storageMessages.bestEffort}
          </p>
        </div>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[exponent]}`;
}
