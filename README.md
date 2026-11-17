# Domus

Aplicação web para controle de estoque doméstico, registro de compras e acompanhamento de produtos que precisam ser repostos.

## Tecnologias

- Backend: Python, FastAPI e psycopg
- Frontend: React e Vite
- Banco de dados: PostgreSQL
- Testes: pytest e FastAPI TestClient

## Funcionalidades atuais

- Cadastro de produtos por categoria, com unidade de controle (pacote, unidade, tubo etc.)
- Registro de compras com data e detalhes opcionais de embalagem
- Controle de unidades em uso e fechadas, com baixa pelo botão **Acabou**
- Inclusão automática de produtos esgotados na lista de compras
- Histórico de compras agrupado por data, com filtros e detalhes expansíveis
- Padronização de nomes e verificação de duplicidade na API

## Estrutura

```text
backend/
  database.py          # Conexão com o PostgreSQL
  estoque.py           # Regras de estoque
  main.py              # API FastAPI
  sql/                 # Scripts SQL
  tests/               # Testes automatizados
frontend/              # Aplicação React/Vite
```

## Banco de dados

Crie um banco PostgreSQL vazio chamado `domus_db` e configure um usuário com as permissões necessárias. Copie `backend/.env.example` para `backend/.env` e preencha os valores conforme seu ambiente. **Não versione o arquivo `.env`.**

Para criar as tabelas em um banco **vazio**, execute os scripts nesta ordem, a partir da raiz do projeto:

```bash
psql -d domus_db -f backend/sql/001_criar_tabelas.sql
psql -d domus_db -f backend/sql/002_criar_compras.sql
psql -d domus_db -f backend/sql/003_atualizar_embalagens.sql
psql -d domus_db -f backend/sql/004_criar_movimentacoes.sql
```

Esses comandos pressupõem que a autenticação e as permissões do PostgreSQL já estejam configuradas. Não execute esses scripts novamente no banco já utilizado pela aplicação. A instalação do zero ainda não foi testada de ponta a ponta.

## Executar o backend

É necessário Python com as dependências do backend instaladas, incluindo FastAPI, psycopg e python-dotenv. Na pasta `backend`, ative seu ambiente virtual e execute:

```bash
python -m fastapi dev main.py
```

A documentação interativa da API fica em `http://127.0.0.1:8000/docs`.

> **Pendente:** criar um arquivo de dependências Python (`requirements.txt` ou equivalente) para permitir a instalação reproduzível.

## Executar o frontend

Em outro terminal, a partir da raiz do projeto:

```bash
cd frontend
npm install
npm run dev
```

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`.

## Testes

Crie e configure separadamente o banco `domus_test_db` com a mesma estrutura. Depois, dentro de `backend`, execute:

```bash
DB_NAME=domus_test_db python -m pytest -q
```

Último resultado informado durante o desenvolvimento: **17 testes aprovados**.

## Status

Projeto pessoal em desenvolvimento. Melhorias futuras incluem relatórios de consumo, análises de intervalo entre compras e refinamentos de interface. A prevenção de duplicidade pela API já foi testada, mas uma restrição de unicidade no banco ainda não foi implementada.
