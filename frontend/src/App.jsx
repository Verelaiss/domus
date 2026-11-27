import { useEffect, useRef, useState } from "react";
import "./App.css";

// ============================================================
// 1. CONFIGURAÇÕES E FUNÇÕES AUXILIARES
// ============================================================

const ROTAS = {
  Estoque: "/estoque",
  Compras: "/compras",
  Histórico: "/historico",
  Financeiro: "/financeiro",
};

const paginaPelaUrl = () =>
  Object.keys(ROTAS).find((nome) => ROTAS[nome] === window.location.pathname) ||
  "Estoque";

const CATEGORIAS = ["Alimentos", "Bebidas", "Limpeza", "Higiene", "Outros"];
const UNIDADES_CONTROLE = [
  "pacote",
  "unidade",
  "tubo",
  "caixa",
  "frasco",
  "garrafa",
  "lata",
  "pote",
  "rolo",
  "saco",
];
const normalizar = (valor) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

const dataLocal = () => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};
const agruparComprasPorData = (compras) => {
  return compras.reduce((grupos, compra) => {
    const data = compra.data_compra;

    if (!grupos[data]) {
      grupos[data] = [];
    }

    grupos[data].push(compra);
    return grupos;
  }, {});
};

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================

function App() {
  // Navegação entre páginas
  const [pagina, setPagina] = useState(paginaPelaUrl);

  useEffect(() => {
    if (!Object.values(ROTAS).includes(window.location.pathname)) {
      window.history.replaceState(null, "", ROTAS.Estoque);
    }

    const atualizarPagina = () => {
      setPagina(paginaPelaUrl());
    };

    window.addEventListener("popstate", atualizarPagina);

    return () => {
      window.removeEventListener("popstate", atualizarPagina);
    };
  }, []);

  const navegarPara = (destino) => {
    if (destino === pagina) return;

    window.history.pushState(null, "", ROTAS[destino]);
    setPagina(destino);
  };
  // ----------------------------------------------------------
  // 2.1. Estados: dados carregados da API
  // ----------------------------------------------------------
  const [produtos, setProdutos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [estabelecimentos, setEstabelecimentos] = useState([]);

  // 2.2. Estados: formulário de compras e estabelecimentos
  const [estabelecimentoId, setEstabelecimentoId] = useState("");
  const [estabelecimentoNome, setEstabelecimentoNome] = useState("");
  const [itensCompra, setItensCompra] = useState([]);
  const [valorTotalItem, setValorTotalItem] = useState("");

  const [listaCompras, setListaCompras] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // 2.3. Estados: consumo e confirmação
  const [mensagemConsumo, setMensagemConsumo] = useState("");
  const [produtoConsumindo, setProdutoConsumindo] = useState(null);
  const consumoEmAndamentoRef = useRef(false);
  const [produtoParaConfirmar, setProdutoParaConfirmar] = useState(null);
  const botaoCancelarRef = useRef(null);
  const botaoOrigemRef = useRef(null);

  // 2.4. Acessibilidade: teclado do modal de consumo
  useEffect(() => {
    if (!produtoParaConfirmar) return;

    botaoCancelarRef.current?.focus();

    function controlarTeclado(evento) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setProdutoParaConfirmar(null);
      }

      if (evento.key === "Tab") {
        const cancelar = botaoCancelarRef.current;
        const confirmar =
          cancelar?.parentElement?.querySelectorAll("button")[1];

        if (!cancelar || !confirmar) return;

        if (evento.shiftKey && document.activeElement === cancelar) {
          evento.preventDefault();
          confirmar.focus();
        } else if (!evento.shiftKey && document.activeElement === confirmar) {
          evento.preventDefault();
          cancelar.focus();
        }
      }
    }

    document.addEventListener("keydown", controlarTeclado);

    return () => {
      document.removeEventListener("keydown", controlarTeclado);
      botaoOrigemRef.current?.focus();
    };
  }, [produtoParaConfirmar]);

  // 2.5. Estados: filtros, formulário e histórico
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [mostrarFormularioCompra, setMostrarFormularioCompra] = useState(false);
  const [buscaCompra, setBuscaCompra] = useState("");
  const [categoriaNovoProduto, setCategoriaNovoProduto] = useState("");
  const [unidadeControle, setUnidadeControle] = useState("pacote");
  const [quantidadeCompra, setQuantidadeCompra] = useState(1);
  const [unidadesPorEmbalagem, setUnidadesPorEmbalagem] = useState("");
  const [conteudoPorUnidade, setConteudoPorUnidade] = useState("");
  const [unidadeMedida, setUnidadeMedida] = useState("");
  const [dataCompra, setDataCompra] = useState(dataLocal);
  const [salvandoCompra, setSalvandoCompra] = useState(false);
  const [erroCompra, setErroCompra] = useState("");
  const [mensagemCompra, setMensagemCompra] = useState("");
  const [mesFinanceiro, setMesFinanceiro] = useState(() => dataLocal().slice(0, 7));
  const [filtroHistorico, setFiltroHistorico] = useState("mes");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // ----------------------------------------------------------
  // 3. CARREGAMENTO INICIAL DOS DADOS
  // ----------------------------------------------------------
  useEffect(() => {
    async function carregarDados() {
      setCarregando(true);
      setErro("");
      try {
        const respostas = await Promise.all(
          [
            "/produtos",
            "/compras",
            "/lista-compras",
            "/financeiro/estabelecimentos",
          ].map((rota) => fetch(`/api${rota}`)),
        );
        if (respostas.some((resposta) => !resposta.ok)) {
          throw new Error("Falha ao consultar a API.");
        }
        const [dadosProdutos, dadosCompras, dadosLista, dadosEstabelecimentos] =
          await Promise.all(respostas.map((resposta) => resposta.json()));
        setProdutos(dadosProdutos);
        setCompras(dadosCompras);
        setListaCompras(dadosLista);
        setEstabelecimentos(dadosEstabelecimentos);
      } catch {
        setErro("Não foi possível conectar ao backend do Domus.");
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, []);

  // ----------------------------------------------------------
  // 4. REGRAS DE APRESENTAÇÃO E FILTROS
  // ----------------------------------------------------------
  const disponivel = (produto) =>
    produto.pacotes_em_uso + produto.pacotes_fechados;

  const textoUnidade = (produto, quantidade) => {
    const unidade = produto.unidade_controle || "pacote";
    if (quantidade === 1) return unidade;
    return unidade === "unidade" ? "unidades" : `${unidade}s`;
  };

  // Painel financeiro: agrega registros já retornados por GET /api/compras.
  // Os valores por item representam o custo total daquele item, não preço unitário.
  const comprasDoMes = compras.filter((compra) =>
    String(compra.data_compra || "").slice(0, 7) === mesFinanceiro,
  );
  const formatarMoeda = (valor) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const totalFinanceiro = comprasDoMes.reduce(
    (total, compra) => total + Number(compra.valor_total || 0),
    0,
  );
  const gastosCategoria = {};
  const gastosEstabelecimento = {};
  for (const compra of comprasDoMes) {
    const estabelecimento = compra.estabelecimento_nome || "Não informado";
    gastosEstabelecimento[estabelecimento] =
      (gastosEstabelecimento[estabelecimento] || 0) + Number(compra.valor_total || 0);
    for (const item of compra.itens || []) {
      const categoria = item.categoria || "Outros";
      gastosCategoria[categoria] =
        (gastosCategoria[categoria] || 0) + Number(item.valor_total || 0);
    }
  }
  const ordenarGastos = (gastos) =>
    Object.entries(gastos).sort((a, b) => b[1] - a[1]);

  const categorias = [
    "Todas",
    ...new Set(produtos.map((produto) => produto.categoria)),
  ];

  const produtosFiltrados = produtos.filter((produto) => {
    const correspondeCategoria =
      categoriaFiltro === "Todas" || produto.categoria === categoriaFiltro;
    const correspondeBusca = produto.nome
      .toLocaleLowerCase("pt-BR")
      .includes(buscaProduto.trim().toLocaleLowerCase("pt-BR"));
    return correspondeCategoria && correspondeBusca;
  });

  // ----------------------------------------------------------
  // 5. AÇÕES: CONSUMO DE PRODUTOS
  // ----------------------------------------------------------
  async function registrarConsumo(produto) {
    if (consumoEmAndamentoRef.current) return;

    consumoEmAndamentoRef.current = true;
    setProdutoConsumindo(produto.id);
    setMensagemConsumo("");
    try {
      const resposta = await fetch("/api/produtos/consumir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto_id: produto.id }),
      });
      if (!resposta.ok) throw new Error("Falha ao registrar consumo.");
      const atualizado = await resposta.json();
      setProdutos((anteriores) =>
        anteriores.map((item) =>
          item.id === atualizado.id ? atualizado : item,
        ),
      );
      if (disponivel(atualizado) === 0) {
        setListaCompras((anteriores) =>
          anteriores.some((item) => item.id === atualizado.id)
            ? anteriores
            : [...anteriores, atualizado],
        );
      }

      setMensagemConsumo("Consumo registrado com sucesso!");
    } catch {
      setMensagemConsumo(
        "Não foi possível registrar o consumo. Tente novamente.",
      );
    } finally {
      consumoEmAndamentoRef.current = false;
      setProdutoConsumindo(null);
    }
  }

  // ----------------------------------------------------------
  // 6. SELEÇÃO DE PRODUTOS PARA A COMPRA
  // ----------------------------------------------------------
  const termoCompra = normalizar(buscaCompra);
  const correspondencias = termoCompra
    ? produtos.filter((produto) =>
        normalizar(produto.nome).includes(termoCompra),
      )
    : [];
  const correspondenciaExata = produtos.find(
    (produto) => termoCompra && normalizar(produto.nome) === termoCompra,
  );
  // A correspondência exata já define automaticamente o produto selecionado.
  const produtoSelecionado = correspondenciaExata;
  const produtoValido = Boolean(produtoSelecionado);
  const podeCriar = termoCompra.length > 0 && !produtoValido;

  // ----------------------------------------------------------
  // 7. AÇÕES: REGISTRO DE COMPRAS
  // Envio integrado ao contrato CompraCompletaCadastro (vários itens).
  // ----------------------------------------------------------
  function fecharFormularioCompra() {
    setMostrarFormularioCompra(false);
    setErroCompra("");
  }

  // Monta e valida um item tanto para adicionar à lista quanto para salvar direto.
  function montarItemCompra() {
    const quantidade = Number(quantidadeCompra);
    const valor = Number(String(valorTotalItem).replace(",", "."));

    if (!buscaCompra.trim()) {
      throw new Error("Informe o nome do produto.");
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new Error("Informe uma quantidade válida.");
    }
    if (valorTotalItem === "" || !Number.isFinite(valor) || valor < 0) {
      throw new Error("Informe um valor válido para o produto.");
    }
    if (!produtoValido && (!podeCriar || !categoriaNovoProduto)) {
      throw new Error("Digite um produto existente ou informe a categoria do novo produto.");
    }

    const unidades = unidadesPorEmbalagem === "" ? null : Number(unidadesPorEmbalagem);
    const conteudo = conteudoPorUnidade === "" ? null : Number(conteudoPorUnidade);
    if (unidades !== null && (!Number.isInteger(unidades) || unidades <= 0)) {
      throw new Error("Informe uma quantidade válida de unidades por embalagem.");
    }
    if (conteudo !== null && (!Number.isFinite(conteudo) || conteudo <= 0)) {
      throw new Error("Informe um conteúdo por unidade válido.");
    }

    return {
      quantidade,
      valor_total: valor.toFixed(2),
      unidades_por_embalagem: unidades,
      conteudo_por_unidade: conteudo,
      unidade_medida: unidadeMedida || null,
      ...(produtoValido
        ? { produto_id: produtoSelecionado.id }
        : {
            nome: buscaCompra.trim(),
            categoria: categoriaNovoProduto,
            unidade_controle: unidadeControle,
          }),
    };
  }

  function adicionarItemCompra() {
    try {
      const novoItem = montarItemCompra();
      setItensCompra((anteriores) => [...anteriores, novoItem]);
      setBuscaCompra("");
      setCategoriaNovoProduto("");
      setUnidadeControle("pacote");
      setQuantidadeCompra(1);
      setValorTotalItem("");
      setUnidadesPorEmbalagem("");
      setConteudoPorUnidade("");
      setUnidadeMedida("");
      setErroCompra("");
    } catch (erroValidacao) {
      setErroCompra(erroValidacao.message);
    }
  }

  function removerItemCompra(indice) {
    setItensCompra((anteriores) =>
      anteriores.filter((_, posicao) => posicao !== indice),
    );
  }

  async function registrarCompra(evento) {
    evento.preventDefault();
    if (salvandoCompra) return;

    // Inclui também o produto em edição, mesmo sem clicar em "Adicionar produto".
    let itensParaSalvar = [...itensCompra];
    if (buscaCompra.trim()) {
      try {
        itensParaSalvar.push(montarItemCompra());
      } catch (erroValidacao) {
        setErroCompra(erroValidacao.message);
        return;
      }
    } else if (valorTotalItem !== "" || unidadesPorEmbalagem !== "" ||
               conteudoPorUnidade !== "" || unidadeMedida !== "") {
      setErroCompra("Há dados de um produto sem nome. Complete ou limpe os campos antes de salvar.");
      return;
    }

    if (itensParaSalvar.length === 0) {
      setErroCompra("Informe pelo menos um produto para registrar a compra.");
      return;
    }

    if (!estabelecimentoId) {
      setErroCompra("Selecione um estabelecimento.");
      return;
    }

    if (estabelecimentoId === "novo" && !estabelecimentoNome.trim()) {
      setErroCompra("Informe o nome do novo estabelecimento.");
      return;
    }

    if (!dataCompra || dataCompra > dataLocal()) {
      setErroCompra("Informe uma data válida que não seja futura.");
      return;
    }

    // A API aceita um estabelecimento existente OU o nome de um novo.
    const estabelecimento =
      estabelecimentoId === "novo"
        ? { estabelecimento_nome: estabelecimentoNome.trim() }
        : { estabelecimento_id: Number(estabelecimentoId) };

    const dadosEnvio = {
      ...estabelecimento,
      data_compra: dataCompra,
      itens: itensParaSalvar,
    };

    setSalvandoCompra(true);
    setErroCompra("");
    setMensagemCompra("");

    try {
      const resposta = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosEnvio),
      });

      if (!resposta.ok) {
        const erroApi = await resposta.json().catch(() => null);
        const detalhe = erroApi?.detail;
        const descricao =
          typeof detalhe === "string"
            ? detalhe
            : "Não foi possível registrar a compra.";
        throw new Error(descricao);
      }

      // O POST foi confirmado. Não reenviar se uma consulta posterior falhar.
      setItensCompra([]);
      setBuscaCompra("");
      setCategoriaNovoProduto("");
      setUnidadeControle("pacote");
      setQuantidadeCompra(1);
      setValorTotalItem("");
      setUnidadesPorEmbalagem("");
      setConteudoPorUnidade("");
      setUnidadeMedida("");
      setDataCompra(dataLocal());
      setEstabelecimentoId("");
      setEstabelecimentoNome("");
      setMostrarFormularioCompra(false);
      setMensagemCompra("Compra registrada com sucesso!");

      // Reconsultar garante que a tela receba o formato completo do histórico,
      // os produtos novos e o estado atual do estoque.
      try {
        const rotas = [
          "/api/produtos",
          "/api/compras",
          "/api/lista-compras",
          "/api/financeiro/estabelecimentos",
        ];
        const respostas = await Promise.all(rotas.map((rota) => fetch(rota)));
        if (respostas.some((resposta) => !resposta.ok)) {
          throw new Error("Falha ao atualizar os dados.");
        }
        const [novosProdutos, novasCompras, novaLista, novosEstabelecimentos] =
          await Promise.all(respostas.map((resposta) => resposta.json()));
        setProdutos(novosProdutos);
        setCompras(novasCompras);
        setListaCompras(novaLista);
        setEstabelecimentos(novosEstabelecimentos);
      } catch {
        setMensagemCompra(
          "Compra registrada, mas não foi possível atualizar a tela. Recarregue a página para consultar os dados.",
        );
      }
    } catch (erroRegistro) {
      setErroCompra(erroRegistro.message || "Erro ao registrar a compra.");
    } finally {
      setSalvandoCompra(false);
    }
  }

  // ============================================================
  // 8. INTERFACE (JSX)
  // ============================================================
  return (
    <div className="app">
      {/* 8.1. Modal de confirmação de consumo */}
      {produtoParaConfirmar && (
        <div className="modal-fundo">
          <div
            className="modal-consumo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-modal-consumo"
          >
            <h2 id="titulo-modal-consumo">Confirmar consumo</h2>

            <p>
              Confirma que o {textoUnidade(produtoParaConfirmar, 1)} em uso de{" "}
              <strong>{produtoParaConfirmar.nome}</strong> acabou?
            </p>

            <div className="modal-informacao">
              <span>Unidades fechadas em estoque</span>
              <strong>{produtoParaConfirmar.pacotes_fechados}</strong>
            </div>

            <div className="modal-acoes">
              <button
                ref={botaoCancelarRef}
                type="button"
                onClick={() => setProdutoParaConfirmar(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  const produto = produtoParaConfirmar;
                  setProdutoParaConfirmar(null);
                  registrarConsumo(produto);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8.2. Cabeçalho e navegação */}
      <header className="cabecalho">
        <div>
          <h1>
            <button
              type="button"
              className="logo-home"
              onClick={() => navegarPara("Estoque")}
              aria-label="Voltar para o estoque"
              title="Voltar para o estoque"
            >
              OLIVIA.
            </button>
          </h1>
          <p>Sua casa sob controle.</p>
        </div>
      </header>

      <nav className="navegacao">
        {["Estoque", "Compras", "Histórico", "Financeiro"].map((item) => (
          <button
            key={item}
            type="button"
            className={pagina === item ? "ativo" : ""}
            onClick={() => navegarPara(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <main>
        {carregando && <p>Carregando informações...</p>}
        {erro && <p className="erro">{erro}</p>}
        {mensagemConsumo && (
          <p className="mensagem-consumo" role="status">
            {mensagemConsumo}
          </p>
        )}

        {/* 8.3. Página Estoque */}
        {!carregando && !erro && pagina === "Estoque" && (
          <section>
            <div className="titulo-secao">
              <div>
                <h2>Meu estoque</h2>
                <p>Acompanhe os produtos da casa.</p>
              </div>
              <span className="contador">
                {produtosFiltrados.length} de {produtos.length} produtos
              </span>
            </div>

            <div className="controles-estoque">
              <div className="linha-busca">
                <input
                  type="search"
                  placeholder="Buscar produto..."
                  aria-label="Buscar produto"
                  value={buscaProduto}
                  onChange={(evento) => setBuscaProduto(evento.target.value)}
                />
              </div>
              <div className="categorias-estoque">
                {categorias.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={categoriaFiltro === item ? "ativo" : ""}
                    onClick={() => setCategoriaFiltro(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {produtos.length === 0 ? (
              <div className="vazio">Nenhum produto cadastrado.</div>
            ) : produtosFiltrados.length === 0 ? (
              <div className="vazio">Nenhum produto encontrado.</div>
            ) : (
              <div className="tabela-estoque">
                <div
                  className="linha-estoque cabecalho-estoque"
                  style={{
                    gridTemplateColumns: "minmax(100px, 2fr) 70px 70px 90px",
                    padding: "10px 14px",
                  }}
                >
                  <span>Produto</span>
                  <span>Em uso</span>
                  <span>Estoque</span>
                  <span>Ação</span>
                </div>
                {produtosFiltrados.map((produto) => (
                  <div
                    className="linha-estoque"
                    key={produto.id}
                    style={{
                      gridTemplateColumns: "minmax(100px, 2fr) 70px 70px 90px",
                      padding: "8px 14px",
                    }}
                  >
                    <strong>{produto.nome}</strong>
                    <span>{produto.pacotes_em_uso}</span>
                    <span>{produto.pacotes_fechados}</span>
                    <div>
                      {disponivel(produto) === 0 ? (
                        <span className="esgotado">Esgotado</span>
                      ) : (
                        <button
                          type="button"
                          className="botao-consumir"
                          onClick={(evento) => {
                            botaoOrigemRef.current = evento.currentTarget;
                            setProdutoParaConfirmar(produto);
                          }}
                          disabled={produtoConsumindo !== null}
                        >
                          {produtoConsumindo === produto.id
                            ? "Registrando..."
                            : "Acabou"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 8.4. Página Compras */}
        {!carregando && !erro && pagina === "Compras" && (
          <section>
            <div className="titulo-secao">
              <div>
                <h2>Lista de compras</h2>
                <p>Produtos que precisam de reposição.</p>
              </div>
            </div>

            <button
              type="button"
              className="botao-novo"
              onClick={() => {
                setErroCompra("");
                setMensagemCompra("");
                setMostrarFormularioCompra(true);
              }}
            >
              + Registrar compra
            </button>

            {mensagemCompra && (
              <p className="mensagem-consumo" role="status">
                {mensagemCompra}
              </p>
            )}

            {mostrarFormularioCompra && (
              <form className="formulario-produto" onSubmit={registrarCompra}>
                <h3>Registrar compra</h3>
                <label htmlFor="estabelecimento-compra">Estabelecimento</label>
                <select
                  id="estabelecimento-compra"
                  value={estabelecimentoId}
                  onChange={(evento) => {
                    setEstabelecimentoId(evento.target.value);
                    setErroCompra("");
                  }}
                  required
                >
                  <option value="">Selecione um estabelecimento</option>
                  {estabelecimentos.map((estabelecimento) => (
                    <option key={estabelecimento.id} value={estabelecimento.id}>
                      {estabelecimento.nome}
                    </option>
                  ))}
                  <option value="novo">+ Novo estabelecimento</option>
                </select>

                {estabelecimentoId === "novo" && (
                  <div>
                    <label htmlFor="novo-estabelecimento">
                      Nome do estabelecimento
                    </label>

                    <input
                      id="novo-estabelecimento"
                      type="text"
                      placeholder="Ex.: Atacadão"
                      value={estabelecimentoNome}
                      onChange={(evento) =>
                        setEstabelecimentoNome(evento.target.value)
                      }
                      required
                    />
                  </div>
                )}

                <label htmlFor="busca-compra">Produto</label>
                <input
                  id="busca-compra"
                  type="search"
                  placeholder="Digite o nome, ex.: Açúcar"
                  value={buscaCompra}
                  onChange={(evento) => {
                    setBuscaCompra(evento.target.value);
                    setErroCompra("");
                  }}
                  autoComplete="off"
                />

                {produtoValido && (
                  <p className="mensagem-consumo">
                    Produto identificado automaticamente: {produtoSelecionado.nome}
                  </p>
                )}
                {!produtoValido && correspondencias.length > 0 && (
                  <div
                    className="sugestoes-produtos"
                    aria-label="Produtos encontrados"
                  >
                    <p>Produtos encontrados:</p>
                    {correspondencias.map((produto) => (
                      <button
                        key={produto.id}
                        type="button"
                        className="botao-cancelar"
                        style={{ margin: "0 8px 8px 0" }}
                        onClick={() => {
                          setBuscaCompra(produto.nome);
                          setErroCompra("");
                        }}
                      >
                        {produto.nome} ({produto.categoria})
                      </button>
                    ))}
                  </div>
                )}
                {podeCriar && (
                  <div>
                    <p>
                      Produto não encontrado. Vamos cadastrá-lo nesta compra.
                    </p>
                    <label>Categoria</label>
                    <div
                      className="categorias-estoque"
                      role="group"
                      aria-label="Categoria do novo produto"
                    >
                      {CATEGORIAS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={
                            categoriaNovoProduto === item ? "ativo" : ""
                          }
                          aria-pressed={categoriaNovoProduto === item}
                          onClick={() => setCategoriaNovoProduto(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>

                    <label htmlFor="unidade-controle">
                      Unidade de controle
                    </label>
                    <select
                      id="unidade-controle"
                      value={unidadeControle}
                      onChange={(evento) =>
                        setUnidadeControle(evento.target.value)
                      }
                    >
                      {UNIDADES_CONTROLE.map((unidade) => (
                        <option key={unidade} value={unidade}>
                          {unidade.charAt(0).toUpperCase() + unidade.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label htmlFor="quantidade-compra">
                  Quantidade (
                  {produtoValido
                    ? produtoSelecionado.unidade_controle
                    : unidadeControle}
                  )
                </label>
                <input
                  id="quantidade-compra"
                  type="number"
                  min="1"
                  step="1"
                  value={quantidadeCompra}
                  onChange={(evento) =>
                    setQuantidadeCompra(evento.target.value)
                  }
                />
                <label htmlFor="valor-item">Valor total do produto (R$)</label>

                <input
                  id="valor-item"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex.: 23,97"
                  value={valorTotalItem}
                  onChange={(evento) => setValorTotalItem(evento.target.value)}
                />

                <label htmlFor="unidades-embalagem">
                  Unidades por embalagem (opcional)
                </label>
                <input
                  id="unidades-embalagem"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ex.: 12 rolos"
                  value={unidadesPorEmbalagem}
                  onChange={(evento) =>
                    setUnidadesPorEmbalagem(evento.target.value)
                  }
                />

                <label htmlFor="conteudo-unidade">
                  Conteúdo por unidade (opcional)
                </label>
                <input
                  id="conteudo-unidade"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Ex.: 30"
                  value={conteudoPorUnidade}
                  onChange={(evento) =>
                    setConteudoPorUnidade(evento.target.value)
                  }
                />

                <label htmlFor="unidade-medida">
                  Unidade de medida (opcional)
                </label>
                <select
                  id="unidade-medida"
                  value={unidadeMedida}
                  onChange={(evento) => setUnidadeMedida(evento.target.value)}
                >
                  <option value="">Não informar</option>
                  <option value="g">Gramas (g)</option>
                  <option value="kg">Quilogramas (kg)</option>
                  <option value="mL">Mililitros (mL)</option>
                  <option value="L">Litros (L)</option>
                  <option value="m">Metros (m)</option>
                </select>

                <label htmlFor="data-compra">Data da compra</label>
                <input
                  id="data-compra"
                  type="date"
                  value={dataCompra}
                  max={dataLocal()}
                  onChange={(evento) => setDataCompra(evento.target.value)}
                  required
                />
                <button
                  type="button"
                  className="botao-novo"
                  onClick={adicionarItemCompra}
                >
                  + Adicionar produto à compra
                </button>

                {itensCompra.length > 0 && (
                  <div className="lista">
                    <h4>Produtos desta compra ({itensCompra.length})</h4>

                    {itensCompra.map((item, indice) => {
                      const produto = produtos.find(
                        (p) => p.id === item.produto_id,
                      );

                      return (
                        <details key={indice}>
                          <summary>
                            {item.nome || produto?.nome || "Produto"}
                            {" · "}
                            R$ {Number(item.valor_total).toFixed(2)}
                          </summary>

                          <p>Quantidade: {item.quantidade}</p>
                          <p>
                            Categoria: {item.categoria || produto?.categoria}
                          </p>
                          <button
                            type="button"
                            onClick={() => removerItemCompra(indice)}
                          >
                            Remover produto
                          </button>
                        </details>
                      );
                    })}
                  </div>
                )}

                {erroCompra && (
                  <p className="erro" role="alert">
                    {erroCompra}
                  </p>
                )}

                <div className="acoes-formulario">
                  <button
                    type="button"
                    className="botao-cancelar"
                    onClick={fecharFormularioCompra}
                    disabled={salvandoCompra}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="botao-salvar"
                    disabled={salvandoCompra}
                  >
                    {salvandoCompra ? "Salvando..." : "Salvar compra"}
                  </button>
                </div>
              </form>
            )}

            {listaCompras.length === 0 ? (
              <div className="vazio">Nenhum produto precisa de reposição.</div>
            ) : (
              <div className="lista">
                {listaCompras.map((produto) => (
                  <article className="produto" key={produto.id}>
                    <div>
                      <h3>{produto.nome}</h3>
                      <p>{produto.categoria}</p>
                    </div>
                    <span className="esgotado">Comprar</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 8.5. Página Histórico */}
        {!carregando && !erro && pagina === "Histórico" && (
          <section>
            <div className="titulo-secao">
              <div>
                <h2>Histórico de compras</h2>
                <p>Consulte as compras registradas no Domus.</p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <input
                type="search"
                placeholder="Buscar produto..."
                aria-label="Buscar produto no histórico"
                value={buscaHistorico}
                onChange={(evento) => setBuscaHistorico(evento.target.value)}
                style={{ flex: "1 1 180px", minWidth: 0 }}
              />
              <select
                aria-label="Filtrar histórico por período"
                value={filtroHistorico}
                onChange={(evento) => setFiltroHistorico(evento.target.value)}
                style={{ flex: "0 1 160px" }}
              >
                <option value="mes">Este mês</option>
                <option value="todas">Todas</option>
                <option value="periodo">Período</option>
              </select>
            </div>

            {filtroHistorico === "periodo" && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <label
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  De
                  <input
                    type="date"
                    value={dataInicio}
                    max={dataFim || dataLocal()}
                    onChange={(evento) => setDataInicio(evento.target.value)}
                  />
                </label>
                <label
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  Até
                  <input
                    type="date"
                    value={dataFim}
                    min={dataInicio || undefined}
                    max={dataLocal()}
                    onChange={(evento) => setDataFim(evento.target.value)}
                  />
                </label>
              </div>
            )}

            {(() => {
              const hoje = dataLocal();

              const registros = compras
                .filter((compra) => {
                  const data = compra.data_compra;
                  const correspondeNome = compra.itens.some((item) =>
                    normalizar(item.produto_nome).includes(
                      normalizar(buscaHistorico),
                    ),
                  );

                  const correspondePeriodo =
                    filtroHistorico === "todas" ||
                    (filtroHistorico === "mes" &&
                      data.startsWith(hoje.slice(0, 7))) ||
                    (filtroHistorico === "periodo" &&
                      (!dataInicio || data >= dataInicio) &&
                      (!dataFim || data <= dataFim));

                  return correspondeNome && correspondePeriodo;
                })
                .sort(
                  (a, b) =>
                    b.data_compra.localeCompare(a.data_compra) || b.id - a.id,
                );

              if (registros.length === 0) {
                return (
                  <div className="vazio">
                    Nenhuma compra encontrada neste filtro.
                  </div>
                );
              }

              const grupos = agruparComprasPorData(registros);

              return (
                <div style={{ display: "grid", gap: 16 }}>
                  {Object.entries(grupos)
                    .sort(([dataA], [dataB]) => dataB.localeCompare(dataA))
                    .map(([data, comprasDoDia]) => (
                      <details
                        key={data}
                        className="tabela-estoque"
                        style={{ overflow: "hidden" }}
                      >
                        <summary
                          style={{
                            padding: "12px 14px",
                            background: "#f4f7f4",
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              width: "calc(100% - 24px)",
                              verticalAlign: "middle",
                            }}
                          >
                            <strong>
                              {data.split("-").reverse().join("/")}
                            </strong>

                            <span style={{ fontSize: 12, color: "#667" }}>
                              {comprasDoDia.length}{" "}
                              {comprasDoDia.length === 1
                                ? "registro"
                                : "registros"}
                            </span>
                          </span>
                        </summary>

                        {comprasDoDia.map((compra) => (
                          <details
                            key={compra.id}
                            className="historico-item-detalhe"
                          >
                            <summary
                              style={{
                                padding: "12px 14px",
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              <strong>{compra.estabelecimento_nome}</strong>

                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                {Number(compra.valor_total).toLocaleString(
                                  "pt-BR",
                                  {
                                    style: "currency",
                                    currency: "BRL",
                                  },
                                )}

                                <span
                                  className="seta-detalhe"
                                  aria-hidden="true"
                                >
                                  ▾
                                </span>
                              </span>
                            </summary>

                            {compra.itens.map((item) => (
                              <div
                                key={item.id}
                                style={{
                                  padding: "10px 14px",
                                  borderTop: "1px solid #e1e9e1",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                }}
                              >
                                <span>
                                  {item.produto_nome} · {item.quantidade}
                                </span>

                                <strong>
                                  {Number(item.valor_total).toLocaleString(
                                    "pt-BR",
                                    {
                                      style: "currency",
                                      currency: "BRL",
                                    },
                                  )}
                                </strong>
                              </div>
                            ))}
                          </details>
                        ))}
                      </details>
                    ))}
                </div>
              );
            })()}
          </section>
        )}

        {/* 8.6. Painel Financeiro */}
        {!carregando && !erro && pagina === "Financeiro" && (
          <section className="fin-painel">
            <header className="fin-cabecalho">
              <div>
                <span className="fin-sobretitulo">VISÃO GERAL</span>
                <h2>Financeiro</h2>
                <p>Acompanhe os gastos com compras da casa.</p>
              </div>
              <div className="fin-periodo">
                <label htmlFor="mes-financeiro">Mês de referência</label>
                <input
                  id="mes-financeiro"
                  type="month"
                  value={mesFinanceiro}
                  max={dataLocal().slice(0, 7)}
                  onChange={(evento) => setMesFinanceiro(evento.target.value)}
                />
              </div>
            </header>

            <div className="fin-indicadores">
              <article className="fin-indicador fin-indicador-principal">
                <div className="fin-indicador-topo">
                  <span>Total gasto no mês</span>
                  <span className="fin-icone" aria-hidden="true">◈</span>
                </div>
                <strong>{formatarMoeda(totalFinanceiro)}</strong>
                <span className="fin-indicador-legenda">
                  {new Date(`${mesFinanceiro}-01T12:00:00`).toLocaleDateString("pt-BR", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </article>
              <article className="fin-indicador fin-indicador-secundario">
                <div className="fin-indicador-topo">
                  <span>Compras realizadas</span>
                  <span className="fin-icone" aria-hidden="true">▤</span>
                </div>
                <strong>{comprasDoMes.length}</strong>
                <span className="fin-indicador-legenda">Registros no período</span>
              </article>
            </div>

            {comprasDoMes.length === 0 ? (
              <div className="fin-vazio">
                <strong>Nenhuma compra neste mês</strong>
                <p>Selecione outro período para visualizar os gastos.</p>
              </div>
            ) : (
              <div className="fin-detalhes">
                <article className="fin-cartao">
                  <div className="fin-cartao-cabecalho">
                    <h3>Gastos por categoria</h3>
                    <p>Distribuição das despesas</p>
                  </div>
                  {(() => {
                    const categoriasOrdenadas = ordenarGastos(gastosCategoria);
                    const cores = ["#267450", "#98c5a8", "#d4a96c", "#749eab", "#a8a3c9", "#a4b6a7"];
                    const somaCategorias = categoriasOrdenadas.reduce((acc, [, valor]) => acc + valor, 0);
                    let posicao = 0;
                    const segmentos = categoriasOrdenadas.map(([, valor], indice) => {
                      const inicio = posicao;
                      posicao += somaCategorias > 0 ? valor / somaCategorias * 100 : 0;
                      return `${cores[indice % cores.length]} ${inicio}% ${posicao}%`;
                    });
                    const principal = categoriasOrdenadas[0];
                    const percentualPrincipal = somaCategorias > 0
                      ? (principal[1] / somaCategorias * 100).toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })
                      : "0";

                    return (
                      <div className="fin-categorias-layout">
                        <div
                          className="fin-rosca"
                          role="img"
                          aria-label={`Distribuição de gastos por categoria: ${categoriasOrdenadas.map(([nome, valor]) => `${nome}, ${formatarMoeda(valor)}`).join("; ")}`}
                          style={{
                            background: somaCategorias > 0
                              ? `conic-gradient(${segmentos.join(", ")})`
                              : "#e6eee8",
                          }}
                        >
                          <div className="fin-rosca-centro">
                            <strong>{percentualPrincipal}%</strong>
                            <span>{principal?.[0] || "Sem dados"}</span>
                          </div>
                        </div>
                        <div className="fin-legenda">
                          {categoriasOrdenadas.map(([categoria, valor], indice) => (
                            <div className="fin-legenda-item" key={categoria}>
                              <span
                                className="fin-legenda-cor"
                                style={{ background: cores[indice % cores.length] }}
                                aria-hidden="true"
                              />
                              <span className="fin-legenda-nome">{categoria}</span>
                              <strong>{formatarMoeda(valor)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </article>

                <article className="fin-cartao">
                  <div className="fin-cartao-cabecalho">
                    <h3>Onde você mais gastou</h3>
                    <p>Despesas por estabelecimento</p>
                  </div>
                  <div className="fin-estabelecimentos">
                    {ordenarGastos(gastosEstabelecimento).map(([nome, valor]) => (
                      <div className="fin-estabelecimento" key={nome}>
                        <div className="fin-estabelecimento-linha">
                          <span>{nome}</span>
                          <strong>{formatarMoeda(valor)}</strong>
                        </div>
                        <div className="fin-barra" aria-hidden="true">
                          <div
                            style={{
                              width: `${totalFinanceiro > 0 ? Math.min(100, (valor / totalFinanceiro) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="fin-percentual">
                          {totalFinanceiro > 0
                            ? `${(valor / totalFinanceiro * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`
                            : "0% do total"}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
