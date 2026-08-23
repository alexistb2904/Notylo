import katex from "katex";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { DocumentObject } from "@notylo/document-model";
import type { DOMObjectUpdate } from "./types";
import { t } from "../../i18n";

export function MathCard({
  object,
  onUpdate,
  readOnly = false
}: {
  readonly object: Extract<DocumentObject, { readonly type: "math" }>;
  readonly onUpdate: DOMObjectUpdate;
  readonly readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [latex, setLatex] = useState(object.latex);
  useEffect(() => setLatex(object.latex), [object.latex]);
  const fontFamily = object.fontFamily ?? "Newsreader, serif";
  const fontSize = object.fontSize ?? 22;
  const formulaStyle = {
    color: object.color,
    fontFamily,
    fontSize,
    "--equation-font-family": fontFamily
  } as CSSProperties;
  if (editing)
    return (
      <textarea
        className="math-input"
        value={latex}
        autoFocus
        onChange={(event) => setLatex(event.target.value)}
        onBlur={() => {
          setEditing(false);
          if (latex !== object.latex)
            onUpdate(object, { ...object, latex, updatedAt: Date.now() }, t("dom.editEquation"));
        }}
        aria-label="LaTeX"
      />
    );
  try {
    return (
      <button
        type="button"
        className="math-object"
        style={formulaStyle}
        onDoubleClick={() => {
          if (!readOnly) setEditing(true);
        }}
        title={readOnly ? undefined : t("dom.editLatexHint")}
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(object.latex, {
            displayMode: object.displayMode,
            throwOnError: false
          })
        }}
      />
    );
  } catch {
    return (
      <button
        type="button"
        className="math-object math-error"
        style={formulaStyle}
        onDoubleClick={() => {
          if (!readOnly) setEditing(true);
        }}
      >
        {object.latex}
      </button>
    );
  }
}
