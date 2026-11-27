from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

# ========================================
# MODELOS DE DADOS
# ========================================


class ItemCompraCadastro(BaseModel):
    produto_id: int | None = Field(default=None, gt=0)
    nome: str | None = Field(default=None, min_length=1, max_length=100)
    categoria: str | None = Field(default=None, min_length=1)
    unidade_controle: str = Field(default="pacote", min_length=1)
    quantidade: int = Field(gt=0)
    valor_total: Decimal = Field(ge=0)
    unidades_por_embalagem: int | None = Field(default=None, gt=0)
    conteudo_por_unidade: Decimal | None = Field(default=None, gt=0)
    unidade_medida: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def validar_identificacao(self):
        if self.produto_id is None:
            if not self.nome or not self.categoria:
                raise ValueError(
                    "Produto novo precisa de nome e categoria."
                )
        elif self.nome is not None or self.categoria is not None:
            raise ValueError(
                "Informe o ID do produto existente ou os dados de um produto novo."
            )

        return self


class CompraCompletaCadastro(BaseModel):
    estabelecimento_id: int | None = Field(default=None, gt=0)
    estabelecimento_nome: str | None = Field(default=None, min_length=1, max_length=150)
    estabelecimento_tipo: str | None = Field(default=None, max_length=50)
    data_compra: date
    observacoes: str | None = None
    itens: list[ItemCompraCadastro] = Field(min_length=1)

    @model_validator(mode="after")
    def validar_estabelecimento(self):
        tem_id = self.estabelecimento_id is not None
        tem_nome = self.estabelecimento_nome is not None

        if tem_id == tem_nome:
            raise ValueError(
                "Informe um estabelecimento existente ou o nome de um novo."
            )

        if tem_id and self.estabelecimento_tipo is not None:
            raise ValueError(
                "O tipo só pode ser informado para um estabelecimento novo."
            )

        return self

    
    @field_validator("data_compra")
    @classmethod
    def validar_data_compra(cls, valor):
        if valor > date.today():
            raise ValueError("A data da compra não pode ser futura.")
        return valor

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
