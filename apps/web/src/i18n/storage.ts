import { locale } from "./index";

const messages = {
  en: {
    title: "Local storage",
    description: "Space used by Notylo and other site data stored by this browser.",
    loading: "Checking browser storage…",
    unsupported: "This browser does not expose storage usage information.",
    used: "{used} used of {quota}",
    percentage: "{percent}% used",
    persistent: "Persistent storage is enabled on this device.",
    bestEffort: "The browser may reclaim this storage if the device runs low on space.",
    nearlyFull: "Local browser storage is nearly full. Export important notebooks and free some device space."
  },
  fr: {
    title: "Stockage local",
    description: "Espace utilisé par Notylo et les autres données de ce site enregistrées par ce navigateur.",
    loading: "Vérification du stockage du navigateur…",
    unsupported: "Ce navigateur n’expose pas les informations d’utilisation du stockage.",
    used: "{used} utilisés sur {quota}",
    percentage: "{percent} % utilisés",
    persistent: "Le stockage persistant est activé sur cet appareil.",
    bestEffort: "Le navigateur peut libérer ce stockage si l’appareil manque d’espace.",
    nearlyFull: "Le stockage local du navigateur est presque plein. Exportez les cahiers importants et libérez de l’espace sur l’appareil."
  }
} as const;

export const storageMessages = messages[locale];

export function formatStorageMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template
  );
}
