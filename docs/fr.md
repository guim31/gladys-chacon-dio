# Chacon DiO

Pilotez depuis Gladys les appareils Wi-Fi **DiO** de Chacon, ceux que vous
installez avec l'application **DiO One** : volets roulants, prises,
interrupteurs d'éclairage et sonnette vidéo. Les changements arrivent en temps
réel, qu'ils viennent de Gladys, de l'application DiO, d'un interrupteur mural
ou d'une télécommande.

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été écrite à partir du protocole du cloud DiO tel qu'il est
> documenté publiquement, et testée sur des réponses enregistrées, pas sur de
> vrais appareils. Si quelque chose ne se passe pas comme décrit ici, dites-le
> sur le [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-chacon-dio/issues).

Intégration communautaire, **sans lien avec Chacon**. DiO et Chacon sont des
marques de leurs propriétaires.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Un compte **DiO One** (l'application des appareils DiO Wi-Fi), avec vos
  appareils déjà installés et nommés dans l'application. Ce sont ces noms que
  Gladys reprend.
- Une connexion Internet : l'intégration passe par le cloud de Chacon, comme
  l'application. Sans Internet, Gladys ne peut ni lire ni commander vos
  appareils DiO.

Les anciens appareils DiO **433 MHz** (télécommandes, prises et modules sans
Wi-Fi pilotés par la box DiO 1.0) ne passent pas par ce cloud : ils ne sont pas
concernés.

## Configuration

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**e-mail** et le **mot de passe** de
   votre compte DiO One, puis enregistrez.
3. L'état de la connexion s'affiche en haut de l'écran : « Connecté » quand le
   cloud DiO a accepté le compte.
4. Ouvrez l'onglet **Découverte** : vos appareils DiO y sont listés. Ajoutez
   ceux que vous voulez voir dans Gladys, et rangez-les dans leurs pièces.

Les autres réglages :

- **Relecture de secours** : les changements arrivent en temps réel, mais par
  sécurité tous les appareils ajoutés sont relus à cet intervalle (toutes les
  5 minutes par défaut). Une seule requête lit tous les appareils.
- **Langue des noms de fonctionnalités** : « Position », « Mouvement »,
  « Prise »… dans la langue choisie (français par défaut). Elle s'applique aux
  appareils ajoutés après le changement : Gladys fige les noms à l'ajout.

Le bouton **Lister les appareils du compte DiO** affiche tout ce que contient
votre compte, y compris les appareils que l'intégration ne prend pas encore en
charge, avec leur modèle et leur type.

## Les appareils

Chaque appareil DiO devient un appareil Gladys, avec le nom que vous lui avez
donné dans l'application DiO One.

| Appareil DiO                                | Dans Gladys                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Volet roulant (module REV-SHUTTER, CERSwd…) | **Position** de 0 % (fermé) à 100 % (ouvert), et **Mouvement** : boutons Ouvrir / Stop / Fermer, qui montrent aussi si le volet monte ou descend |
| Interrupteur d'éclairage (REV-LIGHT)        | **Éclairage** marche / arrêt                                                                                                                     |
| Prise connectée                             | **Prise** marche / arrêt                                                                                                                         |
| Sonnette vidéo                              | **Sonnerie** : « Sonne » quelques secondes à chaque coup de sonnette, puis l'heure du dernier passage                                            |

Chaque appareil porte aussi une pastille **cloud**, qui devient
**injoignable** quand le cloud DiO voit l'appareil hors ligne (Wi-Fi coupé,
disjoncteur baissé, prise débranchée) ou quand le cloud lui-même ne répond
plus.

Les variateurs, ampoules et caméras ne sont pas encore pris en charge : leur
protocole n'est pas documenté. Ils apparaissent dans le rapport du bouton
**Lister les appareils du compte DiO** ; envoyez-nous la ligne correspondante
pour qu'ils soient ajoutés.

## Widget

Le widget **Volets DiO** du tableau de bord montre tous vos volets DiO ajoutés
à Gladys d'un coup d'œil : ouvert, fermé, à 45 %, monte, descend, hors ligne.
Trois boutons commandent tous les volets à la fois : **Tout ouvrir**, **Tout
arrêter**, **Tout fermer**. C'est l'équivalent des groupes de l'application
DiO.

Pour l'ajouter : modifiez votre tableau de bord, ajoutez un widget et
choisissez **Volets DiO**. Il n'a aucun réglage.

## Déclencheur et action de scène

