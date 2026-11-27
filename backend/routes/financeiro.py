from fastapi import APIRouter
from psycopg.rows import dict_row

from database import conectar

router = APIRouter(prefix="/financeiro", tags=["Financeiro"])


@router.get("/resumo")
def resumo_financeiro():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total_compras,
                    COALESCE(SUM(valor_compra), 0) AS total_gasto,
                    COALESCE(AVG(valor_compra), 0) AS media_por_compra
                FROM (
                    SELECT
                        c.id,
                        COALESCE(SUM(i.valor_total), 0) AS valor_compra
                    FROM compras c
                    LEFT JOIN itens_compra i
                        ON i.compra_id = c.id
                    GROUP BY c.id
                ) AS totais
                """
            )

            return cursor.fetchone()

@router.get("/estabelecimentos")
def gastos_por_estabelecimento():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                    SELECT
                        e.id,
                        e.nome,
                        COUNT(DISTINCT c.id) AS total_compras,
                        COALESCE(SUM(i.valor_total), 0) AS total_gasto
                    FROM estabelecimentos e
                    LEFT JOIN compras c
                        ON c.estabelecimento_id = e.id
                    LEFT JOIN itens_compra i
                        ON i.compra_id = c.id
                        GROUP BY e.id, e.nome
                        ORDER BY e.nome
                """
            )

            return cursor.fetchall()