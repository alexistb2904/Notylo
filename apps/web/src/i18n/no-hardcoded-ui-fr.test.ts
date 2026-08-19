import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["i18n/index.ts", "i18n/index.test.ts", "i18n/no-hardcoded-ui-fr.test.ts"]);
const frenchUiMarkers = [
  "Connexion requise",
  "Se connecter",
  "Nouveau cahier",
  "Mes cahiers",
  "Fermer",
  "Annuler",
  "Supprimer",
  "Déplacer",
  "Modifier",
  "Chargement",
  "Impossible",
  "Préparation",
  "Lecture seule",
  "Lecture et écriture",
  "Mot de passe",
  "Profil et sécurité",
  "Partager",
  "Exporter",
  "Importer",
  "Enregistrer",
  "Aucun cahier",
  "Créer un",
  "Ajouter une page",
  "Compte connecté",
  "Erreur de",
  "Ouvrir le",
  "Copier",
  "Réglages",
  "Propriétés",
  "Surligneur",
  "Gomme",
  "Équation",
  "Tableau",
  "Couleur",
  "Fond de page",
  "Quadrillé"
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("frontend i18n coverage", () => {
  it("keeps French UI strings inside the translation catalog", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const name = relative(srcRoot, file).replaceAll("\\", "/");
      if (ignored.has(name) || name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      const source = readFileSync(file, "utf8");
      for (const marker of frenchUiMarkers) {
        if (source.includes(marker)) violations.push(`${name}: ${marker}`);
      }
    }
    expect(violations, `Hardcoded French UI strings found:\n${violations.join("\n")}`).toEqual([]);
  });
});
