# Icônes des services

Les favicons du catalogue sont embarqués dans ce dossier pour que les raccourcis
s'affichent sans requête vers les services ou un fournisseur de favicons.
`js/icons.js` associe chaque nom d'hôte, sans le préfixe `www.`, au fichier local.
Les raccourcis personnels sans icône connue utilisent un monogramme.

La révision du 11 septembre 2026 comprend **143 images couvrant les 147
services** : PNG, JPEG et ICO, pour environ 221 Kio au total. Les quinze nouveaux
logos complètent les 128 images déjà présentes.
`sources.json` indique la source de téléchargement, l'adresse du favicon
d'origine lorsqu'elle est disponible, la date, les dimensions et le SHA-256.

Pour ajouter les icônes manquantes après une modification du catalogue :

```bash
node scripts/fetch-icons.mjs
```

Pour actualiser également les fichiers existants :

```bash
node scripts/fetch-icons.mjs --refresh
```

Ce script de maintenance consulte les favicons officiels des éditeurs et
le cache Google Favicon ; il ne fait pas partie du code exécuté dans le véhicule.
Il accepte uniquement des images raster de type et dimensions validés, ignore
les réponses HTML/SVG, impose un délai maximal et conserve les icônes connues si
le rafraîchissement échoue. Les variantes ICO supérieures à 128 px sont écartées
sans rééchantillonnage. Les logos restent ceux de leurs propriétaires respectifs
et identifient simplement les destinations ; ils ne font pas partie des créations
graphiques distribuées sous la licence du code EvPortal.
