"""Testes de integração de produtos, estoque e compras da OLIVIA V1.

Pré-requisitos:
- conftest.py deve definir DB_NAME=domus_test_db antes de importar a aplicação;
- a fixture autouse do conftest deve limpar as tabelas de teste antes de cada caso;
- domus_test_db deve possuir o esquema atual (incluindo itens_compra).
"""

import unicodedata

import pytest
from fastapi.testclient import TestClient

from database import conectar
from main import app


client = TestClient(app)
DATA_COMPRA = "2026-11-13"
ESTABELECIMENTO = "Mercado de Testes"


@pytest.fixture(autouse=True)
def confirmar_banco_exclusivo_de_testes():
    """Bloqueia requisições se a aplicação não estiver no banco dedicado."""
    with conectar() as conexao:
        assert conexao.info.dbname == "domus_test_db", (
            "BLOQUEADO: os testes só podem usar domus_test_db."
        )


def exigir_sucesso(resposta):
    assert resposta.status_code in (200, 201), resposta.text
    return resposta.json()


def listar_produtos():
    resposta = client.get("/produtos")
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def listar_compras():
    resposta = client.get("/compras")
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def listar_reposicao():
    resposta = client.get("/lista-compras")
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def buscar_produto_por_id(produto_id):
    return next((produto for produto in listar_produtos() if produto["id"] == produto_id), None)


def normalizar_nome(nome):
    texto = unicodedata.normalize("NFD", nome)
    return " ".join(
        "".join(caractere for caractere in texto if unicodedata.category(caractere) != "Mn")
        .casefold()
        .split()
    )


def buscar_produto_por_nome(nome):
    chave = normalizar_nome(nome)
    return next(
        (produto for produto in listar_produtos() if normalizar_nome(produto["nome"]) == chave),
        None,
    )


def cadastrar_produto(nome="Arroz", categoria="Alimentos", unidade_controle="pacote"):
    resposta = client.post(
        "/produtos",
        json={
            "nome": nome,
            "categoria": categoria,
            "unidade_controle": unidade_controle,
        },
    )
    return exigir_sucesso(resposta)


def registrar_compra(itens, estabelecimento=ESTABELECIMENTO, data=DATA_COMPRA):
    """Formato oficial da API V1: uma compra pode conter vários itens."""
    return client.post(
        "/compras",
        json={
            "estabelecimento_nome": estabelecimento,
            "data_compra": data,
            "itens": itens,
        },
    )


def item_novo(nome, quantidade, categoria="Alimentos", unidade_controle="pacote", **extras):
    return {
        "nome": nome,
        "categoria": categoria,
        "unidade_controle": unidade_controle,
        "quantidade": quantidade,
        "valor_total": "15.90",
        **extras,
    }


def item_existente(produto_id, quantidade, **extras):
    return {
        "produto_id": produto_id,
        "quantidade": quantidade,
        "valor_total": "15.90",
        **extras,
    }


def primeira_compra(nome="Arroz", quantidade=5, categoria="Alimentos", unidade_controle="pacote", **extras):
    resposta = registrar_compra(
        [item_novo(nome, quantidade, categoria, unidade_controle, **extras)]
    )
    exigir_sucesso(resposta)
    produto = buscar_produto_por_nome(nome)
    assert produto is not None, f"Produto {nome!r} não encontrado após a compra."
    return produto


def comprar(produto_id, quantidade, **extras):
    return registrar_compra([item_existente(produto_id, quantidade, **extras)])


def consumir(produto_id):
    return client.post("/produtos/consumir", json={"produto_id": produto_id})


def verificar_estoque(produto_id, *, total, consumidos, em_uso, fechados):
    produto = buscar_produto_por_id(produto_id)
    assert produto is not None
    assert produto["pacotes_total"] == total
    assert produto["pacotes_consumidos"] == consumidos
    assert produto["pacotes_em_uso"] == em_uso
    assert produto["pacotes_fechados"] == fechados
    return produto


def test_listar_produtos():
    assert listar_produtos() == []


def test_cadastrar_produto():
    produto = cadastrar_produto("Feijão")
    assert produto["nome"] == "Feijão"
    verificar_estoque(produto["id"], total=0, consumidos=0, em_uso=0, fechados=0)


def test_cadastrar_produto_sem_estoque():
    produto = cadastrar_produto("Açúcar")
    assert produto["nome"] == "Açúcar"
    verificar_estoque(produto["id"], total=0, consumidos=0, em_uso=0, fechados=0)


def test_consumir_pacote():
    produto = primeira_compra("Café", 3)
    resposta = consumir(produto["id"])
    exigir_sucesso(resposta)
    verificar_estoque(produto["id"], total=3, consumidos=1, em_uso=1, fechados=1)


def test_consumir_ultimo_pacote():
    produto = primeira_compra("Café", 1)
    exigir_sucesso(consumir(produto["id"]))
    verificar_estoque(produto["id"], total=1, consumidos=1, em_uso=0, fechados=0)
    assert consumir(produto["id"]).status_code == 409
    verificar_estoque(produto["id"], total=1, consumidos=1, em_uso=0, fechados=0)


