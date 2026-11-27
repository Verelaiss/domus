from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from database import conectar
from estoque import consumir_pacote
from models.produtos import ProdutoCadastro, ConsumoCadastro
from services.produtos import (
    padronizar_nome,
    validar_nome_nao_duplicado,
)


router = APIRouter(tags=["Produtos"])

# ========================================
# ROTAS DE PRODUTOS
# ========================================

@router.get("/produtos")
def listar_produtos():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                "SELECT * FROM produtos ORDER BY id"
            )
            return cursor.fetchall()


@router.post("/produtos")
def cadastrar_produto(dados: ProdutoCadastro):
    nome = padronizar_nome(dados.nome)
    categoria = dados.categoria.strip()
    unidade_controle = dados.unidade_controle.strip().lower()

    if not nome or not categoria:
        raise HTTPException(
            status_code=422,
            detail="Nome e categoria são obrigatórios.",
        )

    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            validar_nome_nao_duplicado(cursor, nome)

            cursor.execute(
                """
                INSERT INTO produtos (
                    nome,
                    categoria,
                    unidade_controle,
                    pacotes_total,
                    pacotes_consumidos,
                    pacotes_em_uso,
                    pacotes_fechados
                )
                VALUES (%s, %s, %s, 0, 0, 0, 0)
                RETURNING *
                """,
                (nome, categoria, unidade_controle),
            )

            novo_produto = cursor.fetchone()

    return novo_produto


@router.post("/produtos/consumir")
def registrar_consumo(dados: ConsumoCadastro):
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:

            # Busca e bloqueia o produto durante a operação.
            cursor.execute(
                """
                SELECT *
                FROM produtos
                WHERE id = %s
                FOR UPDATE
                """,
                (dados.produto_id,),
            )

            produto = cursor.fetchone()

            if produto is None:
                raise HTTPException(
                    status_code=404,
                    detail="Produto não encontrado.",
                )

            # Verifica se outro pacote poderá ser aberto.
            havia_pacote_fechado = produto["pacotes_fechados"] > 0

            # Aplica a regra de consumo existente.
            produto = consumir_pacote(produto)

            estoque_esgotado = (
                produto["pacotes_em_uso"] == 0
                and produto["pacotes_fechados"] == 0
            )

            # Atualiza os dados do estoque.
            cursor.execute(
                """
                UPDATE produtos
                SET pacotes_consumidos = %s,
                    pacotes_em_uso = %s,
                    pacotes_fechados = %s
                WHERE id = %s
                RETURNING *
                """,
                (
                    produto["pacotes_consumidos"],
                    produto["pacotes_em_uso"],
                    produto["pacotes_fechados"],
                    dados.produto_id,
                ),
            )

            produto_atualizado = cursor.fetchone()

            # Registra o consumo do pacote atual.
            cursor.execute(
                """
                INSERT INTO movimentacoes_estoque (
                    produto_id,
                    tipo,
                    quantidade
                )
                VALUES (%s, %s, %s)
                """,
                (
                    dados.produto_id,
                    "CONSUMO",
                    1,
                ),
            )

            # Registra a abertura automática do próximo pacote.
            if havia_pacote_fechado:
                cursor.execute(
                    """
                    INSERT INTO movimentacoes_estoque (
                        produto_id,
                        tipo,
                        quantidade
                    )
                    VALUES (%s, %s, %s)
                    """,
                    (
                        dados.produto_id,
                        "ABERTURA",
                        1,
                    ),
                )

            # Registra quando não há mais pacotes disponíveis.
            if estoque_esgotado:
                cursor.execute(
                    """
                    INSERT INTO movimentacoes_estoque (
                        produto_id,
                        tipo,
                        quantidade
                    )
                    VALUES (%s, %s, %s)
                    """,
                    (
                        dados.produto_id,
                        "ESGOTAMENTO",
                        1,
                    ),
                )

    return produto_atualizado

# ========================================
# LISTA DE COMPRAS AUTOMÁTICA
# ========================================

@router.get("/lista-compras")
def listar_compras_necessarias():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT *
                FROM produtos
                WHERE pacotes_em_uso + pacotes_fechados = 0
                ORDER BY id
                """
            )

            return cursor.fetchall()