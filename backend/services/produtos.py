import unicodedata

from fastapi import HTTPException


CORRECOES_NOMES = {
        "acucar": "Açúcar",
        "cafe": "Café",
        "cha": "Chá",
        "farinha de trigo": "Farinha de Trigo",
        "macarrao": "Macarrão",
        "maca": "Maçã",
        "mamao": "Mamão",
        "pao": "Pão",
        "pao de forma": "Pão de Forma",
        "pao frances": "Pão Francês",
        "papel higienico": "Papel Higiênico",
        "sabao": "Sabão",
        "sabao em po": "Sabão em Pó",
        "oleo": "Óleo",
        "oleo de soja": "Óleo de Soja",
        "agua": "Água",
        "agua sanitaria": "Água Sanitária",
        "agua mineral": "Água Mineral",
        "refrigerante guarana": "Refrigerante Guaraná",
        "achocolatado em po": "Achocolatado em Pó",
        "amido de milho": "Amido de Milho",
    }


def chave_nome(nome: str) -> str:
    """Compara nomes ignorando acentos, caixa e espaços repetidos."""
    simples = " ".join(nome.split()).casefold()
    sem_acentos = unicodedata.normalize("NFD", simples)

    return "".join(
        caractere for caractere in sem_acentos
        if unicodedata.category(caractere) != "Mn"
    )


def padronizar_nome(nome: str) -> str:
    nome_limpo = " ".join(nome.split())
    chave = chave_nome(nome_limpo)
    return CORRECOES_NOMES.get(chave, nome_limpo.title())


def validar_nome_nao_duplicado(cursor, nome: str) -> None:
    cursor.execute("SELECT pg_advisory_xact_lock(%s)", (12012,))
    cursor.execute("SELECT nome FROM produtos")

    chave = chave_nome(nome)

    if any(
        chave_nome(registro["nome"]) == chave
        for registro in cursor.fetchall()
    ):
        raise HTTPException(
            status_code=409,
            detail="Este produto já está cadastrado.",
        )