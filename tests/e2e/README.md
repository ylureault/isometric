# Tests E2E (Playwright)

Vérifications visuelles et fonctionnelles réelles sous Chromium headless —
la méthode « 1500 utilisateurs » utilisée pour chaque livraison.

## Lancer

```bash
npm install playwright && npx playwright install chromium
PORT=3456 npm start &          # serveur local
node tests/e2e/parcours-complet.e2e.js   # landing → onboarding → scène → thèmes
node tests/e2e/interactions.e2e.js       # zoom, saisie chat, clic pastille tableau
node tests/e2e/panneau-admin.e2e.js      # panneau admin, onglets
```

Les captures sont écrites dans `/tmp/shots/` — à inspecter visuellement.

## Règles d'or (cf. ROADMAP.md)
1. Chaque changement visuel = capture avant/après.
2. Les parcours multi-utilisateurs se testent avec PLUSIEURS contextes
   navigateur (un par participant) — un seul contexte partage localStorage
   et reprend la session.
3. Toujours vérifier les états calculés (getComputedStyle, positions),
   pas seulement « ça n'a pas planté ».
