# Préférences internationales

`js/regions.js` ajoute des préférences locales à l’appareil, indépendantes de la langue d’interface et de la configuration portable. Aucune IP, géolocalisation ni donnée Tesla n’est consultée.

```js
const preferences = EVRegions.createPreferences(localStorage);
preferences.patch({ country: 'GB', contentLanguages: ['en', 'fr'] });
const completeCatalog = EVRegions.enrichCatalog(EV_CATALOG, interfaceLanguage);
const suggestions = EVRegions.applyCatalog(completeCatalog, preferences.read(), interfaceLanguage);
const visibleShortcut = EVRegions.localizedShortcut(savedShortcut, preferences.read(), interfaceLanguage);
```

- `WORLD` : tous les pays. Une liste de langues vide : toutes les langues.
- `enrichCatalog` fournit tous les services à la gestion des ajouts, avec leurs identités stables, avant le filtrage. L’opération est idempotente et ne modifie pas le catalogue original.
- `applyCatalog` copie et filtre seulement les suggestions ; ne jamais l’utiliser pour remplacer l’état enregistré du client. Les ajouts internationaux sont facultatifs (`defaultIncluded: false`).
- `localizedShortcut` conserve l’identité, les noms personnels, les favoris et les adresses personnalisées. Seule une adresse exacte parmi les variantes officielles connues peut être adaptée. Une URL avec un chemin personnel ou des paramètres supplémentaires reste intacte.
- Les destinations de `replacements` suivent les mêmes variantes afin de ne pas réintroduire une URL française après localisation.
- Les langues de contenu sont prioritaires pour les liens localisés ; l’interface sert de repli. Le pays pilote les liens de marché connus. Il n’est jamais déduit de la langue.
- Les métadonnées `editorialCountries` et `contentLanguages` sont une sélection éditoriale partielle, pas une déclaration de droits ou de disponibilité. Une donnée inconnue reste inconnue et n’exclut pas un service.
- Chaque service expose `regionInfo.availability: 'unknown'` et `teslaCompatibility: 'untested'`. Ouvrir un lien ne certifie ni la lecture, ni la disponibilité hors du territoire, ni la compatibilité Tesla.
- Les écritures sont validées strictement. Une corruption, un format futur ou un stockage refusé conserve le fonctionnement en mémoire sans remplacer le document illisible.

## Sources des premières suggestions ajoutées

Liens externes officiels, consultés le 26 octobre 2026 ; aucun flux réhébergé et aucun test sur véhicule :

- [BBC Sounds](https://www.bbc.co.uk/sounds) : sélection pour le Royaume-Uni. Le chargement n’a pas été vérifié par l’outil de consultation ; ne pas promettre une disponibilité internationale.
- [ARD Mediathek](https://www.ardmediathek.de/) : programmes audiovisuels allemands.
- [ZDFheute](https://www.zdfheute.de/) : informations du service public allemand.
- [Deutschlandfunk](https://www.deutschlandfunk.de/) : radio et podcasts allemands.
- [RTVE Play](https://www.rtve.es/play/) : programmes du service public espagnol ; redirection et catalogue variables selon le territoire.

Les catégories ne sont pas supprimées quand le filtrage ne renvoie aucune suggestion. Les services français déjà enregistrés restent accessibles quel que soit le filtre choisi.
