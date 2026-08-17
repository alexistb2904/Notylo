# Futur emballage Tauri 2

Ce dossier réserve l’intégration Windows/Linux. Le frontend Web reste inchangé : l’adaptateur de plateforme deviendra `TauriPlatformAdapter` pour les dialogues de fichiers, le presse-papiers, les partages et les chemins locaux. IndexedDB pourra rester utilisé dans le WebView ou migrer vers un stockage local natif derrière le même contrat de repository.
