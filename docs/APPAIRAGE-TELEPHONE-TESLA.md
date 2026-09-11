# Envoyer ses raccourcis du téléphone vers la Tesla

**Proposition d’évolution, non implémentée.** L’objectif est de transférer une configuration sans saisir d’adresse ni de code dans la Tesla. La recommandation est un QR de réception affiché par la voiture, associé à un petit relais temporaire. Les sauvegardes Telegra.ph existantes resteraient disponibles.

## Quatre gestes, aucune saisie

1. **Tesla :** toucher « Recevoir du téléphone » ; un QR apparaît.
2. **Téléphone :** scanner ce QR ; EvPortal ouvre la session de transfert.
3. **Téléphone :** toucher « Envoyer mes raccourcis ».
4. **Tesla :** toucher « Appliquer » après réception automatique et aperçu compact.

La validation finale évite de remplacer involontairement une configuration. La version précédente serait conservée localement pour permettre une annulation. Les deux appareils doivent disposer d’un accès Internet, sans obligation d’utiliser le même réseau Wi-Fi.

```mermaid
sequenceDiagram
    participant T as Tesla
    participant R as Relais temporaire
    participant P as Téléphone
    T->>R: Créer une réception valable 5 minutes
    T-->>P: QR scanné avec le téléphone
    P->>R: Envoyer la configuration chiffrée
    T->>R: Attendre puis récupérer le transfert
    T->>T: Valider et appliquer
    T->>R: Confirmer la réception et supprimer
```

## Deux options

| Option | Intérêt | Limites |
|---|---|---|
| **Relais éphémère dédié, recommandé** | Réception automatique, droits limités à un transfert, expiration contrôlée | Une petite API supplémentaire à déployer et maintenir |
| **Page Telegra.ph comme boîte de réception** | Réutilise le service de sauvegarde actuel | Droits d’écriture au niveau du compte, lecture publique, absence d’expiration et de consommation unique documentées |

GitHub Pages sert des fichiers HTML, CSS et JavaScript : il ne fournit pas lui-même le canal de retour entre les appareils. Un QR transporte l’adresse de la session ; il ne suffit pas à acheminer ensuite les données du téléphone vers la voiture. [Documentation GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## Architecture proposée

Un Worker avec un Durable Object pourrait gérer chaque session. Elle aurait une **durée fixe de cinq minutes**, un identifiant imprévisible et deux jetons aux droits distincts : envoyer une fois côté téléphone, recevoir côté Tesla. Aucun jeton de compte Telegra.ph ne figurerait dans le QR. Taille des données et tentatives seraient limitées ; chaque requête contrôlerait l’expiration. Un accusé de réception déclencherait la suppression, complétée par un nettoyage programmé. [TTL des Durable Objects](https://developers.cloudflare.com/durable-objects/examples/durable-object-ttl/)

Le chiffrement **AES-GCM avant transfert** est souhaité : clé générée sur la Tesla, transmise au téléphone dans le fragment du lien QR et conservée uniquement côté navigateurs. Le relais stockerait le contenu chiffré. La disponibilité de Web Crypto et le parcours complet restent à vérifier **sur une Tesla physique**. [Web Crypto](https://www.w3.org/TR/webcrypto/#aes-gcm)

Une interrogation HTTP espacée, arrêtée à expiration, suffit pour une première version. Workers KV seul est moins adapté : sa cohérence différée peut retarder la visibilité des changements de plus de 60 secondes et ne garantit pas les opérations atomiques souhaitées. [Cohérence de KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

## Pourquoi conserver Telegra.ph comme sauvegarde

`getPage` est accessible sans secret, tandis que `editPage` exige le jeton du compte. L’API ne documente ni droit limité à une page, ni suppression, ni expiration des pages, ni quota chiffré de requêtes. Sa limite de contenu est de 64 Ko. Le délai de cinq minutes de `auth_url` concerne la connexion au compte. Confier son jeton au téléphone pour modifier une boîte commune n’est pas recommandé ; le garder sur un serveur nécessiterait de nouveau un backend. [API Telegra.ph](https://telegra.ph/api)

Le parcours s’inspire du QR d’appairage décrit par OAuth Device Authorization, sans nécessiter un système OAuth complet pour ce simple transfert. WebRTC ajouterait un échange de signalisation et potentiellement des relais STUN/TURN : il ne supprime pas ce besoin de communication. [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628.html#section-3.3.1), [documentation WebRTC](https://webrtc.org/getting-started/peer-connections)
