CREATE TABLE sensemaking_json (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255),
    tag VARCHAR(100),
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    json_data JSONB,
    language VARCHAR(255),
    active BOOLEAN,
    white_utms TEXT
);

-- Index pour améliorer les performances
CREATE INDEX idx_json_slug ON sensemaking_json(slug);
CREATE INDEX idx_json_tag ON sensemaking_json(tag);
CREATE INDEX idx_json_creation_date ON sensemaking_json(creation_date);
CREATE INDEX idx_json_data ON sensemaking_json USING GIN(json_data);
CREATE INDEX idx_json_language ON sensemaking_json(language);
CREATE INDEX idx_json_active ON sensemaking_json(active);
CREATE INDEX idx_json_white_utms ON sensemaking_json(white_utms);