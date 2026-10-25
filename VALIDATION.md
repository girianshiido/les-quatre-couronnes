# Vérifications — 26 octobre 2026

- **34 tests du moteur et de sélection passent** : départ à 5 000 pièces, château de neuf cases, premier chapitre à cinq maisons contre deux, espacement, naissances, usure, repos partagé, croissance, prix des actions, impôts, fusion exacte, combat, trois gabarits, roi mobile, protection royale, raids, élimination sans tuer le roi, ponts destructibles, reconstruction à 500, barricades, limites de l’autonomie, défense locale avec priorité des ordres manuels, sélection silencieuse autour du roi et sauvegarde déterministe.
- **TypeScript strict** : aucune erreur. **Build Vite** : produit `docs/` avec chemins relatifs.
- **Navigateur de bureau, version compilée** : New game, Load game, import JSON, reprise en pause, ressources et gazon coloré, roi sélectionné par clic, rectangle excluant le roi, bouton Voir le roi sans sélection, vitesse ×16, confirmation du titre et sauvegarde au retour, sélection de texte désactivée, aucune erreur ni alerte dans la console.
- **Déblocage** : au départ, chapitres 2 à 5 verrouillés ; après une victoire reproduite par un scénario de sauvegarde de test, passage au désert, chapitre 2 disponible et chapitres 3 à 5 encore verrouillés. Ce scénario contrôle la fin de partie ; ce n’est pas une preuve d’équilibrage de la campagne entière.
- **Graphismes** : planches PNG des quatre directions, trois gabarits et quatre couleurs ; rois couronnés ; rendu des cinq thèmes inspecté. Les châteaux s’écrasent en hauteur puis laissent des ruines et de la poussière lors d’une élimination.

L’équilibrage complet des cinq chapitres demande des parties réelles. Téléphone physique, clavier seul, lecteurs d’écran et autres navigateurs ne sont pas validés. Les barrages ne simulent pas les crues. Le stockage est local au navigateur, sans progression lorsque l’onglet est masqué ; l’export permet le transfert d’une sauvegarde. 150 unités simultanées au maximum par camp, roi compris.

Le dossier `docs/` est prêt pour GitHub Pages. Une version locale ou un dépôt privé ne constitue pas une publication publique vérifiée.