**Déclencheur « Appareil DiO hors ligne ou de retour »** : il se déclenche
quand le cloud DiO perd un appareil ou le retrouve. Vous pouvez le limiter à un
appareil et à un sens (« Passe hors ligne » ou « Revient en ligne »). Les
variables `device_name` (nom de l'appareil) et `state` (`offline` ou `online`)
sont disponibles dans les actions suivantes, par exemple dans un message.

**Action « Commander tous les volets DiO »** : ouvre, ferme, arrête ou envoie à
une position (0 à 100 %) tous les volets DiO ajoutés à Gladys, d'un coup. Elle
rend deux valeurs : `commanded` (volets commandés) et `failed` (volets en
échec). Si aucun volet n'a pu être commandé, l'action échoue et la scène le
note dans son historique.

Pour un seul volet, une seule prise ou un seul éclairage, utilisez les actions
habituelles de Gladys (« Contrôler un appareil », « Allumer les lumières »,
« Allumer les prises »…).

## Exemples de scènes

- **Le soir, on ferme tout** : déclencheur « A chaque coucher de soleil », action
  « Commander tous les volets DiO » avec la commande **Fermer**.
- **Le congélateur a perdu le courant** : déclencheur « Appareil DiO hors ligne
  ou de retour » sur la prise du congélateur, changement « Passe hors ligne »,
  puis un message : « La prise {{device_name}} ne répond plus : coupure de
  courant ? ».
- **On sonne au portail** : déclencheur « Changement d'état de l'appareil » sur
  la Sonnerie de la sonnette, « Si la sonnette sonne », puis « Allumer les
  lumières » de l'entrée et « Envoyer un message ».
- **Le sapin de Noël** : « A chaque coucher de soleil », « Allumer les prises »
  sur la prise du sapin ; à 23 h, « Eteindre les prises ».

## Le cloud DiO : trafic et conditions

L'intégration utilise le même service que l'application DiO One. Chacon ne
publie ni documentation ni quota pour ce service : l'intégration reste donc
sobre.

- **Une connexion** : une seule session est ouverte, puis gardée dans le dossier
  `/data` de l'intégration et réutilisée aux redémarrages. Le mot de passe n'est
  envoyé que lorsque la session doit être rouverte.
- **Une requête par relecture de secours** pour tous les appareils (toutes les
  5 minutes par défaut), une requête par commande, et une petite requête de
  contrôle quand la connexion est silencieuse depuis 4 minutes.
- **Reconnexion progressive** : après une coupure, nouvel essai au bout de
  10 s, puis 30 s, 1 min, 2 min, 5 min, et au plus toutes les 10 minutes.
- **Mot de passe refusé** : l'intégration s'arrête là et attend que vous
  enregistriez la configuration. Elle ne réessaie pas en boucle, ce qui
  pourrait bloquer votre compte.

Votre e-mail et votre mot de passe ne servent qu'à ouvrir la session auprès du
cloud de Chacon ; ils n'apparaissent jamais dans les journaux.

## Dépannage

- **« DiO refuse l'e-mail ou le mot de passe »** : vérifiez-les en vous
  connectant à l'application DiO One, corrigez-les dans la configuration, puis
  enregistrez. Enregistrer, même sans rien changer, relance la connexion.
- **« Cloud DiO injoignable »** : votre Gladys n'a pas Internet, ou le service de
  Chacon est en panne. L'intégration réessaie toute seule.
- **Un appareil manque dans Découverte** : cliquez sur **Lister les appareils du
  compte DiO**. S'il y figure avec « pas encore pris en charge », il n'est pas
  encore géré ; s'il n'y figure pas, il n'est pas sur ce compte (un appareil
  partagé par un autre compte n'apparaît que dans le compte qui l'a installé).
- **Un appareil reste « injoignable »** : le cloud DiO le voit hors ligne.
  Vérifiez dans l'application DiO One : s'il y est aussi hors ligne, c'est son
  Wi-Fi ou son alimentation.
- **Un volet ne prend pas la bonne position** : la position vient de
  l'étalonnage du module. Refaites l'étalonnage dans l'application DiO One.
- Pour plus de détails, passez le niveau des journaux en debug (variable
  `LOG_LEVEL=debug`) : chaque lecture et chaque message reçu y sont décrits.

## Limites

- Tout passe par le cloud de Chacon : sans Internet, ou si Chacon change son
  service, l'intégration ne fonctionne plus. Il n'existe pas de pilotage local
  connu des appareils DiO Wi-Fi.
- Volets, interrupteurs d'éclairage, prises et sonnette seulement. Pas de
  variateur, d'ampoule, de caméra, ni de programmation (les programmations
  faites dans l'application DiO continuent de fonctionner).
- Les noms des appareils sont repris à l'ajout dans Gladys : renommer un
  appareil dans l'application DiO ne le renomme pas dans Gladys.
- La sonnette ne donne ni image ni vidéo dans Gladys, seulement le coup de
  sonnette.
- Une porte de garage ou un portail branché sur un module de volet est vu comme
  un volet : n'automatisez pas son ouverture sans réfléchir à ce qu'une erreur
  provoquerait.
