# Feuille de route — Espace Collaboratif Insuffle

> L'esprit du produit : **un mode d'échange unique en son genre** — un lieu
> vivant où l'on se déplace, se regroupe et se parle naturellement.
> Chaque ajout doit servir cette sensation, avec une exigence UX/UI totale.

## ✅ Fait (v2.0)
Design « Insuffle Espace » complet (5 thèmes, chrome vitré, onboarding,
mobilier en volumes, avatars mignons), clic-pour-se-déplacer sans clic mort,
plan de salle (V) au design avec clics exacts, palette de mobilier en
glisser-déposer, rayon de parole admin visible (50 cm → 8 m), estrade qui
porte la voix à toute la salle + mute admin, espace d'écran par table,
tableaux/paperboards illimités et persistants (post-its sauvés à chaque
ajout), salles récentes, Open Graph/favicon, anti-cache définitif.

## ✅ Fait aussi (vague facilitation)
Statuts & humeur (bouton 😊 dans le dock, AFK auto 😴, badges au-dessus des
têtes), kit du facilitateur dans l'onglet Participants (🎲 répartir en
groupes vers les tables, 📣 rassembler en cercle au centre, 🎡 tirage au
sort avec projecteur, 📊 ROTI, 🌦 météo d'équipe, ⚡ boost d'énergie,
🔒 verrouillage de salle), minuteur géant au clic + gong WebAudio,
push-to-talk (touche P puis Espace maintenu), chat : liens cliquables,
couleur d'auteur, historique rejoué à l'arrivée, jeu Gendarmes & Voleurs
(rôles par graine partagée, capture par contact, prison, délivrance, 2 min).

## 🎯 Prochaine vague (specs prêtes)
- **Statuts & humeur** (#11-13) : event serveur additif `set-status {emoji}`
  relayé + stocké sur le participant; badge à côté du pseudo; AFK auto 3 min.
- **Répartition en groupes + cloche** (#71, #72) : event admin
  `admin-teleport {moves:[{socketId,x,y}]}` validé côté serveur (bornes,
  admin only) → round-robin vers les tables; cloche = tous au centre.
- **Verrouillage de salle** (#85) : `room.locked` + check joinRoom
  (créateur passe via creatorToken); bouton 🔒 dans Réglages.
- **Kit facilitation** (#61-63, 66-69) : roue de la fortune (spotlight),
  ROTI et météo = presets de votes existants; minuteur géant (clic sur la
  pastille); gong WebAudio; mode énergie (confettis + applaudissements).
- **Micro** (#4, 31, 32, 34) : test micro avec vu-mètre dans l'onboarding;
  push-to-talk opt-in (Espace, non-admin); « qui m'entend ? » au survol.
- **Chat** (#41, 45, 46, 47, 16) : liens cliquables (échapper PUIS lier),
  citation au clic, commandes /timer /vote /roti /theme /confetti,
  historique envoyé au join (room.chatHistory existe déjà côté serveur),
  couleur d'auteur = couleur du haut de l'avatar.
- **Déplacement social** (#21-23) : double-clic sur un avatar = le rejoindre;
  Maj+double-clic = le suivre; traces de pas qui s'estompent.
- **Jeu Gendarmes & Voleurs** : event relais `game-event {action,…}`
  (start admin, seed partagé → rôles 1/3-2/3, attrape par proximité <0,9
  case, prison dans un coin, délivrance par contact, 2 min, confettis).
  Client-autoritaire assumé (jeu d'ambiance, pas de triche qui compte).

## 📌 Demandés explicitement — specs prêtes (vague suivante)
- **#2 SFU audio** : migrer le mesh WebRTC vers LiveKit (cloud ou
  auto-hébergé) — indispensable au-delà de ~10 micros. Garder l'API
  Audio.updateProximity comme couche de volumes.
- **#4/#5 Périphériques + test micro** : enumerateDevices dans
  l'onboarding, vu-mètre AnalyserNode, choix mémorisé.
- **#12 Hard mute admin** : flag serveur muteLocked sur le participant,
  vérifié dans mute-changed.
- **#13 Chat par salle fermée** : champ zone dans chat-message; le client
  filtre l'affichage selon sa salle; l'historique reste global pour
  l'admin.
- **#16/#17 Renommer/redimensionner les zones** : événement additif
  update-furniture {id, label?, width?, height?} (admin), libellé
  prioritaire sur le nom musicien.
- **#22 Dissoudre une salle** : bouton admin sur la zone → admin-teleport
  des occupants vers l'open space + suppression du meuble.
- **#23 Murs iso des salles fermées** : 4 parois translucides dessinées
  en volumes (DesignFurni), porte sur le côté le plus proche du centre.
- **#25/#27/#28 Sous-salles sans onglet + vue d'ensemble + hub** : refonte
  navigation — charger une sous-salle = rejoindre une room socket sans
  recharger la page (Engine.reset + join), fil d'Ariane en room card.
- **#41-50 Gros œuvre tableaux** : export PDF (jsPDF), lasso, mode
  présentation (événement wb-follow), couleur=auteur/anonyme, undo
  suppression, double-clic=post-it, templates Lean Coffee/Speed Boat/4L,
  verrou consigne, compteur isoloir, indicateur de co-édition.
- **#52-54/#58 Facilitation** : bâton de parole (file serveur), consigne
  flottante par table (champ topic), timer par table, groupes par taille.
- **#66/#68 Caméra** : zoom vers le curseur (compenser camera lors du
  wheel), aperçu du chemin (ligne pointillée vers moveTarget).
- **#72 Rotation design** : appliquer item.rotation aux builders
  DesignFurni (échange w/d + miroir).
- **#74 Test de charge** : scénario e2e 100×100, 200 meubles, 30 bots.
- **#75 Spectateur mobile** : room.html?spectate=1 sans mobile-block,
  vue seule + chat, pas de micro.
- **#84 ✅ fait** (mentions) · **#94-97 refactor** : découpage CSS/JS par
  composant, bundler esbuild, JSDoc types stricts.
- **#99 Cache-busting auto** : middleware express qui réécrit ?v= avec
  CONSTANTS.VERSION au service du HTML.
- **#100 Quota data/** : taille max par snapshot + purge configurable
  des salles inactives > N jours.

## 🔭 Ensuite
- PiP du partage d'écran (le sien #79, celui des autres #83), pointeur
  laser (#80), partage d'onglet avec son (#84), demande de partage (#82).
- Tableaux : double-clic = post-it (#56), templates Lean Coffee/Speed Boat
  (#58), export PDF avec en-tête (#59), couleur = auteur + mode anonyme (#55),
  regroupement lasso (#53), compteur d'isoloir (#52), mode présentation (#51).
- Salle : salle d'attente (#86), transfert de propriété (#87), ouverture
  programmée (#88), récap PDF de fin (#89), duplication (#90), temps de
  parole admin (#91), corbeille mobilier (#92).
- Confort : plein écran F (#93), recadrer (#94), formes daltoniens (#95),
  navigation clavier complète (#96), prefers-reduced-motion (#97),
  reconnexion silencieuse <2 s (#98), throttle onglet caché (#99),
  easter egg avion en papier (#100).

## Règles d'or
1. Chaque ajout est **vérifié sous Chromium** (capture avant/après).
2. `npm test` reste vert; tout event serveur nouveau est **additif**.
3. Les raccourcis ne traversent jamais un overlay; aucun clic n'est mort.
4. Tout état utile survit au rechargement (vue, thème, avatar, salle).
