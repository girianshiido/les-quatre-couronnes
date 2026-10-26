# Vérifications — 26 octobre 2026

- **66 tests passent** : économie en or et PV, maisons à 150 et arbres à 30, naissances et impôts identiques pour tous les camps, repos, usure avec distance au roi, entretien des grosses unités et perte accélérée sans or, fusion, défense royale et remparts, combat et destruction sans or, ponts d’une seule case, reconstruction, barricades, défense locale et priorité des ordres manuels, sélection excluant le roi des rectangles, sauvegardes et migrations.
- **Campagne** : 25 niveaux en cinq séries de cinq, génération asymétrique, départs confinés, validité des châteaux et maisons, monstres occasionnels sans usure naturelle, fusion, confinement et libération par une ouverture réelle, victoire indépendante des grottes.
- **TypeScript strict et build Vite** : aucune erreur ; `docs/` contient la version compilée avec chemins relatifs.
- **Navigateur de bureau, version compilée** : création de partie, campagne regroupée par thèmes et niveaux verrouillés, import JSON et reprise en pause, sélection d’un habitant qui arrête l’horloge, absence de menu avant destination, une unique action de pont sur une case d’eau accessible, reprise après ordre, aucune erreur ni alerte console. Les contrôles précédents couvrent sauvegarde, roi par clic, rectangle ignorant le roi, vitesse ×16, retour au titre avec confirmation et absence de sélection de texte.
- **Déblocage** : tests de fin de partie et contrôles antérieurs avec une sauvegarde de scénario ; la victoire ouvre le niveau suivant. Ces contrôles ne prouvent pas l’équilibrage de toutes les vallées.
- **Graphismes** : sprites en quatre directions, trois gabarits et quatre couleurs, roi couronné, cinq thèmes ; animation d’effondrement et ruines des châteaux.
- **Performance du moteur** : simulation de quatre minutes, moyenne de 1,88 ms par étape en 64 × 64 et 2,95 ms en 80 × 80 dans cet environnement. Ce sont des mesures du moteur, pas des FPS sur téléphone.

L’équilibrage complet des 25 niveaux demande des parties réelles. Téléphone physique, clavier seul, lecteurs d’écran et autres navigateurs ne sont pas validés. Les barrages ne simulent pas les crues. Le stockage est local au navigateur, sans progression lorsque l’onglet est masqué ; l’export permet le transfert d’une sauvegarde. Maximum de 150 unités par royaume, roi compris, et 100 monstres.

Publication GitHub Pages depuis `main:/docs`. Les contrôles de publication portent sur le commit déployé, le statut de construction et les fichiers HTTPS réellement servis.

Contrôles de régression supplémentaires : transmission des missions lors des fusions, groupe de huit unités dont une à 7 000 PV traversant un pont pour raser une maison, conservation du pont, reprise d’un ordre bloqué après ouverture et sauvegarde, contournement d’un arbre par les deux méthodes de recherche de chemin, expansion autonome de troupes à 100 et 7 000 PV après ouverture d’un pont, répartition des parcelles et repos des faibles unités.
