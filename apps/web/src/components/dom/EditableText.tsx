import type { DocumentObject } from "@notylo/document-model";
import type { DOMObjectUpdate } from "./types";
import { t } from "../../i18n";

export function EditableText({
  object,
  onUpdate,
  readOnly = false
}: {
  readonly object: Extract<DocumentObject, { readonly type: "text" }>;
  readonly onUpdate: DOMObjectUpdate;
  readonly readOnly?: boolean;
}) {
  return (
    <div
      className="text-object"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={!readOnly}
      style={{
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        fontWeight: object.fontWeight ?? 400,
        fontStyle: object.italic ? "italic" : "normal",
        textDecoration: object.underline ? "underline" : "none",
        lineHeight: object.lineHeight ?? 1.35,
        color: object.color,
        textAlign: object.align,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        width: "100%",
        minWidth: 0,
        height: "100%",
        minHeight: "100%",
        outline: "none"
      }}
      onInput={(event) => {
        const host = event.currentTarget.parentElement;
        if (!host) return;
        const requiredHeight = Math.ceil(event.currentTarget.scrollHeight + 8);
        if (requiredHeight > host.clientHeight) host.style.height = `${requiredHeight}px`;
      }}
      onBlur={(event) => {
        const text = event.currentTarget.innerText.replace(/\n$/, "");
        const requiredHeight = Math.max(
          object.height,
          Math.ceil(event.currentTarget.scrollHeight + 8)
        );
        if (text !== object.plainText || requiredHeight !== object.height)
          onUpdate(
            object,
            {
              ...object,
              html: text,
              plainText: text,
              height: requiredHeight,
              updatedAt: Date.now()
            },
            t("dom.editText")
          );
      }}
    >
      {object.plainText}
    </div>
  );
}