# Images Imagegen — 27 octobre 2026

Toutes ces sources ont été créées avec l’outil **Imagegen intégré** (aucun appel API ni clé personnelle). Les PNG originaux sont conservés ici ; les atlas de production sont dans `public/art/`. Les demandes ont été formulées en anglais pour préciser le placement des images. La planche de terrains a fait l’objet d’une seconde passe pour simplifier les sols et améliorer la lisibilité.

## Personnages — `characters.png`

Use case: stylized-concept. Production pixel-art sprite sheet for Les Quatre Couronnes. Precise 8-column, 9-row grid on genuine transparent alpha; no text, labels, grid or scenery. Polished 1990s fantasy strategy pixel art, orthographic top-down three-quarter view, not isometric; upper-left light, crisp outlines, readable at small tile sizes. Emerald green cloth, cream skin, brown leather, steel armor. Columns: front standing, front walking, back standing, back walking, left standing, left walking, right standing, right walking. Rows: regular villager soldier, stocky armored infantry, broad armored champion, small crowned king, armored crowned king, massive champion king, small purple horned monster, stronger purple monster, massive purple monster. Same identity, clothing, proportions and feet baseline within every row. Transparent margins and no overlap.

## Bâtiments — `structures.png`

Use case: stylized-concept. Production four-column, three-row game sprite sheet with genuine transparent alpha, no labels or grid. Compact squat medieval buildings, orthographic top-down three-quarter pixel art, upper-left light, warm gray stone, brown wood and emerald faction roofs/flags. Row 1: low-roof cottage, intact square four-tower castle, damaged version of the same castle, rubble ruins with fallen banner. Row 2: rocky monster cave with violet glow, horizontal short wooden bridge, vertical short wooden bridge, low stone sluice dam. Row 3: wooden barricade, unfinished bridge scaffold, unfinished barricade scaffold, tree stump. Each image, including shadow, entirely inside its cell with transparent margins. No characters or landscape.

## Terrains — `biomes.png`

Use case: stylized-concept. Production four-column, five-row equal-cell tile sheet. Each row has opaque seamless ground, isolated transparent tree, isolated transparent rock, opaque seamless water. Rows: forest/mountain, desert, snow, marsh, whimsical crystal. Muted terrain palettes so green/blue/yellow/red teams remain readable. Evergreen pine, palm/cactus, snowy pine, willow/cypress, cyan crystal spire; gray rock, sandstone, snowy rock, mossy rock, lavender crystal rock. Pixel-art fantasy strategy, no grid or text, all objects inside their cells.

## Retouche finale — `biomes-final.png`

Precise-object-edit of the previous tile sheet. Preserve exact four-column, five-row layout, identities and alignment. Simplify all ground dramatically: mostly uniform muted matte sage, tan, pale snow, dark moss or desaturated lavender, very low contrast and only a few subtle flecks. No conspicuous flowers, pebbles, bushes or high-frequency noise. Ground opaque edge-to-edge, no border or vignette. Remove backgrounds and glows around trees and rocks, retain genuine alpha and strong readable silhouettes. Calm water with a few restrained horizontal ripples. Goal: readable strategy map at 16-pixel tiles, not a richly textured landscape carpet.

## Préparation des atlas

`pnpm sprites` lance `scripts/pack-imagegen.ts` : découpage, ajustement de taille, recoloration du même modèle vert vers bleu/jaune/rouge, puis assemblage dans les repères utilisés par le moteur. Les variantes de terrain sont des copies, recadrages et symétries des sources Imagegen. La transparence est conservée. Aucun dessin procédural ne remplace les nouveaux personnages, bâtiments ou terrains dans le rendu normal.

Les sources restent indépendantes des sauvegardes. Les maisons/grottes/chantiers et terrains tiennent dans une case ; le château et ses ruines occupent trois cases sur trois. Les auras de sélection, barres de chantier, gazon de territoire et indicateurs sont des effets d’interface Canvas.
