-- OLIVIA-015: Reestruturação do módulo de compras
-- Executar somente no banco de testes.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'domus_test_db' THEN
    RAISE EXCEPTION
        'Este script só pode ser executado em domus_test_db';
    END IF;
END;
$$;

-- Limpar os registros antigos de teste
TRUNCATE TABLE movimentacoes_estoque, compras
RESTART IDENTITY;

-- Reiniciar os contadores dos produtos de teste
UPDATE produtos
SET
    pacotes_total = 0,
    pacotes_consumidos = 0,
    pacotes_em_uso = 0,
    pacotes_fechados = 0;

-- Remover a referência ao modelo antigo de compras
ALTER TABLE movimentacoes_estoque
DROP CONSTRAINT movimentacoes_estoque_compra_id_fkey;

ALTER TABLE movimentacoes_estoque
DROP COLUMN compra_id;

-- Remover a tabela antiga de compras
DROP TABLE compras;

-- Criar a nova estrutura de compras
CREATE TABLE compras (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    estabelecimento_id INTEGER NOT NULL
        REFERENCES estabelecimentos(id),

    data_compra DATE NOT NULL,

    data_registro TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    observacoes TEXT
);

-- Criar os itens de cada compra
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

-- Relacionar movimentações aos itens comprados
ALTER TABLE movimentacoes_estoque
ADD COLUMN item_compra_id INTEGER;

ALTER TABLE movimentacoes_estoque
ADD CONSTRAINT movimentacoes_item_produto_fk
FOREIGN KEY (item_compra_id, produto_id)
REFERENCES itens_compra(id, produto_id);

-- Atualizar os tipos permitidos de movimentação
ALTER TABLE movimentacoes_estoque
DROP CONSTRAINT movimentacoes_estoque_tipo_check;

ALTER TABLE movimentacoes_estoque
ADD CONSTRAINT movimentacoes_estoque_tipo_check
CHECK (
    tipo IN (
        'ENTRADA',
        'ABERTURA',
        'CONSUMO',
        'ESGOTAMENTO'
    )
);

COMMIT;