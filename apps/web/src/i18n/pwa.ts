import { locale } from "./index";

const messages = {
  en: {
    available: "A new version of Notylo is available.",
    update: "Update now",
    dismiss: "Later"
  },
  fr: {
    available: "Une nouvelle version de Notylo est disponible.",
    update: "Mettre à jour",
    dismiss: "Plus tard"
  }
} as const;

export const pwaMessages = messages[locale];
