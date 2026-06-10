# Contribuer à l'Espace Collaboratif Insuffle

Merci de prendre le temps de contribuer ! 💜 Que ce soit pour corriger une typo, signaler un bug ou proposer une fonctionnalité, votre aide est précieuse. Ce guide explique comment participer efficacement.

> 🇬🇧 **English contributors welcome.** This guide is in French, but feel free to open issues and PRs in English — we'll get along just fine.

---

## 📋 Sommaire

- [Code de conduite](#code-de-conduite)
- [Prérequis](#prérequis)
- [Mettre en place l'environnement](#mettre-en-place-lenvironnement)
- [Lancer en développement](#lancer-en-développement)
- [Lancer les tests](#lancer-les-tests)
- [Style de code](#style-de-code)
- [Convention de commits](#convention-de-commits)
- [Workflow de Pull Request](#workflow-de-pull-request)
- [Bonnes premières contributions](#bonnes-premières-contributions)
- [Où poser des questions](#où-poser-des-questions)

---

## Code de conduite

Ce projet adhère au [Code de Conduite](CODE_OF_CONDUCT.md). En participant, vous vous engagez à le respecter. Soyez bienveillant·e et respectueux·se.

---

## Prérequis

- [**Node.js 18+**](https://nodejs.org) (le projet est testé sur 18, 20 et 22)
- **npm** (fourni avec Node.js)
- **git**

---

## Mettre en place l'environnement

```bash
# 1. Forkez le dépôt sur GitHub, puis clonez votre fork
git clone https://github.com/VOTRE-UTILISATEUR/isometric.git
cd isometric

# 2. Ajoutez le dépôt original comme remote "upstream"
git remote add upstream https://github.com/ylureault/isometric.git

# 3. Installez les dépendances
npm install

# 4. (Optionnel) Copiez le fichier d'environnement
cp .env.example .env
```

---

## Lancer en développement

```bash
npm start          # démarre le serveur sur http://localhost:3000
```

Ouvrez **[http://localhost:3000](http://localhost:3000)** dans un navigateur récent (Chrome, Firefox ou Edge — l'audio et le partage d'écran reposent sur WebRTC).

> 💡 Le serveur sert directement les fichiers du client : modifiez le code dans `client/`, puis rechargez la page.

---

## Lancer les tests

Toute contribution doit garder la suite de tests **au vert** (289 tests).

```bash
npm test               # lance toute la suite Jest
npm run test:gherkin   # lance les scénarios Gherkin
```

- Ajoutez des tests pour tout **nouveau comportement** ou **correctif** (les tests vivent dans `tests/`).
- Si vous corrigez un bug, ajoutez idéalement un test qui échouait avant votre correctif.

---

## Style de code

- **Vanilla JavaScript, pas de framework.** Le client est en JS pur + Canvas 2D ; le serveur en Node.js + Express + Socket.io. Merci de ne pas introduire de dépendance lourde sans en discuter au préalable.
- **Indentation : 2 espaces** (pas de tabulations).
- Restez cohérent·e avec le style existant des fichiers que vous modifiez.
- Préférez des noms explicites et du code lisible aux astuces obscures.
- Les **constantes partagées** (limites, zoom, couleurs…) vont dans `shared/constants.js` pour rester synchronisées client/serveur.
- Pas de `console.log` oublié dans le code livré.

---

## Convention de commits

Nous suivons les [**Conventional Commits**](https://www.conventionalcommits.org/fr/). Le format :

```text
<type>(<portée optionnelle>): <description courte à l'impératif>
```

Types courants :

| Type | Usage |
| --- | --- |
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation uniquement |
| `style` | Mise en forme (espaces, formatage) sans changement de logique |
| `refactor` | Refactorisation sans changement de comportement |
| `perf` | Amélioration de performance |
| `test` | Ajout ou correction de tests |
| `chore` | Tâches diverses (config, build, dépendances) |

Exemples :

```text
feat(whiteboard): ajouter le déplacement des post-its
fix(audio): corriger le volume à la sortie de la zone de proximité
docs(readme): clarifier les variables d'environnement
test(room-manager): couvrir le nettoyage des salles vides
```

---

## Workflow de Pull Request

1. **Forkez** le dépôt et créez une **branche** dédiée depuis `main` :
   ```bash
   git checkout -b feat/ma-fonctionnalite
   ```
2. **Codez** votre changement en respectant le style ci-dessus.
3. **Ajoutez / mettez à jour les tests** et vérifiez que tout passe :
   ```bash
   npm test
   ```
4. **Committez** avec des messages conformes aux Conventional Commits.
5. **Poussez** votre branche et ouvrez une **Pull Request** vers `main` du dépôt original.
6. Remplissez le **modèle de PR** : décrivez le quoi et le pourquoi, le type de changement, confirmez que les tests passent, et joignez des **captures / GIF** si l'UI change.
7. Une **revue** suivra. Restez réactif·ve aux commentaires — on itère ensemble jusqu'au merge. 🚀

Avant de soumettre, pensez à **synchroniser** votre branche :

```bash
git fetch upstream
git rebase upstream/main
```

---

## Bonnes premières contributions

Vous débutez sur le projet ? Voici des pistes accessibles :

- 📝 Corriger des **typos** ou améliorer la documentation (README, ce guide…).
- 🌍 Améliorer les **textes bilingues** FR/EN.
- 🧪 Ajouter des **tests** sur des cas non couverts.
- 🖼️ Contribuer une **capture ou un GIF de démo** (voir la section Démo du README).
- ⌨️ Documenter ou affiner un **raccourci clavier**.
- 🐛 Piocher dans les issues étiquetées [`good first issue`](https://github.com/ylureault/isometric/labels/good%20first%20issue) ou [`help wanted`](https://github.com/ylureault/isometric/labels/help%20wanted).

N'hésitez pas à ouvrir une issue pour proposer une idée **avant** de coder une grosse fonctionnalité : on évite ainsi le travail en double.

---

## Où poser des questions

- 💬 Ouvrez une [**issue**](https://github.com/ylureault/isometric/issues) avec le label `question`.
- 🐞 Pour un bug, utilisez le modèle **Rapport de bug**.
- ✨ Pour une idée, utilisez le modèle **Demande de fonctionnalité**.

Merci encore, et bon code ! 🙌
