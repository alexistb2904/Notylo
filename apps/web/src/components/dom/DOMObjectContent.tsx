import type { DOMRenderableObject, DOMObjectUpdate } from "./types";
import { AssetImage, PdfCard } from "./AssetObjects";
import { EditableText } from "./EditableText";
import { MathCard } from "./MathCard";
import { NoteTable, Spreadsheet } from "./TableObjects";

export function DOMObjectContent({
  object,
  onUpdate
}: {
  readonly object: DOMRenderableObject;
  readonly onUpdate: DOMObjectUpdate;
}) {
  switch (object.type) {
    case "text":
      return <EditableText object={object} onUpdate={onUpdate} />;
    case "math":
      return <MathCard object={object} onUpdate={onUpdate} />;
    case "image":
      return <AssetImage object={object} />;
    case "pdf":
      return <PdfCard object={object} />;
    case "docx":
      return <article className="docx-object" dangerouslySetInnerHTML={{ __html: object.html }} />;
    case "table":
      return <NoteTable object={object} onUpdate={onUpdate} />;
    case "spreadsheet":
      return <Spreadsheet object={object} onUpdate={onUpdate} />;
    case "calculation":
      return (
        <div className="calculation-object">
          <span>{object.sourceLatex}</span>
          <strong>= {object.resultLatex}</strong>
        </div>
      );
  }
}
