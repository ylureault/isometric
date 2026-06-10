<div align="center">

# 🏙️ Insuffle — Espace Collaboratif Isométrique

**Réunions, ateliers et séminaires à distance dans un espace virtuel en vue isométrique, avec audio spatial par proximité. Sans inscription.**

[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-289%20passing-brightgreen)](#-tests)
[![CI](https://github.com/ylureault/isometric/actions/workflows/ci.yml/badge.svg)](https://github.com/ylureault/isometric/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](CONTRIBUTING.md)

[Démarrage rapide](#-démarrage-rapide) · [Fonctionnalités](#-fonctionnalités) · [Comment ça marche](#-comment-ça-marche) · [Contribuer](#-contribuer)

</div>

---

## 📖 Description

**Insuffle — Espace Collaboratif** est un outil collaboratif virtuel temps réel en **vue isométrique 3D**. Chaque participant incarne un avatar qui se déplace dans un espace (bureau, open space, salle de conférence, coworking). L'**audio est spatial** : on entend mieux les personnes proches, exactement comme dans la vraie vie. On se regroupe autour de tables, on dessine sur des tableaux blancs partagés, on lance des votes et des minuteurs, on partage son écran.

Pas de compte, pas de téléchargement : on **crée une salle**, on **partage le lien**, et les invités rejoignent en un clic.

> Propulsé par [**Insuffle**](https://www.insuffle.com) — Facilitation & Collaboration.

<details>
<summary><b>🇬🇧 English summary</b></summary>

**Insuffle — Collaborative Space** is a real-time virtual collaboration tool in an **isometric 3D view**. Each participant controls an avatar moving through a space (office, open space, conference room, coworking). **Audio is spatial**: you hear nearby people louder, just like in real life. Gather around tables, draw on shared whiteboards, run polls and timers, share your screen.

No account, no download: **create a room**, **share the link**, guests join in one click.

Stack: Node.js + Express + Socket.io (server), vanilla JS + Canvas 2D (client), WebRTC (spatial audio & screen sharing). Tests: Jest (289 tests).

```bash
git clone https://github.com/ylureault/isometric.git
cd isometric
npm install
npm start          # then open http://localhost:3000
```

See [Démarrage rapide](#-démarrage-rapide) and [CONTRIBUTING.md](CONTRIBUTING.md) for details.

</details>

---

## 🎬 Démo

<!-- TODO: GIF — Enregistrez un GIF (≈10-15s) montrant la création d'une salle, le déplacement d'un avatar et l'audio spatial. -->
<!-- Placez le fichier dans docs/demo.gif puis décommentez la ligne ci-dessous : -->
<!-- ![Démo de l'Espace Collaboratif Insuffle](docs/demo.gif) -->

> 🖼️ **Captures à venir.** Pour contribuer une démo : enregistrez un court GIF, ajoutez-le dans `docs/`, et référencez-le ici via une PR. Idéal : création de salle → avatars en mouvement → audio spatial → tableau blanc.

---

## ✨ Fonctionnalités

### 🎙️ Communication
- **Audio spatial par proximité** — le volume des voix s'ajuste selon la distance entre avatars (WebRTC). Rayon d'écoute réglable.
- **Partage d'écran** — diffusez votre écran aux participants proches (WebRTC).
- **Chat textuel** — messagerie en temps réel avec historique de salle.
- **Réactions & lever de main** — exprimez-vous rapidement, signalez que vous voulez parler (`H`).

### 🗺️ Espace & avatars
- **Vue isométrique 3D** rendue en Canvas 2D, avec **bascule en vue de dessus** (`V`).
- **4 environnements** : bureau, open space, salle de conférence, coworking (zones numérotées).
- **Personnalisation d'avatar** — peau, cheveux, t-shirt, pantalon, chaussures.
- **Grille redimensionnable** — de 10×10 à 100×100 tuiles.
- **Mini-carte** togglable (`Tab`) pour se repérer.

### 🤝 Collaboration
- **Tables de travail** — regroupez-vous, prenez des notes partagées par table.
- **Tableaux blancs collaboratifs** — traits, textes et post-its en temps réel.
- **Espaces de collaboration** dédiés au sein d'une salle.
- **Sous-salles (breakout rooms)** — portes reliées pour téléporter les participants vers des espaces séparés.
- **Votes / sondages** — lancez des décisions collectives.
- **Minuteurs** — cadencez vos ateliers (time-boxing).

### 🛠️ Animation & administration
- **Mode admin / édition** (`E`) — placez et déplacez le mobilier, organisez la salle.
- **Mode diffusion (broadcast)** — prise de parole prioritaire (`Espace`).
- **Anti-abus intégré** — limites de débit (rate limiting) côté serveur sur les positions, traits, chat, etc.
- **Nettoyage automatique** des salles vides et des participants déconnectés.

---

## 🚀 Démarrage rapide

### Prérequis
- [**Node.js 18+**](https://nodejs.org) (testé sur 18, 20 et 22)
- **npm** (fourni avec Node.js)
- Un navigateur récent (Chrome, Firefox, Edge) — l'audio et le partage d'écran reposent sur WebRTC.

### Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/ylureault/isometric.git
cd isometric

# 2. Installer les dépendances
npm install

# 3. (Optionnel) Configurer l'environnement
cp .env.example .env

# 4. Lancer le serveur
npm start
```

Ouvrez ensuite **[http://localhost:3000](http://localhost:3000)** dans votre navigateur. 🎉

> 💡 L'application est conçue pour un écran d'ordinateur large — la version mobile affiche un message d'orientation vers le bureau.

---

## 🎮 Comment ça marche

```text
1. 🏗️  Créez une salle
       → Choisissez un nom, un environnement et la taille de la grille.

2. 🔗  Partagez le lien
       → Copiez l'URL de la salle et envoyez-la par e-mail, Slack, WhatsApp…

3. 🚪  Les invités rejoignent
       → Un clic sur le lien, un pseudo, et c'est parti. Aucune inscription.

4. 🎙️  Vous collaborez
       → Déplacez votre avatar, rapprochez-vous pour discuter (audio spatial),
         dessinez, votez, partagez votre écran.
```

Chaque salle possède une **URL unique** : la partager suffit à inviter. Pas de compte, pas de mot de passe.

---

## ⌨️ Raccourcis clavier

| Touche(s) | Action |
| --- | --- |
| `Z` `Q` `S` `D` / `W` `A` `S` `D` / flèches | Déplacer l'avatar |
| `M` | Couper / réactiver le micro |
| `H` | Lever / baisser la main |
| `V` | Basculer vue isométrique ↔ vue de dessus |
| `Tab` | Afficher / masquer la mini-carte |
| `Espace` (admin) | Mode diffusion (broadcast) — maintenir pour parler |
| `E` (admin) | Activer / quitter le mode édition |
| `Ctrl`/`Cmd` + `Z` (édition) | Annuler la dernière action d'édition |
| `F` (admin) | Action d'animation rapide |
| `Échap` | Quitter le mode édition / fermer les menus et fenêtres |
| `?` | Afficher la fenêtre des raccourcis |

> Les raccourcis de déplacement supportent **AZERTY** (`Z`/`Q`/`S`/`D`), **QWERTY** (`W`/`A`/`S`/`D`) et les flèches.

---

## 🏗️ Architecture

```text
isometric/
├── server/                 # Backend Node.js + Express + Socket.io
│   ├── index.js            # Point d'entrée : HTTP, API REST, Socket.io, CORS, sécurité
│   ├── room-manager.js     # Logique des salles, tables, tableaux, votes, minuteurs…
│   └── audio-signaling.js  # Signalisation WebRTC pour l'audio spatial
├── client/                 # Frontend vanilla JS + Canvas 2D
│   ├── index.html          # Page d'accueil (création / rejoindre une salle)
│   ├── room.html           # Vue de la salle
│   ├── css/                # Styles
│   └── js/
│       ├── engine.js       # Boucle de rendu isométrique, déplacements, entrées clavier
│       ├── network.js      # Connexion Socket.io
│       ├── audio.js        # Audio spatial (WebRTC)
│       ├── screen-share.js # Partage d'écran (WebRTC)
│       ├── board.js        # Tableaux blancs collaboratifs
│       ├── character.js    # Rendu et personnalisation des avatars
│       ├── environments.js # Définition des environnements
│       ├── ui.js           # Interface (chat, votes, minuteurs, panneaux…)
│       └── ux-enhancements.js
├── shared/
│   └── constants.js        # Constantes partagées client/serveur (limites, zoom, couleurs…)
└── tests/                  # Suite Jest (289 tests) + runner Gherkin
```

**En bref** : le serveur expose une petite API REST (création / consultation de salles) et orchestre l'état temps réel via **Socket.io**. Le client rend l'espace isométrique en **Canvas 2D** et établit des connexions **WebRTC** pair-à-pair pour l'audio spatial et le partage d'écran. Les constantes communes vivent dans `shared/` pour rester synchronisées des deux côtés.

---

## ⚙️ Configuration

La configuration se fait par variables d'environnement (voir [`.env.example`](.env.example)).

| Variable | Défaut | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port d'écoute du serveur HTTP. |
| `CLIENT_ORIGIN` | `*` (dev) | Liste blanche d'origines autorisées pour CORS, séparées par des virgules. En production, renseignez les domaines exacts de votre client (ex. `https://espace.insuffle.com`). |

```bash
# Exemple en production
PORT=8080
CLIENT_ORIGIN=https://espace.insuffle.com,https://insuffle.com
```

---

## 🧪 Tests

Le projet est couvert par **289 tests** (Jest).

```bash
# Lancer toute la suite
npm test

# Lancer les scénarios Gherkin
npm run test:gherkin
```

Toute contribution doit garder la suite **au vert**. Ajoutez des tests pour tout nouveau comportement.

---

## 🤝 Contribuer

Les contributions sont les bienvenues — du correctif de typo à la nouvelle fonctionnalité ! 💜

Lisez le guide [**CONTRIBUTING.md**](CONTRIBUTING.md) pour : cloner et lancer en dev, le style de code, la convention de commits et le workflow de PR. Consultez aussi notre [**Code de Conduite**](CODE_OF_CONDUCT.md).

Vous avez trouvé une faille de sécurité ? Merci de suivre notre [**politique de sécurité**](SECURITY.md).

---

## 📜 Licence

Distribué sous licence **MIT**. Voir [`LICENSE`](LICENSE) pour le texte complet.

© 2026 Yoan Lureault / Insuffle.

<div align="center">

Made with ❤️ by [**Insuffle**](https://www.insuffle.com)

</div>
