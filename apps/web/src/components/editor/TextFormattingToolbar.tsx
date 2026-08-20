import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import type { TextObject } from "@notylo/document-model";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Palette, Underline } from "lucide-react";
import { t } from "../../i18n";

export type TextFormatPatch = Partial<
  Pick<TextObject, "fontFamily" | "fontSize" | "color" | "align" | "bold" | "italic" | "underline">
>;

interface Props {
  readonly object: TextObject;
  readonly x: number;
  readonly y: number;
  readonly below?: boolean;
  onChange(patch: TextFormatPatch): void;
}

const FONT_OPTIONS = [
  { label: "Newsreader", value: "Newsreader, serif" },
  { label: "Manrope", value: "Manrope, sans-serif" },
  { label: "DM Mono", value: '"DM Mono", monospace' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' }
] as const;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 144;

export function TextFormattingToolbar({ object, x, y, below = false, onChange }: Props) {
  const [fontSize, setFontSize] = useState(String(Math.round(object.fontSize)));

  useEffect(() => setFontSize(String(Math.round(object.fontSize))), [object.fontSize]);

  const commitFontSize = () => {
    const parsed = Number(fontSize);
    const next = Number.isFinite(parsed)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsed))
      : object.fontSize;
    setFontSize(String(Math.round(next)));
    if (Math.abs(next - object.fontSize) > 0.01) onChange({ fontSize: next });
  };
  const onFontSizeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setFontSize(String(Math.round(object.fontSize)));
      event.currentTarget.blur();
    }
  };

  const knownFont = FONT_OPTIONS.some((font) => font.value === object.fontFamily);

  return (
    <div
      className={`text-format-toolbar${below ? " is-below" : ""}`}
      role="toolbar"
      aria-label={t("textFormat.aria")}
      style={{ left: x, top: y } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <select
        className="text-format-font"
        aria-label={t("textFormat.fontFamily")}
        title={t("textFormat.fontFamily")}
        value={object.fontFamily}
        onChange={(event) => onChange({ fontFamily: event.target.value })}
      >
        {!knownFont && <option value={object.fontFamily}>{object.fontFamily.split(",")[0]}</option>}
        {FONT_OPTIONS.map((font) => (
          <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
            {font.label}
          </option>
        ))}
      </select>

      <input
        className="text-format-size"
        type="number"
        inputMode="numeric"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step="1"
        value={fontSize}
        aria-label={t("textFormat.fontSize")}
        title={t("textFormat.fontSize")}
        onChange={(event) => setFontSize(event.target.value)}
        onBlur={commitFontSize}
        onKeyDown={onFontSizeKeyDown}
      />

      <span className="text-format-divider" aria-hidden="true" />

      <button
        type="button"
        className="text-format-icon"
        aria-label={t("textFormat.bold")}
        title={t("textFormat.bold")}
        aria-pressed={Boolean(object.bold)}
        onClick={() => onChange({ bold: !object.bold })}
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        className="text-format-icon"
        aria-label={t("textFormat.italic")}
        title={t("textFormat.italic")}
        aria-pressed={Boolean(object.italic)}
        onClick={() => onChange({ italic: !object.italic })}
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        className="text-format-icon"
        aria-label={t("textFormat.underline")}
        title={t("textFormat.underline")}
        aria-pressed={Boolean(object.underline)}
        onClick={() => onChange({ underline: !object.underline })}
      >
        <Underline size={16} />
      </button>

      <span className="text-format-divider" aria-hidden="true" />

      <div className="text-format-align" role="group" aria-label={t("textFormat.alignment")}>
        <button
          type="button"
          className="text-format-icon"
          aria-label={t("textFormat.alignLeft")}
          title={t("textFormat.alignLeft")}
          aria-pressed={object.align === "left"}
          onClick={() => onChange({ align: "left" })}
        >
          <AlignLeft size={16} />
        </button>
        <button
          type="button"
          className="text-format-icon"
          aria-label={t("textFormat.alignCenter")}
          title={t("textFormat.alignCenter")}
          aria-pressed={object.align === "center"}
          onClick={() => onChange({ align: "center" })}
        >
          <AlignCenter size={16} />
        </button>
        <button
          type="button"
          className="text-format-icon"
          aria-label={t("textFormat.alignRight")}
          title={t("textFormat.alignRight")}
          aria-pressed={object.align === "right"}
          onClick={() => onChange({ align: "right" })}
        >
          <AlignRight size={16} />
        </button>
      </div>

      <span className="text-format-divider" aria-hidden="true" />

      <label className="text-format-color" title={t("textFormat.color")}>
        <Palette size={15} aria-hidden="true" />
        <input
          type="color"
          value={object.color}
          aria-label={t("textFormat.color")}
          onChange={(event) => onChange({ color: event.target.value })}
        />
      </label>
    </div>
  );
}
