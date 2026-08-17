import { useEffect, useState } from "react";
import { NotebookRepository } from "@notylo/persistence";

const repository = new NotebookRepository();

export function useAssetUrl(assetId: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let previous: string | undefined;
    void repository.getAsset(assetId).then((asset) => {
      if (!asset) return;
      previous = URL.createObjectURL(asset.blob);
      setUrl(previous);
    });
    return () => {
      if (previous) URL.revokeObjectURL(previous);
    };
  }, [assetId]);
  return url;
}
