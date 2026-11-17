
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

DATA_COMPRA = "2026-11-13"


def cadastrar_produto(nome="Arroz", categoria="Alimentos"):
    resposta = client.post(
        "/produtos",
        json={"nome": nome, "categoria": categoria},
    )
    assert resposta.status_code == 200
    return resposta.json()


def primeira_compra(nome="Arroz", quantidade=5):
    resposta = client.post(
        "/compras/novo-produto",
        json={
            "nome": nome,
            "categoria": "Alimentos",
            "quantidade": quantidade,
            "data_compra": DATA_COMPRA,
        },
    )
    assert resposta.status_code == 200
    return resposta.json()


def comprar(produto_id, quantidade):
    return client.post(
        "/compras",
        json={
            "produto_id": produto_id,
            "quantidade": quantidade,
            "data_compra": DATA_COMPRA,
        },
    )


def consumir(produto_id):
    return client.post(
        "/produtos/consumir",
        json={"produto_id": produto_id},
    )


def buscar_produto_por_id(produto_id):
    resposta = client.get("/produtos")
    assert resposta.status_code == 200

    return next(
        (p for p in resposta.json() if p["id"] == produto_id),
        None,
    )


def test_listar_produtos():
    resposta = client.get("/produtos")
    assert resposta.status_code == 200
    assert isinstance(resposta.json(), list)


def test_cadastrar_produto():
    produto = cadastrar_produto("Feijão")

    assert produto["nome"] == "Feijão"
    assert produto["pacotes_total"] == 0
    assert produto["pacotes_consumidos"] == 0
    assert produto["pacotes_em_uso"] == 0
    assert produto["pacotes_fechados"] == 0


def test_cadastrar_produto_sem_estoque():
    produto = cadastrar_produto("Açúcar")

    assert produto["pacotes_total"] == 0
    assert produto["pacotes_em_uso"] == 0
    assert produto["pacotes_fechados"] == 0


def test_consumir_pacote():
    dados = primeira_compra("Café", 3)
    produto_id = dados["estoque_atualizado"]["id"]

    resposta = consumir(produto_id)
    assert resposta.status_code == 200

    produto = resposta.json()
    assert produto["pacotes_total"] == 3
    assert produto["pacotes_consumidos"] == 1
    assert produto["pacotes_em_uso"] == 1
    assert produto["pacotes_fechados"] == 1


def test_consumir_ultimo_pacote():
    dados = primeira_compra("Café", 1)
    produto_id = dados["estoque_atualizado"]["id"]

    resposta = consumir(produto_id)
    assert resposta.status_code == 200

    produto = resposta.json()
    assert produto["pacotes_consumidos"] == 1
    assert produto["pacotes_em_uso"] == 0
    assert produto["pacotes_fechados"] == 0

    resposta = consumir(produto_id)
    assert resposta.status_code == 409

    produto = buscar_produto_por_id(produto_id)
    assert produto["pacotes_total"] == 1
    assert produto["pacotes_consumidos"] == 1
    assert produto["pacotes_em_uso"] == 0
    assert produto["pacotes_fechados"] == 0


def test_registrar_compra():
    dados = primeira_compra("Arroz", 2)
    produto_id = dados["estoque_atualizado"]["id"]

    resposta = comprar(produto_id, 3)
    assert resposta.status_code == 200

    produto = buscar_produto_por_id(produto_id)
    assert produto["pacotes_total"] == 5
    assert produto["pacotes_consumidos"] == 0
    assert produto["pacotes_em_uso"] == 1
    assert produto["pacotes_fechados"] == 4

    resposta = client.get("/compras")
    assert resposta.status_code == 200
    assert len(resposta.json()) == 2


def test_repor_estoque_zerado():
    dados = primeira_compra("Café", 1)
    produto_id = dados["estoque_atualizado"]["id"]

    assert consumir(produto_id).status_code == 200

    resposta = comprar(produto_id, 3)
    assert resposta.status_code == 200

    produto = buscar_produto_por_id(produto_id)
    assert produto["pacotes_total"] == 4
    assert produto["pacotes_consumidos"] == 1
    assert produto["pacotes_em_uso"] == 1
    assert produto["pacotes_fechados"] == 2


def test_comprar_produto_inexistente():
    # Usa um ID inexistente calculado a partir do banco atual.
    resposta = client.get("/produtos")
    ids = [p["id"] for p in resposta.json()]
    produto_id = max(ids, default=0) + 1000

    resposta = comprar(produto_id, 3)
    assert resposta.status_code == 404

    resposta = client.get("/compras")
    assert resposta.status_code == 200
    assert resposta.json() == []


