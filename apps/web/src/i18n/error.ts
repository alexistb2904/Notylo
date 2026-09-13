import { locale } from "./index";

const messages = {
  en: {
    eyebrow: "Recovery",
    title: "Notylo hit an unexpected error",
    description: "Your local notebooks remain stored on this device. Reload the app or return to your notebook library.",
    reload: "Reload Notylo",
    home: "Back to notebooks"
  },
  fr: {
    eyebrow: "Récupération",
    title: "Notylo a rencontré une erreur inattendue",
    description: "Vos cahiers locaux restent enregistrés sur cet appareil. Rechargez l’application ou revenez à votre bibliothèque.",
    reload: "Recharger Notylo",
    home: "Retour aux cahiers"
  }
} as const;

export const errorMessages = messages[locale];
