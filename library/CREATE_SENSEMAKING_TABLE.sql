CREATE TABLE sensemaking (
    id VARCHAR(255),
    source_text TEXT,
    generated_text TEXT,
    generation_type VARCHAR(100),
    slug VARCHAR(255),
    tag VARCHAR(255),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);    
    -- Indexes for better performance
 CREATE INDEX idx_slug ON sensemaking (slug);
 CREATE INDEX idx_generation_type ON sensemaking (generation_type);
 CREATE INDEX idx_tag ON sensemaking (tag);
 CREATE INDEX idx_creation_date ON sensemaking (creation_date);

-- Add comments for documentation
COMMENT ON TABLE sensemaking IS 'Table pour stocker les commentaires et résumés produits par le système de sensemaking';
COMMENT ON COLUMN sensemaking.source_text IS 'Texte source des données (ex: proposal, topic, subtopic)';
COMMENT ON COLUMN sensemaking.generated_text IS 'Texte généré par le système comme le topic d''un commentaire ou le résumé d''un topic';
COMMENT ON COLUMN sensemaking.generation_type IS 'Type de génération (topic, subtopic, general summary, topic summary, subtopic summary)';
COMMENT ON COLUMN sensemaking.slug IS 'slug ou nom alternatif pour identifier l''operation en question';
COMMENT ON COLUMN sensemaking.tag IS 'Tag pour catégoriser, versionner ou filtrer les enregistrements';