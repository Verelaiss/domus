from datetime import date
import unicodedata

from database import conectar
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from estoque import atualizar_estoque_compra, consumir_pacote


# Normalização conservadora: capitalização e correções conhecidas.
CORRECOES_NOMES = {
    "acucar": "Açúcar",
    "papel higienico": "Papel Higiênico",
}


def chave_nome(nome: str) -> str:
    '''Comparação sem diferenças de acentos, caixa ou espaços repetidos.'''
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
    # Bloqueio transacional para evitar criação simultânea pelos endpoints desta API.
    cursor.execute("SELECT pg_advisory_xact_lock(%s)", (12012,))
    cursor.execute("SELECT nome FROM produtos")
    chave = chave_nome(nome)
    if any(chave_nome(registro["nome"]) == chave for registro in cursor.fetchall()):
        raise HTTPException(
            status_code=409,
            detail="Este produto já está cadastrado.",
        )


# ========================================
# MODELOS DE DADOS
# ========================================

class ProdutoCadastro(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    categoria: str = Field(min_length=1)
    unidade_controle: str = Field(default="pacote", min_length=1)

class CompraCadastro(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: int = Field(gt=0)
    data_compra: date
    unidades_por_embalagem: int | None = Field(default=None, gt=0)
    conteudo_por_unidade: float | None = Field(default=None, gt=0)
    unidade_medida: str | None = Field(default=None, max_length=20)

    @field_validator("data_compra")
    @classmethod
    def validar_data_compra(cls, valor):
        if valor > date.today():
            raise ValueError("A data da compra não pode ser futura.")
        return valor


class PrimeiraCompraCadastro(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    categoria: str = Field(min_length=1)
    quantidade: int = Field(gt=0)
    data_compra: date
    unidade_controle: str = Field(default="pacote", min_length=1)
    unidades_por_embalagem: int | None = Field(default=None, gt=0)
    conteudo_por_unidade: float | None = Field(default=None, gt=0)
    unidade_medida: str | None = Field(default=None, max_length=20)

    @field_validator("data_compra")
    @classmethod
    def validar_data_compra(cls, valor):
        if valor > date.today():
            raise ValueError("A data da compra não pode ser futura.")
        return valor


class ConsumoCadastro(BaseModel):
    produto_id: int = Field(gt=0)


# ========================================
# APLICAÇÃO
# ========================================

app = FastAPI(title="Domus", version="0.1.0")


# ========================================
# ROTAS DE PRODUTOS
# ========================================

@app.get("/produtos")
def listar_produtos():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                "SELECT * FROM produtos ORDER BY id"
            )
            return cursor.fetchall()


@app.post("/produtos")
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


# ========================================
# REGISTRO DE CONSUMO
# ========================================

@app.post("/produtos/consumir")
def registrar_consumo(dados: ConsumoCadastro):
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:

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

            havia_pacote_fechado = produto["pacotes_fechados"] > 0

            produto = consumir_pacote(produto)

            estoque_esgotado = (
                produto["pacotes_em_uso"] == 0
                and produto["pacotes_fechados"] == 0
            )

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

            # Registra o término do pacote em uso.
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

            # Se houver outro pacote fechado,
            # registra sua abertura automática.
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

            # Registra o esgotamento total do estoque.
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
# ROTAS DE COMPRAS
# ========================================

@app.get("/compras")
def listar_compras():
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT *
                FROM compras
                ORDER BY data_compra DESC, id DESC
                """
            )
            return cursor.fetchall()

@app.post("/compras")
def registrar_compra(dados: CompraCadastro):
    with conectar() as conexao:
        with conexao.cursor(row_factory=dict_row) as cursor:

            # Localiza e bloqueia o produto.
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

            # Uma compra abre o primeiro pacote apenas
            # quando não existe outro em uso.
            precisa_abrir_pacote = produto["pacotes_em_uso"] == 0

            produto = atualizar_estoque_compra(
                produto,
                dados.quantidade,
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
                    dados.produto_id,
                ),
            )

            estoque_atualizado = cursor.fetchone()

            # Registra a compra.
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
                    dados.produto_id,
                    dados.quantidade,
                    dados.data_compra,
                    dados.unidades_por_embalagem,
                    dados.conteudo_por_unidade,
                    dados.unidade_medida,
                ),
            )

            nova_compra = cursor.fetchone()

            # Registra a abertura inicial vinculada à compra.
            if precisa_abrir_pacote:
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
                        dados.produto_id,
                        nova_compra["id"],
                        "ABERTURA",
                        1,
                    ),
                )

    return {
        "compra": nova_compra,
        "estoque_atualizado": estoque_atualizado,
    }


# ========================================
# PRIMEIRA COMPRA DE PRODUTO NOVO
# ========================================

@app.post("/compras/novo-produto")
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


# ========================================
# LISTA DE COMPRAS AUTOMÁTICA
# ========================================

@app.get("/lista-compras")
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
