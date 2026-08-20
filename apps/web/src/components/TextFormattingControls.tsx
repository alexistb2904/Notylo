import type { TextObject } from "@notylo/document-model";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";
import { t } from "../i18n";

export type TextStylePatch = Partial<
  Pick<
    TextObject,
    "fontFamily" | "fontSize" | "fontWeight" | "italic" | "underline" | "lineHeight" | "color" | "align"
  >
>;

const FONT_OPTIONS = [
  ["Newsreader, serif", "Newsreader"],
  ["Inter, system-ui, sans-serif", "Inter / System"],
  ["Arial, sans-serif", "Arial"],
  ["Verdana, sans-serif", "Verdana"],
  ["Georgia, serif", "Georgia"],
  ['"Times New Roman", serif', "Times New Roman"],
  ['"Courier New", monospace', "Courier New"]
] as const;

export function TextFormattingControls({
  object,
  onChange
}: {
  readonly object: TextObject;
  onChange(patch: TextStylePatch): void;
}) {
  const weight = object.fontWeight ?? 400;
  const lineHeight = object.lineHeight ?? 1.35;

  return (
    <section className="settings-section text-format-settings" aria-labelledby="text-format-settings">
      <h3 id="text-format-settings">{t("text.typography")}</h3>

      <label className="property-label text-select-property">
        <span>{t("text.font")}</span>
        <select
          aria-label={t("text.font")}
          value={object.fontFamily}
          onChange={(event) => onChange({ fontFamily: event.target.value })}
        >
          {FONT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value} style={{ fontFamily: value }}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="text-format-grid">
        <label className="property-label text-number-property">
          <span>{t("text.fontSize")}</span>
          <input
            aria-label={t("text.fontSize")}
            type="number"
            min="8"
            max="144"
            step="1"
            value={Math.round(object.fontSize)}
            onChange={(event) =>
              onChange({ fontSize: Math.max(8, Math.min(144, Number(event.target.value) || 8)) })
            }
          />
        </label>
        <label className="property-label color-property text-color-property">
          <span>{t("inspector.color")}</span>
          <input
            aria-label={t("inspector.color")}
            type="color"
            value={object.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </label>
      </div>

      <div className="text-format-toolbar" role="toolbar" aria-label={t("text.style")}> 
        <button
          type="button"
          className={weight >= 600 ? "active" : ""}
          aria-label={t("text.bold")}
          aria-pressed={weight >= 600}
          title={t("text.bold")}
          onClick={() => onChange({ fontWeight: weight >= 600 ? 400 : 700 })}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          className={object.italic ? "active" : ""}
          aria-label={t("text.italic")}
          aria-pressed={Boolean(object.italic)}
          title={t("text.italic")}
          onClick={() => onChange({ italic: !object.italic })}
        >
          <Italic size={17} />
        </button>
        <button
          type="button"
          className={object.underline ? "active" : ""}
          aria-label={t("text.underline")}
          aria-pressed={Boolean(object.underline)}
          title={t("text.underline")}
          onClick={() => onChange({ underline: !object.underline })}
        >
          <Underline size={17} />
        </button>
        <span className="text-format-divider" aria-hidden="true" />
        {([
          ["left", AlignLeft, "text.alignLeft"],
          ["center", AlignCenter, "text.alignCenter"],
          ["right", AlignRight, "text.alignRight"]
        ] as const).map(([align, Icon, label]) => (
          <button
            key={align}
            type="button"
            className={object.align === align ? "active" : ""}
            aria-label={t(label)}
            aria-pressed={object.align === align}
            title={t(label)}
            onClick={() => onChange({ align })}
          >
            <Icon size={17} />
          </button>
        ))}
      </div>

      <label className="property-label text-select-property">
        <span>{t("text.lineHeight")}</span>
        <select
          aria-label={t("text.lineHeight")}
          value={lineHeight}
          onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
        >
          <option value="1">1.0</option>
          <option value="1.15">1.15</option>
          <option value="1.35">1.35</option>
          <option value="1.5">1.5</option>
          <option value="1.75">1.75</option>
          <option value="2">2.0</option>
        </select>
      </label>
      <small className="text-format-hint">{t("text.resizeHint")}</small>
    </section>
  );
}