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
