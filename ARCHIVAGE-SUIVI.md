# Archivage du suivi

Le bouton « Archiver les données affichées » masque les résultats antérieurs pour le profil sélectionné, sur tous ses appareils regroupés. Les scores arrivant après le clic restent visibles, y compris le même jour. Les compteurs, les moyennes et les mots à retravailler portent sur les données non archivées.

Ouvrir « Archives » puis choisir une date permet de consulter les anciennes séances et leurs scores. « Tout réafficher » retire le filtre d’archivage. Ces actions ne suppriment et ne modifient aucun score ni aucune séance.

Les journées sont regroupées dans le fuseau Europe/Paris. Les séances sont datées par leur début ; pour une séance qui continue après un archivage, la partie récente affiche le dernier signal reçu et uniquement le temps ajouté depuis l’archivage. L’ancien temps est conservé dans les archives.

## Mise en ligne

1. Mettre en ligne `dashboard.html` et le nouveau fichier `dashboard-history.js` ensemble, par le commit/push habituel du site.
2. Dans la console Firebase du projet **revisions-leo**, ouvrir **Firestore Database → Règles** : https://console.firebase.google.com/project/revisions-leo/firestore/rules
3. Ajouter le bloc `match /adminArchives/{profileUid}` du fichier `firestore.rules` à l’intérieur de `match /databases/{database}/documents`, à côté des blocs `profiles`, `sessions` et `attempts`. Conserver les autres règles déjà publiées, puis cliquer sur **Publier**. Le bloc utilise la fonction `isAdmin()` déjà présente : seul le compte administrateur peut lire ou modifier ces préférences.
4. Recharger la page de suivi. Le bouton devient disponible après la synchronisation. Sur un second appareil, ouvrir le suivi avec le même compte administrateur pour retrouver le même archivage.

La nouvelle collection `adminArchives` est créée automatiquement au premier archivage. Il n’y a pas de migration des résultats. Tant que la règle n’est pas publiée, la page conserve les résultats visibles et indique que l’archivage synchronisé est indisponible.

Les tests locaux utilisent des données fictives. Aucune donnée Firebase réelle n’a été archivée pendant le développement ; la publication des règles n’a pas été effectuée.

## Vérification du code

Avec une version récente de Node.js :

```sh
node tests/dashboard-history.test.mjs
```

Les tests couvrent la frontière exacte de l’archivage, les nouveaux scores du même jour, la poursuite d’une séance, plusieurs archivages successifs, le réaffichage, l’isolation entre profils, les données reçues tardivement et le regroupement des dates en France.
