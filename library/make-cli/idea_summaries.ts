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

// CLI module for generating summaries for ideas in JSON files.

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { VertexModel } from "../src/models/vertex_model";
import { generateAllIdeaSummaries, IdeasData } from "../src/tasks/idea_summaries";
import * as config from "../configs.json";

async function main(): Promise<void> {
    // Parse command line arguments.
    const program = new Command();
    program
        .option("-i, --inputFile <file>", "Le fichier JSON d'entrée contenant les idées.")
        .option("-o, --outputFile <file>", "Le fichier JSON de sortie (optionnel, par défaut: inputFile avec '_with_summaries' ajouté).");
    program.parse(process.argv);
    const options = program.opts();

    if (!options.inputFile) {
        console.error("❌ Erreur: Le fichier d'entrée (-i, --inputFile) est requis.");
        process.exit(1);
    }

    console.log("📖 Lecture du fichier JSON...");
    let ideasData: IdeasData;
    try {
        const fileContent = readFileSync(options.inputFile, { encoding: "utf-8" });
        ideasData = JSON.parse(fileContent) as IdeasData;
        console.log(`✓ Fichier chargé: ${options.inputFile}`);
    } catch (error) {
        console.error(`❌ Erreur lors de la lecture du fichier: ${error}`);
        process.exit(1);
    }

    // Vérifier que le fichier contient des idées
    if (!ideasData.ideas || ideasData.ideas.length === 0) {
        console.error("❌ Erreur: Le fichier JSON ne contient pas d'idées.");
        process.exit(1);
    }

    // Compter le nombre total d'idées
    const totalIdeas = ideasData.ideas.reduce(
        (sum, topic) => sum + topic.ideas.length,
        0
    );
    console.log(`📊 ${totalIdeas} idées trouvées dans ${ideasData.ideas.length} topics`);

    // Initialiser le modèle
    console.log("🤖 Initialisation du modèle LLM...");
    const model = new VertexModel(
        config.gcloud.project_id,
        "us-central1",
        config.gcloud.summarization_model
    );

    // Générer les résumés
    console.log("✨ Génération des résumés pour toutes les idées...");
    try {
        // Utiliser la langue par défaut depuis configs.json
        const language = config.default_language === "french" ? "français" : config.default_language;
        const updatedIdeasData = await generateAllIdeaSummaries(
            ideasData,
            model,
            language
        );

        // Déterminer le fichier de sortie
        const outputFile =
            options.outputFile ||
            options.inputFile.replace(".json", "_with_summaries.json");

        // Sauvegarder le résultat
        console.log(`💾 Sauvegarde du résultat dans ${outputFile}...`);
        writeFileSync(
            outputFile,
            JSON.stringify(updatedIdeasData, null, 2),
            { encoding: "utf-8" }
        );
        console.log(`✓ Résumé sauvegardé avec succès dans ${outputFile}`);
    } catch (error) {
        console.error(`❌ Erreur lors de la génération des résumés: ${error}`);
        process.exit(1);
    }
}

main();

