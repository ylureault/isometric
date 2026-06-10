# Guide pour Claude — Insuffle Espace Collaboratif

Application Node.js (Express + Socket.io) avec client vanilla JS/Canvas servi par le serveur. Pas d'étape de build.

## Lancer en local

```bash
npm install
npm start        # http://localhost:3000
npm test         # 289 tests Jest — doivent rester verts
```

## Déployer (la base)

Il faut un hébergeur qui supporte **Node.js 18+** et les **WebSockets** (Render, Railway, Fly.io, ou un VPS).

1. **Commande de build** : `npm install` — **Commande de démarrage** : `npm start`
2. **Variables d'environnement** :
   - `PORT` — fourni automatiquement par la plupart des hébergeurs (le serveur lit `process.env.PORT`, défaut 3000)
   - `CLIENT_ORIGIN` — en production, mettre le domaine exact du site (ex. `https://espace.insuffle.com`) pour verrouiller le CORS
3. **HTTPS obligatoire** en production : le micro et le partage d'écran (WebRTC) ne marchent qu'en HTTPS. Les hébergeurs cloud le fournissent d'office; sur un VPS, mettre un reverse proxy Caddy ou nginx + Let's Encrypt devant.
4. **Persistance** : les salles sont sauvegardées sur disque dans `data/rooms/`. Pour qu'elles survivent aux redéploiements, attacher un disque persistant sur ce dossier (Render Disk, volume Fly/Railway). Sans disque, l'app marche mais les salles repartent de zéro à chaque déploiement.
5. **Vérification** : `GET /health` répond `{ status: "ok", rooms: N, uptime: … }`.

Exemple VPS minimal :

```bash
git clone https://github.com/ylureault/isometric.git && cd isometric
npm install
PORT=3000 CLIENT_ORIGIN=https://mondomaine.com npm start   # derrière Caddy/nginx en HTTPS
```
