from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from database import conectar
from estoque import atualizar_estoque_compra
from decimal import Decimal

from models.compras import (
    ItemCompraCadastro,
    CompraCompletaCadastro,
    CompraCadastro,
    PrimeiraCompraCadastro,
)

from services.produtos import (
    padronizar_nome,
    validar_nome_nao_duplicado,
)

router = APIRouter(tags=["Compras"])

# ========================================
# ROTAS DE COMPRAS
# ========================================


@router.get("/compras")
def listar_compras():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    c.id,
                    c.data_compra,
                    c.data_registro,
                    c.observacoes,
                    e.id AS estabelecimento_id,
                    e.nome AS estabelecimento_nome
                FROM compras c
                JOIN estabelecimentos e
                    ON e.id = c.estabelecimento_id
                ORDER BY c.data_compra DESC, c.id DESC
                """
            )

            compras = cursor.fetchall()

            for compra in compras:
                cursor.execute(
                    """
                    SELECT
                        i.id,
                        i.produto_id,
                        p.nome AS produto_nome,
                        p.categoria,
                        i.quantidade,
                        i.valor_total,
                        i.unidades_por_embalagem,
                        i.conteudo_por_unidade,
                        i.unidade_medida
                    FROM itens_compra i
                    JOIN produtos p
                        ON p.id = i.produto_id
                    WHERE i.compra_id = %s
                    ORDER BY i.id
                    """,
                    (compra["id"],),
                )

                itens = cursor.fetchall()

                compra["itens"] = itens
                compra["valor_total"] = sum(
                    (item["valor_total"] for item in itens),
                    start=Decimal("0.00"),
                )

            return compras


@router.post("/compras")
def registrar_compra(dados: CompraCompletaCadastro):
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            
            # 1. Identifica ou cadastra o estabelecimento.
            if dados.estabelecimento_id is not None:
                cursor.execute(
                    """
                    SELECT id
                    FROM estabelecimentos
                    WHERE id = %s
                    """,
                    (dados.estabelecimento_id,),
                )

                estabelecimento = cursor.fetchone()

                if estabelecimento is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Estabelecimento não encontrado.",
                    )

                estabelecimento_id = estabelecimento["id"]

            else:
                nome = dados.estabelecimento_nome.strip()
                tipo = (
                    dados.estabelecimento_tipo.strip()
                    if dados.estabelecimento_tipo
                    else None
                )

                cursor.execute(
                    """
                    INSERT INTO estabelecimentos (nome, tipo)
                    VALUES (%s, %s)
                    ON CONFLICT (
                        (LOWER(TRIM(nome)))
                    )
                    DO NOTHING
                    RETURNING id
                    """,
                    (nome, tipo),
                )

                estabelecimento = cursor.fetchone()

                if estabelecimento is not None:
                    estabelecimento_id = estabelecimento["id"]
                else:
                    cursor.execute(
                        """
                        SELECT id
                        FROM estabelecimentos
                        WHERE LOWER(TRIM(nome)) = LOWER(TRIM(%s))
                        """,
                        (nome,),
                    )

                    estabelecimento_id = cursor.fetchone()["id"]
            # 2. Cria o registro geral da compra.
            cursor.execute(
                """
                INSERT INTO compras (
                    estabelecimento_id,
                    data_compra,
                    observacoes
                )
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (
                    estabelecimento_id,
                    dados.data_compra,
                    dados.observacoes,
                ),
            )

            nova_compra = cursor.fetchone()
            itens_registrados = []
            estoques_atualizados = []

            # 3. Processa cada item da compra.
            for item in dados.itens:

                if item.produto_id is None:
                    # Produto novo: verifica nome duplicado.
                    nome = padronizar_nome(item.nome)
                    categoria = item.categoria.strip()

                    cursor.execute(
                        """
                        SELECT id
                        FROM produtos
                        WHERE LOWER(TRIM(nome)) = LOWER(%s)
                        """,
                        (nome,),
                    )

                    if cursor.fetchone() is not None:
                        raise HTTPException(
                            status_code=409,
                            detail=f"Produto '{nome}' já cadastrado.",
                        )

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
                        (
                            nome,
                            categoria,
                            item.unidade_controle,
                        ),
                    )

                    produto = cursor.fetchone()

                else:
                    # Produto existente: bloqueia a linha.
                    cursor.execute(
                        """
                        SELECT *
                        FROM produtos
                        WHERE id = %s
                        FOR UPDATE
                        """,
                        (item.produto_id,),
                    )

                    produto = cursor.fetchone()

                    if produto is None:
                        raise HTTPException(
                            status_code=404,
                            detail=(
                                f"Produto {item.produto_id} "
                                "não encontrado."
                            ),
                        )

                produto_id = produto["id"]

                # 4. Registra o item e suas informações financeiras.
                cursor.execute(
                    """
                    INSERT INTO itens_compra (
                        compra_id,
                        produto_id,
                        quantidade,
                        valor_total,
                        unidades_por_embalagem,
                        conteudo_por_unidade,
                        unidade_medida
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        nova_compra["id"],
                        produto_id,
                        item.quantidade,
                        item.valor_total,
                        item.unidades_por_embalagem,
                        item.conteudo_por_unidade,
                        item.unidade_medida,
                    ),
                )

                novo_item = cursor.fetchone()
                itens_registrados.append(novo_item)

                # 5. Calcula a atualização do estoque.
                precisa_abrir_pacote = (
                    produto["pacotes_em_uso"] == 0
                )

                produto = atualizar_estoque_compra(
                    produto,
                    item.quantidade,
                )

                cursor.execute(
                    """
                    UPDATE produtos
                    SET pacotes_total = %s,
                        pacotes_em_uso = %s,
                        pacotes_fechados = %s
                    WHERE id = %s
                    RETURNING *
                    """,
                    (
                        produto["pacotes_total"],
                        produto["pacotes_em_uso"],
                        produto["pacotes_fechados"],
                        produto_id,
                    ),
                )

                estoque_atualizado = cursor.fetchone()
                estoques_atualizados.append(estoque_atualizado)

                # 6. Registra a entrada no estoque.
                cursor.execute(
                    """
                    INSERT INTO movimentacoes_estoque (
                        produto_id,
                        item_compra_id,
                        tipo,
                        quantidade
                    )
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        produto_id,
                        novo_item["id"],
                        "ENTRADA",
                        item.quantidade,
                    ),
                )

                # 7. Registra a abertura, quando necessária.
                if precisa_abrir_pacote:
                    cursor.execute(
                        """
                        INSERT INTO movimentacoes_estoque (
                            produto_id,
                            item_compra_id,
                            tipo,
                            quantidade
                        )
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            produto_id,
                            novo_item["id"],
                            "ABERTURA",
                            1,
                        ),
                    )

    return {
        "compra": nova_compra,
        "itens": itens_registrados,
        "estoques_atualizados": estoques_atualizados,
    }


# ========================================
# PRIMEIRA COMPRA DE PRODUTO NOVO
# ========================================

@router.post("/compras/novo-produto")
def registrar_primeira_compra(dados: PrimeiraCompraCadastro):
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

            # Cria o produto com um pacote em uso.
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
                VALUES (%s, %s, %s, %s, 0, 1, %s)
                RETURNING *
                """,
                (
                    nome,
                    categoria,
                    unidade_controle,
                    dados.quantidade,
                    dados.quantidade - 1,
                ),
            )

            novo_produto = cursor.fetchone()

            # Registra a primeira compra no histórico.
            cursor.execute(
                """
                INSERT INTO compras (
                    produto_id,
                    quantidade,
                    data_compra,
                    unidades_por_embalagem,
                    conteudo_por_unidade,
                    unidade_medida
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    novo_produto["id"],
                    dados.quantidade,
                    dados.data_compra,
                    dados.unidades_por_embalagem,
                    dados.conteudo_por_unidade,
                    dados.unidade_medida,
                ),
            )
            nova_compra = cursor.fetchone()

            # Registra a abertura do primeiro pacote.
            cursor.execute(
                """
                INSERT INTO movimentacoes_estoque (
                    produto_id,
                    compra_id,
                    tipo,
                    quantidade
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    novo_produto["id"],
                    nova_compra["id"],
                    "ABERTURA",
                    1,
                ),
            )

    return {
        "compra": nova_compra,
        "estoque_atualizado": novo_produto,
    }