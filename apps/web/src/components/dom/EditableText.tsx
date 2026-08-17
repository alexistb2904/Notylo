import type { DocumentObject } from "@notylo/document-model";
import type { DOMObjectUpdate } from "./types";

export function EditableText({
  object,
  onUpdate
}: {
  readonly object: Extract<DocumentObject, { readonly type: "text" }>;
  readonly onUpdate: DOMObjectUpdate;
}) {
  return (
    <div
      className="text-object"
      contentEditable
      suppressContentEditableWarning
      style={{
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        color: object.color,
        textAlign: object.align
      }}
      onBlur={(event) => {
        const text = event.currentTarget.textContent ?? "";
        if (text !== object.plainText)
          onUpdate(
            object,
            { ...object, html: text, plainText: text, updatedAt: Date.now() },
            "Modifier le texte"
          );
      }}
    >
      {object.plainText}
    </div>
  );
}
