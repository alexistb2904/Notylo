import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import type { MathObject, TextObject } from "@notylo/document-model";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Minus, Palette, Plus, Underline } from "lucide-react";
import { t } from "../../i18n";

export type TextFormatPatch = Partial<Pick<TextObject, "fontFamily" | "fontSize" | "color" | "align" | "bold" | "italic" | "underline">>;
export type MathFormatPatch = Partial<Pick<MathObject, "fontFamily" | "fontSize" | "color">>;
export type ObjectFormatPatch = TextFormatPatch | MathFormatPatch;
type FormattableObject = TextObject | MathObject;

interface Props {
  readonly object: FormattableObject;
  readonly x: number;
  readonly y: number;
  readonly below?: boolean;
  onChange(patch: ObjectFormatPatch): void;
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
const DEFAULT_FONT_FAMILY = "Newsreader, serif";
const DEFAULT_FONT_SIZE = 22;

export function TextFormattingToolbar({ object, x, y, below = false, onChange }: Props) {
  const isText = object.type === "text";
  const objectFontFamily = object.fontFamily ?? DEFAULT_FONT_FAMILY;
  const objectFontSize = object.fontSize ?? DEFAULT_FONT_SIZE;
  const [fontSize, setFontSize] = useState(String(Math.round(objectFontSize)));

  useEffect(() => setFontSize(String(Math.round(objectFontSize))), [objectFontSize]);

  const updateFontSize = (value: string) => {
    setFontSize(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE && Math.abs(parsed - objectFontSize) > 0.01)
      onChange({ fontSize: parsed });
  };

  const commitFontSize = () => {
    const parsed = Number(fontSize);
    const next = Number.isFinite(parsed)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsed))
      : objectFontSize;
    setFontSize(String(Math.round(next)));
    if (Math.abs(next - objectFontSize) > 0.01) onChange({ fontSize: next });
  };
  const onFontSizeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setFontSize(String(Math.round(objectFontSize)));
      event.currentTarget.blur();
    }
  };

  const adjustFontSize = (delta: number) => {
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(objectFontSize + delta)));
    setFontSize(String(next));
    if (next !== objectFontSize) onChange({ fontSize: next });
  };

  const knownFont = FONT_OPTIONS.some((font) => font.value === objectFontFamily);

  return (
    <div
      className={`text-format-toolbar${below ? " is-below" : ""}`}
      role="toolbar"
      aria-label={t(isText ? "textFormat.aria" : "textFormat.equationAria")}
      style={{ left: x, top: y } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <select
        className="text-format-font"
        aria-label={t("textFormat.fontFamily")}
        title={t("textFormat.fontFamily")}
        value={objectFontFamily}
        onChange={(event) => onChange({ fontFamily: event.target.value })}
      >
        {!knownFont && <option value={objectFontFamily}>{objectFontFamily.split(",")[0]}</option>}
        {FONT_OPTIONS.map((font) => (
          <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
            {font.label}
          </option>
        ))}
      </select>

      <button type="button" className="text-format-step" aria-label={t("textFormat.decreaseFontSize")} title={t("textFormat.decreaseFontSize")} onClick={() => adjustFontSize(-1)}>
        <Minus size={14} />
      </button>
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
        onChange={(event) => updateFontSize(event.target.value)}
        onBlur={commitFontSize}
        onKeyDown={onFontSizeKeyDown}
      />
      <button type="button" className="text-format-step" aria-label={t("textFormat.increaseFontSize")} title={t("textFormat.increaseFontSize")} onClick={() => adjustFontSize(1)}>
        <Plus size={14} />
      </button>

      {isText && <span className="text-format-divider" aria-hidden="true" />}

      {isText && <button
        type="button"
        className="text-format-icon"
        aria-label={t("textFormat.bold")}
        title={t("textFormat.bold")}
        aria-pressed={Boolean(object.bold)}
        onClick={() => onChange({ bold: !object.bold })}
      >
        <Bold size={16} />
      </button>}
      {isText && <button
        type="button"
        className="text-format-icon"
        aria-label={t("textFormat.italic")}
        title={t("textFormat.italic")}
        aria-pressed={Boolean(object.italic)}
        onClick={() => onChange({ italic: !object.italic })}
      >
        <Italic size={16} />
      </button>}
      {isText && <button
        type="button"
        className="text-format-icon"
        aria-label={t("textFormat.underline")}
        title={t("textFormat.underline")}
        aria-pressed={Boolean(object.underline)}
        onClick={() => onChange({ underline: !object.underline })}
      >
        <Underline size={16} />
      </button>}

      {isText && <span className="text-format-divider" aria-hidden="true" />}

      {isText && <div className="text-format-align" role="group" aria-label={t("textFormat.alignment")}>
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
      </div>}

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
