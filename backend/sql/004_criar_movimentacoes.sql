-- Histórico de abertura, consumo e esgotamento do estoque

CREATE TABLE movimentacoes_estoque (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    compra_id INTEGER REFERENCES compras(id),
    tipo VARCHAR(30) NOT NULL CHECK (
        tipo IN ('ABERTURA', 'CONSUMO', 'ESGOTAMENTO')
    ),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
