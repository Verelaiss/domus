import os

# Deve ser definido antes de importar qualquer módulo do projeto.
os.environ["DB_NAME"] = "domus_test_db"

import pytest
from database import conectar


@pytest.fixture(autouse=True)
def limpar_banco_de_testes():
    with conectar() as conexao:
        if conexao.info.dbname != "domus_test_db":
            pytest.fail(
                "BLOQUEADO: conexão fora do banco de testes."
            )

        with conexao.cursor() as cursor:
            cursor.execute("""
                TRUNCATE TABLE
                    movimentacoes_estoque,
                    itens_compra,
                    compras,
                    produtos,
                    estabelecimentos
                RESTART IDENTITY CASCADE
            """)

    yield