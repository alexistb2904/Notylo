# Application de bureau Notylo

Notylo est emballé avec Tauri 2 pour Windows et Linux x86_64. Le frontend reste
le même : les carnets locaux restent dans IndexedDB, et les imports, exports et
le presse-papiers utilisent les API natives lorsqu'ils sont lancés dans Tauri.

## Développer sous Windows

Installez Rust avec le toolchain MSVC, les outils **Desktop development with
C++** de Visual Studio Build Tools et WebView2, puis lancez :

```powershell
pnpm install --frozen-lockfile
pnpm dev:desktop
```

Le binaire desktop utilise `https://notes.alexistb.com/api` par défaut. Pour
un serveur privé/local, remplacez-le sans modifier le code :

```powershell
$env:NOTYLO_DESKTOP_API_URL = "http://localhost:3001"
pnpm dev:desktop
```

Le serveur public doit conserver son origine web dans `CORS_ORIGIN` et autorise
également automatiquement les origines internes Tauri (`tauri://localhost` et
`http://tauri.localhost`). Si le cloud est indisponible, l'accès hors-ligne
reste disponible et les carnets locaux ne sont pas bloqués.

Pour générer l'installateur NSIS Windows :

```powershell
pnpm build:desktop:windows
```

Le fichier `.exe` est généré dans
`apps/desktop/src-tauri/target/release/bundle/nsis/`.

## Linux et Arch

Tauri utilise WebKitGTK sous Linux. Sur Arch, les dépendances de développement
sont :

```bash
sudo pacman -Syu
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg xdotool nodejs pnpm rust
corepack enable
pnpm install --frozen-lockfile
pnpm build:desktop:linux
```

Cette commande génère un AppImage (le choix le plus portable pour Arch) et un
paquet `.deb`, dans `apps/desktop/src-tauri/target/release/bundle/`. Pour un
paquet Arch natif, lancez `makepkg -si` depuis `packaging/arch` après avoir
remplacé la source Git par le checkout ou publié le dépôt.

## Construction Linux avec Docker

La recette Docker sous `docker/tauri-linux.Dockerfile` fournit un environnement
Ubuntu 22.04 reproductible. Depuis la racine du dépôt :

```bash
docker build -f docker/tauri-linux.Dockerfile -t notylo-tauri-linux .
docker run --rm -v "$PWD:/workspace" \
  -v notylo-pnpm:/pnpm \
  -v notylo-cargo-registry:/root/.cargo/registry \
  -v notylo-cargo-git:/root/.cargo/git \
  notylo-tauri-linux
```

Les artefacts sont écrits dans `output/desktop-bundles/`; ainsi la construction
Linux n'altère ni les dépendances ni les liens `node_modules` de Windows.
Le conteneur sert à construire Linux ; l'installateur Windows doit être généré
depuis Windows afin d'utiliser les outils MSVC et WebView2.
