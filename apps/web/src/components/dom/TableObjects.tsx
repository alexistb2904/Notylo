import type { DocumentObject } from "@notylo/document-model";
import type { DOMObjectUpdate } from "./types";
import { t } from "../../i18n";

export function NoteTable({
  object,
  onUpdate,
  readOnly = false
}: {
  readonly object: Extract<DocumentObject, { readonly type: "table" }>;
  readonly onUpdate: DOMObjectUpdate;
  readonly readOnly?: boolean;
}) {
  return (
    <table className="note-table">
      <tbody>
        {object.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, colIndex) => (
              <td
                key={cell.id}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onBlur={(event) => {
                  const text = event.currentTarget.textContent ?? "";
                  if (text === cell.text) return;
                  const rows = object.rows.map((sourceRow, sourceRowIndex) =>
                    sourceRowIndex === rowIndex
                      ? sourceRow.map((sourceCell, sourceColIndex) =>
                          sourceColIndex === colIndex ? { ...sourceCell, text } : sourceCell
                        )
                      : sourceRow
                  );
                  onUpdate(object, { ...object, rows, updatedAt: Date.now() }, t("dom.editTable"));
                }}
                style={{
                  background:
                    cell.background ??
                    (rowIndex === 0 ? object.style.headerBackground : "transparent")
                }}
              >
                {cell.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Spreadsheet({
  object,
  onUpdate,
  readOnly = false
}: {
  readonly object: Extract<DocumentObject, { readonly type: "spreadsheet" }>;
  readonly onUpdate: DOMObjectUpdate;
  readonly readOnly?: boolean;
}) {
  const coordinates = Object.keys(object.cells);
  const maxRow = Math.max(
    0,
    ...coordinates.map((cell) => Number(cell.match(/\d+/)?.[0] ?? 1) - 1),
    7
  );
  const maxCol = Math.max(
    0,
    ...coordinates.map((cell) => (cell.match(/[A-Z]+/)?.[0] ?? "A").charCodeAt(0) - 65),
    5
  );
  const letter = (index: number) => String.fromCharCode(65 + index);
  return (
    <div className="spreadsheet-object">
      <header>{object.sheetName}</header>
      <table>
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: maxCol + 1 }, (_, index) => (
              <th key={index}>{letter(index)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRow + 1 }, (_, row) => (
            <tr key={row}>
              <th>{row + 1}</th>
              {Array.from({ length: maxCol + 1 }, (_, col) => {
                const key = `${letter(col)}${row + 1}`;
                return (
                  <td
                    key={key}
                    contentEditable={!readOnly}
                    suppressContentEditableWarning
                    onBlur={(event) => {
                      const value = event.currentTarget.textContent ?? "";
                      if (value !== String(object.cells[key] ?? ""))
                        onUpdate(
                          object,
                          {
                            ...object,
                            cells: { ...object.cells, [key]: value },
                            updatedAt: Date.now()
                          },
                          t("dom.editSheet")
                        );
                    }}
                  >
                    {object.cells[key]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
