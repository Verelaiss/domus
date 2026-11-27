BEGIN;

-- ATENÇÃO: reinicialização do banco de desenvolvimento.
-- Todos os dados dessas tabelas serão excluídos.

DO $$
BEGIN
    IF current_database() <> 'domus_db' THEN
        RAISE EXCEPTION
            'Este script só pode ser executado no banco domus_db';
    END IF;
END;
$$;

DROP TABLE IF EXISTS
    movimentacoes_estoque,
    itens_compra,
    compras,
    estabelecimentos,
    produtos
CASCADE;

-- ========================================
-- PRODUTOS
-- ========================================


CREATE TABLE produtos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    unidade_controle VARCHAR(30) NOT NULL DEFAULT 'pacote',

    pacotes_total INTEGER NOT NULL DEFAULT 0,
    pacotes_consumidos INTEGER NOT NULL DEFAULT 0,
    pacotes_em_uso INTEGER NOT NULL DEFAULT 0,
    pacotes_fechados INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT produtos_estoque_nao_negativo CHECK (
        pacotes_total >= 0
        AND pacotes_consumidos >= 0
        AND pacotes_em_uso >= 0
        AND pacotes_fechados >= 0
    ),

    CONSTRAINT produtos_um_em_uso CHECK (
        pacotes_em_uso IN (0, 1)
    ),

    CONSTRAINT produtos_estoque_consistente CHECK (
        pacotes_total =
            pacotes_consumidos +
            pacotes_em_uso +
            pacotes_fechados
    )
);

-- ========================================
-- ESTABELECIMENTOS
-- ========================================

CREATE TABLE estabelecimentos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    tipo VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_estabelecimentos_nome_unico
ON estabelecimentos (LOWER(TRIM(nome)));

-- ========================================
-- COMPRAS
-- ========================================

CREATE TABLE compras (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    estabelecimento_id INTEGER NOT NULL
        REFERENCES estabelecimentos(id),

    data_compra DATE NOT NULL,

    data_registro TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    observacoes TEXT
);

-- ========================================
-- ITENS DA COMPRA
-- ========================================

CREATE TABLE itens_compra (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    compra_id INTEGER NOT NULL
        REFERENCES compras(id),

    produto_id INTEGER NOT NULL
        REFERENCES produtos(id),

    quantidade INTEGER NOT NULL
        CHECK (quantidade > 0),

    valor_total NUMERIC(12,2) NOT NULL
        CHECK (valor_total >= 0),

    unidades_por_embalagem INTEGER
        CHECK (unidades_por_embalagem > 0),

    conteudo_por_unidade NUMERIC(10,2)
        CHECK (conteudo_por_unidade > 0),

    unidade_medida VARCHAR(20),

    CONSTRAINT itens_compra_id_produto_unique
        UNIQUE (id, produto_id)
);

-- ========================================
-- MOVIMENTAÇÕES DE ESTOQUE
-- ========================================

CREATE TABLE movimentacoes_estoque (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    produto_id INTEGER NOT NULL
        REFERENCES produtos(id),

    item_compra_id INTEGER,

    tipo VARCHAR(20) NOT NULL
        CHECK (
            tipo IN (
                'ENTRADA',
                'ABERTURA',
                'CONSUMO',
                'ESGOTAMENTO'
            )
        ),

    quantidade INTEGER NOT NULL
        CHECK (quantidade > 0),

    data_movimentacao TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT movimentacoes_item_produto_fk
        FOREIGN KEY (item_compra_id, produto_id)
        REFERENCES itens_compra(id, produto_id)
);

COMMIT;