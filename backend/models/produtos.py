from pydantic import BaseModel, Field


class ProdutoCadastro(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    categoria: str = Field(min_length=1)
    unidade_controle: str = Field(default="pacote", min_length=1)


class ConsumoCadastro(BaseModel):
    produto_id: int = Field(gt=0)