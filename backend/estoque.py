
from fastapi import HTTPException


def estoque_disponivel(produto: dict) -> int:
    return produto["pacotes_em_uso"] + produto["pacotes_fechados"]


def atualizar_estoque_compra(produto: dict, quantidade: int) -> dict:
    if quantidade <= 0:
        raise HTTPException(
            status_code=422,
            detail="A quantidade comprada deve ser maior que zero."
        )

    produto["pacotes_total"] += quantidade

    # Se não houver pacote em uso, abre o primeiro.
    if produto["pacotes_em_uso"] == 0:
        produto["pacotes_em_uso"] = 1
        produto["pacotes_fechados"] += quantidade - 1
    else:
        produto["pacotes_fechados"] += quantidade

    return produto


def abrir_pacote(produto: dict) -> dict:
    if produto["pacotes_em_uso"] > 0:
        raise HTTPException(
            status_code=409,
            detail="Já existe um pacote aberto deste produto."
        )

    if produto["pacotes_fechados"] <= 0:
        raise HTTPException(
            status_code=409,
            detail="Não há pacotes fechados disponíveis."
        )

    produto["pacotes_fechados"] -= 1
    produto["pacotes_em_uso"] = 1

    return produto


def consumir_pacote(produto: dict) -> dict:
    if produto["pacotes_em_uso"] == 0:
        raise HTTPException(
            status_code=409,
            detail="Não há pacote aberto para consumir."
        )

    produto["pacotes_consumidos"] += 1

    # Abre automaticamente o próximo pacote, se houver.
    if produto["pacotes_fechados"] > 0:
        produto["pacotes_fechados"] -= 1
        produto["pacotes_em_uso"] = 1
    else:
        produto["pacotes_em_uso"] = 0

    return produto
