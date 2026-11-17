CREATE TABLE compras (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data_compra DATE NOT NULL,
    data_registro DATE NOT NULL DEFAULT CURRENT_DATE
);