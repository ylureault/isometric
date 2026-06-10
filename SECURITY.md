# Politique de sécurité

La sécurité de l'Espace Collaboratif Insuffle nous tient à cœur. Merci de nous aider à garder le projet et ses utilisateurs en sécurité.

## 🔒 Signaler une vulnérabilité

**Ne créez pas d'issue publique** pour une faille de sécurité. Cela exposerait le problème avant qu'un correctif ne soit disponible.

À la place, signalez la vulnérabilité **en privé** :

- 📧 Par e-mail à : **security@insuffle.com** <!-- TODO: remplacer par l'adresse de contact réelle -->
- 🔐 Ou via les [**GitHub Security Advisories**](https://github.com/ylureault/isometric/security/advisories/new) du dépôt.

Merci d'inclure, dans la mesure du possible :

- une description claire de la vulnérabilité ;
- les étapes pour la reproduire (ou un proof-of-concept) ;
- l'impact potentiel ;
- toute suggestion de correctif.

## ⏱️ Délais de réponse

- **Accusé de réception** : sous **48 heures**.
- **Évaluation initiale** : sous **7 jours**.
- **Correctif et publication** : selon la gravité, généralement sous **30 jours**.

Nous vous tiendrons informé·e de l'avancement tout au long du processus et créditerons votre contribution si vous le souhaitez.

## 🎯 Périmètre

Sont concernés par cette politique :

- le code du **serveur** (`server/`) ;
- le code du **client** (`client/`) ;
- les **constantes partagées** (`shared/`) ;
- la **configuration** liée au déploiement (CORS, variables d'environnement…).

Sont **hors périmètre** :

- les vulnérabilités des **dépendances tierces** déjà publiquement connues (signalez-les en amont au projet concerné) ;
- les attaques nécessitant un **accès physique** à la machine d'un utilisateur ;
- l'**ingénierie sociale** ;
- les rapports issus de **scanners automatiques** sans preuve d'exploitabilité.

## 🤝 Divulgation responsable

Nous suivons une approche de **divulgation responsable** : merci de nous laisser un délai raisonnable pour corriger la faille avant toute publication. Nous nous engageons à ne pas engager de poursuites contre les chercheur·se·s agissant de bonne foi dans le respect de cette politique.

Merci de contribuer à la sécurité du projet ! 🙏
