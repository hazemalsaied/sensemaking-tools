# Guide d'utilisation des commandes CLI

Ce document décrit les commandes CLI disponibles dans `make-cli` pour analyser, catégoriser, générer les idées et résumer les propositions d'une consultation citoyenne.

## Table des matières

- [Analyze](#analyze) - Catégorisation des propositions par thèmes
- [Ideas](#ideas) - Génération des idées abstraites d'un thème 
- [Summarize](#summarize) - Résumé et analyse complète
- [Export](#export) - Export vers la base de données PostgreSQL du dashboard Sensemaker

---

## Mais avant: Configurez!

Assurez-vous que les variables d'environnement suivantes sont configurées dans un fichier `.env` :
- Variables de connexion à la base de données PostgreSQL (voir `export_utils.ts` pour les détails)

---

## Configuration du fichier configs.json

Le fichier `configs.json` est essentiel pour le fonctionnement des commandes CLI. Il contient toutes les configurations nécessaires pour se connecter aux services externes (bases de données, Google Cloud, OpenAI, etc.).

### Structure du fichier

```json
{
  "import_db": { // nexus.dial
    "user": "nom_utilisateur",
    "password": "mot_de_passe",
    "host": "adresse_serveur",
    "database": "nom_base_de_donnees",
    "port": 5432
  },
  "export_db": { // scaleway.dial
    "provider": "postgresql",
    "host": "adresse_serveur",
    "user": "nom_utilisateur",
    "password": "mot_de_passe",
    "database": "nom_base_de_donnees",
    "port": 1113
  },
  "gcloud": {
    "project_id": "votre-projet-gcp",
    "location": "us-central1",
    "summarization_model": "gemini-2.0-flash",
    "categorization_model": "gemini-2.5-pro"
  },
  "openai": {
    "api_key": "votre-cle-api",
    "model": "gpt-4o",
    "max_tokens": 8000,
    "temperature": 0,
    "parallelism": 2
  },
  "provider": "vertex",
  "default_language": "french"
}
```



## (1.) Analyze

Le module `analyze` apprend et assigne des thèmes et sous-thèmes à un CSV de propositions.

### Description

Cette commande catégorise les propositions en leur assignant des thèmes et sous-thèmes. Le CSV de sortie contiendra tous les champs d'entrée plus de nouveaux champs `topics`, `topic` et `subtopic`.

### Format d'entrée requis

Le CSV d'entrée doit contenir les colonnes suivantes :
- `comment_text` : Le texte du commentaire
- `comment-id` : L'identifiant unique du commentaire
- `votes` : Le nombre de votes
- `agree_rate` : Le taux d'accord
- `disagree_rate` : Le taux de désaccord
- `pass_rate` : Le taux de neutralité
- `group-id` : (optionnel) L'identifiant du groupe

Il est également possible de passer le slug d'une consultation existante au lieu du fichier CSV. Dans ce cas, le module peut récupérer les données directement depuis la table `dial.proposals`.

### Paramètres

| Option | Raccourci | Description | Valeur par défaut | Requis |
|--------|-----------|-------------|-------------------|--------|
| `--inputFile` | `-i` | Le fichier CSV d'entrée | - | Non* |
| `--slug` | `-s` | Le slug pour la lecture depuis la base de données | - | Non* |
| `--level` | `-l` | Le niveau de catégorisation (profondeur des thèmes/sous-thèmes) | `2` | Non |
| `--scores` | - | Calculer les scores de pertinence pour les thèmes et sous-thèmes | `false` | Non |
| `--minTopics` | - | Nombre minimum de thèmes à générer | `10` | Non |
| `--maxTopics` | - | Nombre maximum de thèmes à générer | `17` | Non |
| `--limit` | - | Nombre maximum de propositions à récupérer depuis la base | `700` | Non |
| `--minSubtopicCount` | - | Seuil minimum d'occurrences avant de regrouper un sous-thème sous 'Other' | `5` | Non |

\* **Note** : Vous devez fournir soit `--inputFile` soit `--slug`. Si vous utilisez `--slug`, les données seront récupérées depuis la base de données.

### Exemples d'utilisation

#### Depuis un fichier CSV

```bash
npx ts-node make-cli/analyze.ts \
  --inputFile data/mon-analyse.csv \
  --level 2 \
  --minTopics 10 \
  --maxTopics 17 \
  --scores
```

#### Depuis la base de données

```bash
npx ts-node make-cli/analyze.ts \
  --slug mon-analyse \
  --level 2 \
  --limit 1000 \
  --minSubtopicCount 3
```

### Fichiers de sortie

Le fichier CSV de sortie sera créé avec le format suivant :
- Si `--inputFile` est utilisé : `{inputFile}_categorized_{timestamp}.csv`
- Si `--slug` est utilisé : `data/{slug}/{slug}_categorized_{timestamp}.csv`

Le fichier contiendra toutes les colonnes d'entrée plus :
- `topics` : Chaîne concaténée de tous les thèmes et sous-thèmes (format: `Transportation:PublicTransit;Transportation:Parking`)
- `topic` : Liste des thèmes séparés par `;`
- `subtopic` : Liste des sous-thèmes séparés par `;`

---

## (2.) Ideas

Le module `ideas` génère des idées abstraites pour chaque thème à partir de propositions catégorisées.

### Description

Cette commande génère des idées abstraites pour chaque thème et associe les propositions à ces idées. Le processus se déroule en 3 phases :
1. Génération d'idées abstraites à partir des propositions du thème
2. Catégorisation des propositions par lots selon les idées générées
3. Filtrage des idées peu représentatives (moins de X propositions)

### Format d'entrée requis

Le fichier CSV d'entrée doit contenir les champs suivants :
- `comment_text` : Le texte du commentaire
- `comment-id` : L'identifiant unique du commentaire
- `topics` : Les thèmes associés au commentaire (format: `Transportation:PublicTransit;Transportation:Parking`)

### Paramètres

| Option | Raccourci | Description | Valeur par défaut | Requis |
|--------|-----------|-------------|-------------------|--------|
| `--inputFile` | `-i` | Le fichier CSV d'entrée contenant les propositions catégorisées | - | Oui |
| `--minCommentsByTopic` | - | Nombre minimum de propositions par thème pour générer des idées | `7` | Non |
| `--maxIdeas` | - | Nombre maximum d'idées à générer par thème | `10` | Non |
| `--minProposals` | - | Nombre minimum de propositions par idée pour la conserver | `3` | Non |

### Exemples d'utilisation

```bash
npx ts-node make-cli/ideas.ts \
  --inputFile data/mon-analyse_categorized_2024-01-15.csv \
  --minCommentsByTopic 10 \
  --maxIdeas 10 \
  --minProposals 3
```

### Fichiers de sortie

Le fichier CSV de sortie sera créé avec le format : `{inputFile}_with_ideas.csv`

Le fichier contiendra toutes les colonnes d'entrée plus :
- `ideas` : Les idées associées à chaque proposition (séparées par `; `)

---

## (3.) Summarize

Le module `summarize` génère un résumé complet et une analyse structurée des propositions.

### Description

Cette commande génère un résumé complet des propositions, incluant :
- Un résumé général (overview)
- Une analyse par thème
- Des statistiques sur les idées
- Des résumés pour chaque idée

### Format d'entrée requis

Le CSV d'entrée doit contenir les colonnes suivantes :
- `comment-id` : L'identifiant unique du commentaire
- `comment_text` : Le texte du commentaire
- `votes` : Le nombre de votes
- Colonnes optionnelles pour les statistiques : `zone_name`, `score_v2_agree`, `score_v2_disagree`, `score_v2_agree_like`, `score_v2_agree_doable`, `score_v2_top`, `score_v2_controversy`

### Paramètres

| Option | Raccourci | Description | Valeur par défaut | Requis |
|--------|-----------|-------------|-------------------|--------|
| `--inputFile` | `-i` | Le fichier CSV d'entrée | - | Oui |
| `--tag` | `-t` | Tag à associer à l'analyse | - | Non |
| `--slug` | `-s` | Slug pour l'analyse | - | Oui |
| `--database` | `-d` | Persister le JSON dans PostgreSQL | `false` | Non |

### Exemples d'utilisation

#### Sans persistance en base de données

```bash
npx ts-node make-cli/summarize.ts \
  --inputFile data/mon-analyse_categorized_2024-01-15_with_ideas.csv \
  --slug mon-analyse \
  --tag v1
```

#### Avec persistance en base de données

```bash
npx ts-node make-cli/summarize.ts \
  --inputFile data/mon-analyse_categorized_2024-01-15_with_ideas.csv \
  --slug mon-analyse \
  --tag v1 \
  --database true
```

### Fichiers de sortie

Le fichier JSON de sortie sera créé avec le format : `{inputFile}_analysis_{timestamp}.json`

Le fichier JSON contient :
- `generated_at` : Date de génération
- `topics` : Liste des thèmes extraits
- `categorized_comments` : Propositions avec leurs thèmes et statistiques
- `summary` : Résumé général et analyse par thème
- `ideas` : Structure des idées avec statistiques et résumés

---

## (4.) Export

Le module `export` lit un fichier JSON et le persiste dans la base de données PostgreSQL.

### Description

Cette commande permet de sauvegarder un fichier JSON d'analyse dans la base de données PostgreSQL pour un accès ultérieur via l'interface web.

### Format d'entrée requis

Le fichier JSON doit être un fichier d'analyse valide généré par la commande `summarize`.

### Paramètres

| Option | Raccourci | Description | Valeur par défaut | Requis |
|--------|-----------|-------------|-------------------|--------|
| `--analysisFile` | `-i` | Le fichier JSON à lire et persister | - | Oui |
| `--tag` | `-t` | Tag à associer à l'analyse | - | Non |
| `--slug` | `-s` | Slug pour l'analyse | - | Oui |

### Exemples d'utilisation

```bash
npx ts-node make-cli/export.ts \
  --analysisFile data/mon-analyse_analysis_2024-01-15.json \
  --slug mon-analyse \
  --tag v1
```

### Notes importantes

1. **Sécurité** : Le fichier `configs.json` contient des informations sensibles (mots de passe, clés API). Ne le commitez jamais dans un dépôt Git public. Ajoutez-le à votre `.gitignore`.

2. **Provider** : Vous devez choisir entre `vertex` et `openai`. Les deux ne peuvent pas être utilisés simultanément.

3. **Bases de données** : Les sections `import_db` et `export_db` peuvent pointer vers la même base de données ou des bases différentes selon votre architecture.

4. **Modèles** : Les modèles Google Cloud et OpenAI ont des capacités différentes. Consultez la documentation respective pour choisir le modèle le plus adapté à vos besoins.

---

## Workflow recommandé

Voici un workflow typique pour traiter une analyse complète :

### 1. Catégorisation des propositions

```bash
# Option A : Depuis un fichier CSV
npx ts-node make-cli/analyze.ts \
  --inputFile data/mon-analyse.csv \
  --level 2 

# Option B : Depuis la base de données
npx ts-node make-cli/analyze.ts \
  --slug mon-analyse \
  --level 2 \
  --limit 1000
```

### 2. Génération des idées

```bash
npx ts-node make-cli/ideas.ts \
  --inputFile data/mon-analyse/mon-analyse_categorized_2024-01-15.csv \
  --minCommentsByTopic 7 \
  --maxIdeas 10 \
  --minProposals 3
```

### 3. Résumé et analyse complète

```bash
npx ts-node make-cli/summarize.ts \
  --inputFile data/mon-analyse/mon-analyse_categorized_2024-01-15_with_ideas.csv \
  --slug mon-analyse \
  --tag v1 \
  --database false
```

### 4. Export (si nécessaire)

Si vous n'avez pas utilisé `--database true` à l'étape 3 :

```bash
npx ts-node make-cli/export.ts \
  --analysisFile data/mon-analyse/mon-analyse_analysis_2024-01-15.json \
  --slug mon-analyse \
  --tag v1
```

---

## Notes importantes

1. **Ordre des opérations** : Il est recommandé d'exécuter les commandes dans l'ordre suivant : `analyze` → `ideas` → `summarize` → `export`

2. **Fichiers intermédiaires** : Chaque étape génère des fichiers qui servent d'entrée à l'étape suivante. Conservez ces fichiers pour pouvoir relancer le processus si nécessaire.

3. **Configuration** : Assurez-vous que le fichier `configs.json` est correctement configuré avec vos identifiants de projet (Google Cloud, OpenAI, etc.)

4. **Base de données** : Les commandes `analyze` et `summarize` peuvent lire depuis la base de données si vous utilisez l'option `--slug`. Assurez-vous que la connexion est configurée correctement.

5. **Performance** : Les opérations peuvent prendre du temps selon le nombre de propositions. Pour de grandes quantités de données, utilisez `--limit` pour limiter le nombre de propositions traitées.

6. faites attention à la langue de génération, fixée dnas le fichier de configuration

7. les paramètres de nombre de thèmes,  nombre d'idées par thème, taille minimale d'une idées ... jouent un role très important dans la lisibilité de l'analyse. 

8. Le score de pertinence ne représente aucune valeur ajoutée à l'état. à désactiver ou à tester et faire évoluer! 
