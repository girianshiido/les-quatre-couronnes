# Les Quatre Couronnes

**[Jouer dans le navigateur](https://girianshiido.github.io/les-quatre-couronnes/)**

Jeu de stratégie autonome en TypeScript et Canvas : quatre royaumes identiques, distingués par leur couleur, et un monde qui continue de vivre sans vos ordres. Vous incarnez la couronne Émeraude face à trois adversaires qui peuvent aussi se combattre entre eux.

## La campagne

**25 niveaux en cinq séries** : forêt et montagne, désert, neige, marais, forêt de cristal. Chaque victoire débloque le niveau suivant. Les cartes sont asymétriques : départs plus ouverts ou confinés, rivières, plateaux, îlots, gorges et clairières. Certaines cartes proposent des grottes facultatives.

Les nouvelles cartes vont de **64 × 64 à 80 × 80**, sans quadrillage visible. Tous les camps commencent avec **5 000 or**, un château de neuf cases et un roi de 100 PV. Le premier niveau donne **cinq maisons au joueur et deux à chaque adversaire**, avec des cours d’eau d’une case de large. Ensuite le joueur en reçoit quatre ; les adversaires quatre à six selon la série. Les règles et les impôts s’appliquent de façon identique aux quatre camps.

![Les cinq séries de vallées](public/biomes.png)

## Habitants, vie et territoire

Les habitants naissent à **100 PV**. Ils cherchent des tâches accessibles suivant votre doctrine : maisons, destruction des maisons adverses ou coupe d’arbres. Une maison ne peut jamais toucher une autre maison, même en diagonale. Les autres travaux et les assauts directs contre les rois demandent un ordre. En cas d’invasion, les habitants proches des maisons ou du château défendent leur territoire ; un ordre manuel reste prioritaire.

- **Fusion :** deux alliés qui se rencontrent additionnent leurs PV. Sur une maison, les habitants peuvent cohabiter sans fusion forcée ; l’ordre Fusionner permet de les rassembler. Les unités qui rejoignent leur roi fusionnent avec lui.
- **Combat :** entre unités ordinaires, la plus forte gagne et perd 70 % des PV du vaincu. À égalité, les deux meurent. Les combats et destructions ne coûtent pas d’or.
- **Usure :** la marche et le temps consomment des PV, même dans son propre camp. L’usure temporelle augmente avec la distance au roi et avec la taille d’une grosse unité. Sur une maison alliée, l’usure normale s’arrête, quel que soit l’ordre.
- **Repos :** quand aucun travail accessible ne reste, ou quand l’or manque, les habitants attendent sur les maisons sans fusion forcée. Un passage ouvert ou du nouveau travail les remet en activité.
- **Entretien :** au-delà de 500 PV, une unité ordinaire consomme **0,4 or par seconde pour 1 000 PV**. Si le trésor ne suffit pas, la part non financée provoque une perte pouvant atteindre **3 % de ses PV par seconde**, même sur une maison. Le roi et les monstres n’ont pas cet entretien financier.
- **Gabarits :** habitant sous 1 000 PV, guerrier de 1 000 à 10 000 inclus, colosse au-delà. Quatre directions, deux poses de marche et quatre couleurs, avec une couronne pour le roi.
- **Gazon :** il apparaît progressivement dans les huit cases autour des maisons. Détruire le gazon ennemi coûte **2 PV par case** ; raser une maison coûte **12 PV à un habitant, 8 au roi**. Aucune dépense d’or. Une autre maison peut réétendre son gazon sur le terrain.

## L’or et les constructions

| Action                                     |          Prix |
| ------------------------------------------ | ------------: |
| Maison                                     |        150 or |
| Couper un arbre                            | 30 or et 3 PV |
| Dégager un rocher                          |  3 or et 3 PV |
| Une case de pont                           |      1 000 or |
| Reconstruire cette même case de pont       |        500 or |
| Barricade                                  |        750 or |
| Transformer un pont allié libre en barrage |         32 or |

**Un ordre de pont construit exactement une case**, avec 1 000 PV. Une rivière plus large exige plusieurs ordres. Tous les camps peuvent traverser un pont ouvert ; l’ordre Attaquer permet de le détruire. Sa destruction rétablit l’eau et fait tomber les habitants qui s’y trouvent. Les anciens ponts de sauvegardes sont conservés sous forme de tronçons indépendants.

Les barricades ont 1 500 PV et bloquent la route. Les unités peuvent les contourner ou les attaquer. Les barrages sont infranchissables et rapportent 0,2 or par seconde ; cette version ne simule pas les crues.

**Impôts :** 0 % donne une naissance toutes les **6 secondes par maison**, 24 % environ toutes les **117 secondes**, 30 % toutes les **180 secondes**. Le taux augmente les revenus mais ralentit fortement les naissances, pour le joueur comme pour les adversaires. Changer le taux conserve la progression du cycle et ne libère pas de stock caché. L’automatisme ajuste le taux selon le trésor, la population et les besoins. L’option Épargner pour un chantier réserve 1 000 pièces contre les fondations automatiques.

## Le roi et la victoire

Le roi commence à 100 PV. Sa force est sa réserve personnelle augmentée de **25 % des PV de ses autres unités**. Les unités qui le rejoignent lui transmettent leurs vies. Dans les neuf cases de son château, sa force défensive est multipliée par **huit**, avec **2 000 PV de remparts** qui s’usent lors des assauts.

Dehors, le roi perd **5 % de ses PV par seconde**, au minimum 4 PV/s. Rentrer au château ou s’abriter sur une maison arrête cette usure sans soigner les dégâts. Avancer le roi peut soutenir les soldats proches, mais le rend vulnérable.

Un royaume disparaît si son roi meurt **ou s’il n’a plus aucune maison ni habitant ordinaire**, même si son roi vit encore. Son château s’effondre et laisse des ruines. La partie est gagnée lorsque les trois royaumes adverses ont disparu.

## Les grottes

Seulement certains niveaux contiennent des grottes. Leurs monstres ne gagnent pas d’argent, ne paient pas d’entretien et ne perdent pas de PV avec le temps ou la marche. Ils fusionnent et deviennent de plus en plus forts si on les laisse s’accumuler. Ils perdent des vies au combat et lorsqu’ils détruisent du gazon ou des maisons.

Ils commencent dans des zones fermées par l’eau ou une barricade. **Ouvrir un pont ou détruire une barricade peut les libérer vers les autres camps.** Détruire une grotte arrête les nouvelles sorties mais ne supprime pas les monstres existants. Les éliminer n’est pas une condition de victoire.

## Commandes et sauvegarde

1. Cliquez une unité verte ou tracez un rectangle. **Toute la simulation s’arrête.** Le roi est toujours ignoré par les rectangles ; un clic direct permet de le sélectionner seul.
2. Cliquez une destination. Les actions proposées dépendent de la case : eau accessible → seulement un pont ; maison alliée → abri ; arbre → coupe ; ennemi → attaque ; terre libre → déplacement, maison, barricade ou rassemblement.
3. Choisissez l’action pour reprendre la simulation. Échap ou Annuler retire la sélection. La pause manuelle reste prioritaire.

Molette ou +/− : zoom ; clic droit ou Alt + glisser : déplacer la carte. Le bouton ↔ permet le déplacement tactile. A sélectionne les habitants sans le roi. Vitesses **×1, ×2, ×4, ×8, ×16** ; une nouvelle partie démarre à ×1.

Un clic sur le titre en haut à gauche demande confirmation, sauvegarde et revient à **New game / Load game**. Le texte ne se sélectionne pas pendant les gestes. Sauvegarde automatique toutes les 10 secondes, bouton manuel, export/import JSON au menu. La reprise se fait en pause. Les anciennes sauvegardes conservent leur carte complète et migrent vers la nouvelle campagne.

Le jeu ne progresse pas lorsque son onglet est masqué. Le stockage dépend du navigateur et de l’adresse utilisée ; l’export permet de transférer une sauvegarde. Limites : 150 unités simultanées par camp, roi compris, et 100 monstres.

## Développer

Node.js 24 et pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm sprites
pnpm biomes
pnpm simulate
```

`src/engine.ts` : simulation déterministe et économie ; `src/monsters.ts` : grottes et monstres ; `src/orders.ts` et `src/selection.ts` : commandes ; `src/render.ts` : carte et sprites ; `src/main.ts` : interface et sauvegarde. Le build vérifie les types et produit `docs/` pour GitHub Pages. Les trajets des grandes formations sont partagés et les éléments hors champ ne sont pas dessinés. Voir `VALIDATION.md` pour les essais et leurs limites.

![Habitants, guerriers et colosses](public/sprites-atlas.png)

![Rois dans les quatre directions et couleurs](public/kings-atlas.png)

### Expansion et ordres de groupe

Sans ordre explicite, chaque habitant cherche une parcelle libre accessible à proximité, puis au-delà des passages ouverts, pour y construire une maison. Les arbres peuvent être défrichés ; la destruction des maisons adverses suit désormais votre doctrine réordonnable. Les habitants de moins de 42 PV préfèrent attendre sur une maison. Les parcelles visées sont réparties entre les habitants pour limiter les regroupements inutiles.

Une fusion conserve la mission de déplacement ou d’attaque en cours, sans entraîner le roi. Les attaques traversent les ponts du trajet ; elles ne détruisent un pont que lorsqu’il est lui-même la cible de l’ordre. Un ordre temporairement inaccessible reste en attente et reprend dès qu’un passage s’ouvre. Les chemins dégagés sont privilégiés avant ceux qui nécessitent un défrichage.

### Doctrine et installation

Le mode Personnalisée contient trois priorités réordonnables avec les boutons ↑ et ↓ : construire sur terrain libre, détruire les maisons adverses, couper les arbres. Le premier travail réalisable dans le voisinage est privilégié ; à défaut, la recherche s’élargit. L’abri sur une maison reste le recours lorsqu’il n’y a pas de travail ; sous 42 PV, le repos prime. Un changement de doctrine réoriente les unités autonomes immédiatement, sans interrompre les ordres manuels. La doctrine est conservée avec la sauvegarde et lors du passage à une autre vallée. Après un déplacement, les habitants reprennent leur activité ; seuls le roi et l’ordre explicite Tenir restent immobiles.

Le bouton Installer le jeu figure sur l’écran titre et dans l’en-tête. Dans un navigateur compatible, il déclenche l’installation ; sinon, il indique comment installer depuis le navigateur. Une fois installé, il devient ↻ et recherche les mises à jour. Une pastille dorée annonce une version prête. Le jeu sauvegarde la partie avant d’activer cette version et de recharger. Le manifeste et le service worker gardent les fichiers du jeu disponibles hors connexion après un premier chargement réussi. Les sauvegardes restent locales au navigateur utilisé.

### Profils stratégiques

Le sélecteur propose quatre doctrines : **Bâtisseur** favorise les fondations et économise pour les maisons ; **Conquérant** donne davantage d’initiatives offensives aux grosses unités en conservant du développement ; **Gardien** poste la plupart des troupes d’au moins 500 PV près des ponts ou de la frontière et réserve 750 or ; **Prudent** garde 1 000 or et abrite les habitants sous 70 PV. Les profils donnent des tendances pondérées, avec une part de hasard et des choix locaux. Les unités de plus de 1 000 PV favorisent le combat plutôt que les fondations. Le mode **Personnalisée** conserve la liste de priorités réordonnable.

Construire en priorité implique aussi d’épargner : si une parcelle libre est accessible, une coupe de moindre priorité ne doit pas absorber chaque rentrée de 30 or et empêcher d’atteindre les 150 or nécessaires. Les commandes manuelles peuvent utiliser la réserve et gardent la priorité. Prix et revenus restent inchangés.

Les quatre royaumes défendent désormais leurs maisons et leur château. Les unités d’au moins 1 000 PV peuvent réagir à une invasion distante ; une menace près du château prime sur un petit ennemi en bordure. Elles cherchent une cible accessible qu’elles peuvent vaincre. Un roi protégé dans son propre château n’est pas considéré comme un envahisseur. Les ordres manuels, dont Tenir, ne sont pas annulés.

Une mise à jour disponible ouvre maintenant une confirmation en cours de partie : « Sauvegarder et mettre à jour » ou « Annuler ». Sans validation, le jeu ne recharge pas.
