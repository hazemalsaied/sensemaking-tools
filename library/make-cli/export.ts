// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Lit un fichier JSON et le persiste dans la base de données PostgreSQL.
//
// Sample Usage:
//  npx ts-node ./library/make-cli/persiste.ts --analysisFile "analysis_2024-01-15.json" \
// --slug "mon-analyse" --tag "tag-optionnel"

import { Command } from "commander";
import { readFileSync } from "fs";

import {
    persistJsonToDatabase
} from "./export_utils";
import * as dotenv from "dotenv";


dotenv.config();

async function main(): Promise<void> {
    // Parse command line arguments.
    const program = new Command();
    program
        .option("-i, --analysisFile <file>", "Le fichier JSON à lire et persister.")
        .option("-t, --tag <tag>", "Tag à associer à l'analyse.")
        .option("-s, --slug <slug>", "Slug pour l'analyse.");
    program.parse(process.argv);
    const options = program.opts();

    if (!options.analysisFile) {
        console.log("Aucun fichier d'entrée spécifié. Sortie du programme.");
        process.exit(1);
    }

    if (!options.slug) {
        console.log("Aucun slug spécifié. Sortie du programme.");
        process.exit(1);
    }

    try {
        // Lire le fichier JSON
        console.log(`Lecture du fichier JSON: ${options.analysisFile}`);
        const jsonContent = readFileSync(options.analysisFile, 'utf8');

        // Valider que le contenu est un JSON valide
        JSON.parse(jsonContent);
        console.log("Fichier JSON lu et validé avec succès");

        // Persister le contenu JSON dans la base de données
        console.log('Persistance du contenu JSON dans la base de données PostgreSQL...');
        await persistJsonToDatabase(jsonContent, options.slug, options.tag);
        console.log('Persistance JSON terminée avec succès');

    } catch (error) {
        console.error('Erreur lors du traitement:', error);
        process.exit(1);
    }
}

main();
