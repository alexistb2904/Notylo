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
      role="textbox"
      aria-multiline="true"
      style={{
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        fontWeight: object.bold ? 700 : 400,
        fontStyle: object.italic ? "italic" : "normal",
        textDecorationLine: object.underline ? "underline" : "none",
        color: object.color,
        textAlign: object.align
      }}
      onBlur={(event) => {
        const text = event.currentTarget.textContent ?? "";
        const requiredHeight = Math.ceil(event.currentTarget.scrollHeight + 6);
        const nextHeight = Math.max(object.height, requiredHeight);
        if (text !== object.plainText || nextHeight > object.height + 1)
          onUpdate(
            object,
            {
              ...object,
              html: text,
              plainText: text,
              height: nextHeight,
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
