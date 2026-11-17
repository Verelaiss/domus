-- DOMUS-011: unidades de controle e detalhes das embalagens

BEGIN;

ALTER TABLE produtos
ADD COLUMN unidade_controle VARCHAR(30) NOT NULL DEFAULT 'pacote';

ALTER TABLE compras
ADD COLUMN unidades_por_embalagem INTEGER,
ADD COLUMN conteudo_por_unidade NUMERIC(10,2),
ADD COLUMN unidade_medida VARCHAR(20);

ALTER TABLE compras
ADD CONSTRAINT compras_unidades_por_embalagem_check
CHECK (unidades_por_embalagem > 0);

ALTER TABLE compras
ADD CONSTRAINT compras_conteudo_por_unidade_check
CHECK (conteudo_por_unidade > 0);

COMMIT;
