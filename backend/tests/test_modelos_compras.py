import pytest
from pydantic import ValidationError
from decimal import Decimal
from models.compras import CompraCompletaCadastro


# TESTE 1: compra com produto já cadastrado
def test_compra_valida():
    compra = CompraCompletaCadastro(
        estabelecimento_id=1,
        data_compra="2026-11-23",
        itens=[
            {
                "produto_id": 130,
                "quantidade": 2,
                "valor_total": "48.00"
            }
        ]
    )

    assert compra.estabelecimento_id == 1
    assert compra.itens[0].quantidade == 2
    assert compra.itens[0].valor_total == Decimal("48.00")


# TESTE 2: compra com produto novo
def test_compra_com_produto_novo():
    compra = CompraCompletaCadastro(
        estabelecimento_id=1,
        data_compra="2026-11-23",
        itens=[
            {
                "nome": "Arroz",
                "categoria": "Alimentos",
                "quantidade": 3,
                "valor_total": "30.00"
            }
        ]
    )

    assert compra.itens[0].nome == "Arroz"
    assert compra.itens[0].produto_id is None

def test_compra_sem_identificacao():
    with pytest.raises(ValidationError):
        CompraCompletaCadastro(
            estabelecimento_id=1,
            data_compra="2026-11-23",
            itens=[
                {
                    "quantidade": 2,
                    "valor_total": "48.00"
                }
            ]
        )