def test_comprar_quantidade_invalida():
    dados = primeira_compra("Arroz", 2)
    produto_id = dados["estoque_atualizado"]["id"]

    resposta = comprar(produto_id, 0)
    assert resposta.status_code == 422

    produto = buscar_produto_por_id(produto_id)
    assert produto["pacotes_total"] == 2
    assert produto["pacotes_consumidos"] == 0
    assert produto["pacotes_em_uso"] == 1
    assert produto["pacotes_fechados"] == 1

    resposta = client.get("/compras")
    assert len(resposta.json()) == 1


def test_produto_sem_estoque_entra_na_lista():
    produto = cadastrar_produto("Farinha de trigo")

    resposta = client.get("/lista-compras")
    assert resposta.status_code == 200

    lista = resposta.json()
    assert len(lista) == 1
    assert lista[0]["id"] == produto["id"]
    assert lista[0]["pacotes_em_uso"] == 0
    assert lista[0]["pacotes_fechados"] == 0


def test_produto_reposto_sai_da_lista():
    dados = primeira_compra("Farinha de trigo", 1)
    produto_id = dados["estoque_atualizado"]["id"]

    assert consumir(produto_id).status_code == 200

    resposta = client.get("/lista-compras")
    assert len(resposta.json()) == 1

    assert comprar(produto_id, 3).status_code == 200

    resposta = client.get("/lista-compras")
    assert resposta.status_code == 200
    assert resposta.json() == []


def test_produto_esgotado_por_consumo_entra_na_lista():
    dados = primeira_compra("Café", 1)
    produto_id = dados["estoque_atualizado"]["id"]

    assert consumir(produto_id).status_code == 200

    resposta = client.get("/lista-compras")
    assert resposta.status_code == 200
    assert len(resposta.json()) == 1
    assert resposta.json()[0]["id"] == produto_id


def test_primeira_compra_registra_historico():
    dados = primeira_compra("Macarrão", 5)

    produto = dados["estoque_atualizado"]
    compra = dados["compra"]

    assert produto["pacotes_total"] == 5
    assert produto["pacotes_em_uso"] == 1
    assert produto["pacotes_fechados"] == 4

    assert compra["produto_id"] == produto["id"]
    assert compra["quantidade"] == 5

    resposta = client.get("/compras")
    assert resposta.status_code == 200
    assert len(resposta.json()) == 1
    assert resposta.json()[0]["id"] == compra["id"]

def test_cadastrar_produto_com_unidade_controle():
    resposta = client.post(
        "/produtos",
        json={
            "nome": "Creme dental",
            "categoria": "Higiene",
            "unidade_controle": "tubo",
        },
    )

    assert resposta.status_code == 200

    produto = resposta.json()

    assert produto["nome"] == "Creme Dental"
    assert produto["unidade_controle"] == "tubo"
    assert produto["pacotes_total"] == 0

def test_compra_com_detalhes_embalagem():
    produto = cadastrar_produto("Papel higiênico", "Higiene")

    resposta = client.post(
        "/compras",
        json={
            "produto_id": produto["id"],
            "quantidade": 2,
            "data_compra": DATA_COMPRA,
            "unidades_por_embalagem": 12,
            "conteudo_por_unidade": 30,
            "unidade_medida": "m",
        },
    )

    assert resposta.status_code == 200

    compra = resposta.json()["compra"]

    assert compra["quantidade"] == 2
    assert compra["unidades_por_embalagem"] == 12
    assert float(compra["conteudo_por_unidade"]) == 30
    assert compra["unidade_medida"] == "m"

def test_primeira_compra_com_detalhes_embalagem():
    resposta = client.post(
        "/compras/novo-produto",
        json={
            "nome": "Creme dental",
            "categoria": "Higiene",
            "unidade_controle": "tubo",
            "quantidade": 3,
            "data_compra": DATA_COMPRA,
            "unidades_por_embalagem": 1,
            "conteudo_por_unidade": 90,
            "unidade_medida": "g",
        },
    )

    assert resposta.status_code == 200

    dados = resposta.json()
    produto = dados["estoque_atualizado"]
    compra = dados["compra"]

    assert produto["unidade_controle"] == "tubo"
    assert produto["pacotes_total"] == 3
    assert produto["pacotes_em_uso"] == 1
    assert produto["pacotes_fechados"] == 2

    assert compra["quantidade"] == 3
    assert compra["unidades_por_embalagem"] == 1
    assert float(compra["conteudo_por_unidade"]) == 90
    assert compra["unidade_medida"] == "g"

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

    assert resposta.status_code == 409
    assert resposta.json()["detail"] == "Este produto já está cadastrado."