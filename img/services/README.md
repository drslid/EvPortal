# Icônes des services

Les favicons du catalogue sont embarqués dans ce dossier pour que les tuiles
s'affichent sans requête vers les services ou un fournisseur de favicons.
`js/icons.js` associe chaque nom d'hôte, sans le préfixe `www.`, au fichier local.
Les raccourcis personnels sans icône connue utilisent un monogramme.

La révision du 10 septembre 2026 comprend **128 images couvrant les 135
raccourcis** : PNG, JPEG et ICO, au plus 64 × 64 px et environ 162 Kio au total.
`sources.json` indique la source de téléchargement, l'adresse du favicon
d'origine lorsqu'elle est disponible, la date, les dimensions et le SHA-256.
Les images ont été décodées avec Chromium : 128 chargements réussis.

Pour ajouter les icônes manquantes après une modification du catalogue :

```bash
node scripts/fetch-icons.mjs
```

Pour actualiser également les fichiers existants :

```bash
node scripts/fetch-icons.mjs --refresh
```

Ce script de maintenance consulte Google Favicon et certains fichiers officiels
Google directement ; il ne fait pas partie du code exécuté dans le véhicule.
Il accepte uniquement des images raster de type et dimensions validés, ignore
les réponses HTML/SVG, impose un délai maximal et conserve les icônes connues si
le rafraîchissement échoue. Les variantes ICO supérieures à 128 px sont écartées
sans rééchantillonnage. Les logos restent ceux de leurs propriétaires respectifs
et identifient simplement les destinations ; ils ne font pas partie des créations
graphiques distribuées sous la licence du code EvPortal.
