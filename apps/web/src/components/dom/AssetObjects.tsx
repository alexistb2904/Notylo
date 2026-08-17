import type { DocumentObject } from "@notylo/document-model";
import { useAssetUrl } from "./useAssetUrl";

export function AssetImage({
  object
}: {
  readonly object: Extract<DocumentObject, { readonly type: "image" }>;
}) {
  const url = useAssetUrl(object.assetId);
  return url ? (
    <img src={url} alt={object.alt} draggable={false} />
  ) : (
    <div className="asset-placeholder">Chargement de l’image…</div>
  );
}

export function PdfCard({
  object
}: {
  readonly object: Extract<DocumentObject, { readonly type: "pdf" }>;
}) {
  const url = useAssetUrl(object.assetId);
  return (
    <div className="pdf-object">
      <header>
        <span>PDF</span>
        <span>
          Page {object.pageNumber}/{object.pageCount}
        </span>
      </header>
      {url ? (
        <iframe src={`${url}#page=${object.pageNumber}`} title="Aperçu PDF" />
      ) : (
        <div className="asset-placeholder">Chargement du PDF…</div>
      )}
    </div>
  );
}
