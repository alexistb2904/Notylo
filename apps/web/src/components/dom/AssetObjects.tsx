import type { DocumentObject } from "@notylo/document-model";
import { useAssetUrl } from "./useAssetUrl";
import { t } from "../../i18n";

export function AssetImage({
  object
}: {
  readonly object: Extract<DocumentObject, { readonly type: "image" }>;
}) {
  const url = useAssetUrl(object.assetId);
  return url ? (
    <img src={url} alt={object.alt} draggable={false} />
  ) : (
    <div className="asset-placeholder">{t("dom.loadingImage")}</div>
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
        <span>{t("dom.pdfPage", { current: object.pageNumber, total: object.pageCount })}</span>
      </header>
      {url ? (
        <iframe src={`${url}#page=${object.pageNumber}`} title={t("dom.pdfPreview")} />
      ) : (
        <div className="asset-placeholder">{t("dom.loadingPdf")}</div>
      )}
    </div>
  );
}