def test_registrar_compra():
    produto = primeira_compra("Arroz", 2)
    exigir_sucesso(comprar(produto["id"], 3))
    verificar_estoque(produto["id"], total=5, consumidos=0, em_uso=1, fechados=4)
    assert len(listar_compras()) == 2


def test_repor_estoque_zerado():
    produto = primeira_compra("Café", 1)
    exigir_sucesso(consumir(produto["id"]))
    exigir_sucesso(comprar(produto["id"], 3))
    verificar_estoque(produto["id"], total=4, consumidos=1, em_uso=1, fechados=2)


def test_comprar_produto_inexistente():
    resposta = comprar(999999, 3)
    assert resposta.status_code == 404, resposta.text
    assert listar_compras() == []


def test_comprar_quantidade_invalida():
    produto = primeira_compra("Arroz", 2)
    resposta = comprar(produto["id"], 0)
    assert resposta.status_code == 422, resposta.text
    verificar_estoque(produto["id"], total=2, consumidos=0, em_uso=1, fechados=1)
    assert len(listar_compras()) == 1


def test_produto_sem_estoque_entra_na_lista():
    produto = cadastrar_produto("Farinha de trigo")
    lista = listar_reposicao()
    assert len(lista) == 1
    assert lista[0]["id"] == produto["id"]
    assert lista[0]["pacotes_em_uso"] == 0
    assert lista[0]["pacotes_fechados"] == 0


def test_produto_reposto_sai_da_lista():
    produto = primeira_compra("Farinha de trigo", 1)
    exigir_sucesso(consumir(produto["id"]))
    assert [p["id"] for p in listar_reposicao()] == [produto["id"]]
    exigir_sucesso(comprar(produto["id"], 3))
    assert listar_reposicao() == []


def test_produto_esgotado_por_consumo_entra_na_lista():
    produto = primeira_compra("Café", 1)
    exigir_sucesso(consumir(produto["id"]))
    assert [p["id"] for p in listar_reposicao()] == [produto["id"]]


def test_primeira_compra_registra_historico():
    produto = primeira_compra("Macarrão", 5)
    verificar_estoque(produto["id"], total=5, consumidos=0, em_uso=1, fechados=4)
    compras = listar_compras()
    assert len(compras) == 1
    compra = compras[0]
    assert compra["data_compra"] == DATA_COMPRA
    assert compra["estabelecimento_nome"] == ESTABELECIMENTO
    assert len(compra["itens"]) == 1
    item = compra["itens"][0]
    assert item["produto_nome"] == "Macarrão"
    assert item["quantidade"] == 5


def test_cadastrar_produto_com_unidade_controle():
    produto = cadastrar_produto("Creme dental", "Higiene", "tubo")
    assert produto["nome"] == "Creme Dental"
    assert produto["unidade_controle"] == "tubo"
    assert produto["pacotes_total"] == 0


def test_compra_com_detalhes_embalagem():
    produto = cadastrar_produto("Papel higiênico", "Higiene")
    resposta = comprar(
        produto["id"],
        2,
        unidades_por_embalagem=12,
        conteudo_por_unidade="30",
        unidade_medida="m",
    )
    exigir_sucesso(resposta)
    verificar_estoque(produto["id"], total=2, consumidos=0, em_uso=1, fechados=1)
    item = listar_compras()[0]["itens"][0]
    assert item["quantidade"] == 2
    assert item["unidades_por_embalagem"] == 12
    assert float(item["conteudo_por_unidade"]) == 30
    assert item["unidade_medida"] == "m"


def test_primeira_compra_com_detalhes_embalagem():
    produto = primeira_compra(
        "Creme dental",
        3,
        categoria="Higiene",
        unidade_controle="tubo",
        unidades_por_embalagem=1,
        conteudo_por_unidade="90",
        unidade_medida="g",
    )
    assert produto["unidade_controle"] == "tubo"
    verificar_estoque(produto["id"], total=3, consumidos=0, em_uso=1, fechados=2)
    item = listar_compras()[0]["itens"][0]
    assert item["quantidade"] == 3
    assert item["unidades_por_embalagem"] == 1
    assert float(item["conteudo_por_unidade"]) == 90
    assert item["unidade_medida"] == "g"


def test_impedir_produto_duplicado():
    cadastrar_produto("Papel Higiênico", "Higiene")
    resposta = client.post(
        "/produtos",
        json={
            "nome": "  PAPEL HIGIENICO  ",
            "categoria": "Higiene",
            "unidade_controle": "pacote",
        },
    )
    assert resposta.status_code == 409, resposta.text
    assert resposta.json()["detail"] == "Este produto já está cadastrado."


def test_compra_com_varios_produtos():
    resposta = registrar_compra([
        item_novo("Arroz", 2),
        item_novo("Sabonete", 3, categoria="Higiene", unidade_controle="unidade"),
    ])
    exigir_sucesso(resposta)
    assert len(listar_compras()) == 1
    assert len(listar_compras()[0]["itens"]) == 2
    arroz = buscar_produto_por_nome("Arroz")
    sabonete = buscar_produto_por_nome("Sabonete")
    assert arroz is not None and sabonete is not None
    verificar_estoque(arroz["id"], total=2, consumidos=0, em_uso=1, fechados=1)
    verificar_estoque(sabonete["id"], total=3, consumidos=0, em_uso=1, fechados=2)
