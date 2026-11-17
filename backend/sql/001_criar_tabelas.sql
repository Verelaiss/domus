CREATE TABLE produtos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    pacotes_total INTEGER NOT NULL,
    pacotes_consumidos INTEGER NOT NULL,
    pacotes_em_uso INTEGER NOT NULL,
    pacotes_fechados INTEGER NOT NULL,

    CHECK (
        pacotes_consumidos >= 0 AND
        pacotes_total >= 0 AND
        pacotes_fechados >= 0 AND
        pacotes_em_uso >= 0
    ),

    CHECK (pacotes_em_uso IN (0, 1)),

    CHECK (
        pacotes_total = pacotes_consumidos + pacotes_em_uso + pacotes_fechados
    )
);