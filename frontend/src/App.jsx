import { useEffect, useState } from "react";
import "./App.css";

const ROTAS = {
  Estoque: "/estoque",
  Compras: "/compras",
  Histórico: "/historico",
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

function App() {
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
  const [produtos, setProdutos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [listaCompras, setListaCompras] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagemConsumo, setMensagemConsumo] = useState("");
  const [produtoConsumindo, setProdutoConsumindo] = useState(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [mostrarFormularioCompra, setMostrarFormularioCompra] = useState(false);
  const [buscaCompra, setBuscaCompra] = useState("");
  const [produtoCompraId, setProdutoCompraId] = useState("");
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
  const [filtroHistorico, setFiltroHistorico] = useState("mes");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    async function carregarDados() {
      setCarregando(true);
      setErro("");
      try {
        const respostas = await Promise.all(
          ["/produtos", "/compras", "/lista-compras"].map((rota) =>
            fetch(`/api${rota}`),
          ),
        );
        if (respostas.some((resposta) => !resposta.ok)) {
          throw new Error("Falha ao consultar a API.");
        }
        const [dadosProdutos, dadosCompras, dadosLista] = await Promise.all(
          respostas.map((resposta) => resposta.json()),
        );
        setProdutos(dadosProdutos);
        setCompras(dadosCompras);
        setListaCompras(dadosLista);
      } catch {
        setErro("Não foi possível conectar ao backend do Domus.");
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, []);

  const disponivel = (produto) =>
    produto.pacotes_em_uso + produto.pacotes_fechados;

  const textoUnidade = (produto, quantidade) => {
    const unidade = produto.unidade_controle || "pacote";
    if (quantidade === 1) return unidade;
    return unidade === "unidade" ? "unidades" : `${unidade}s`;
  };

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

  async function registrarConsumo(produto) {
    if (produtoConsumindo !== null) return;
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
      const restantes = disponivel(atualizado);
      setMensagemConsumo(
        `Consumo registrado! 1 ${textoUnidade(produto, 1)} de ${produto.nome} foi consumido. ` +
          `Restam ${restantes} ${textoUnidade(produto, restantes)}.`,
      );
    } catch {
      setMensagemConsumo(
        "Não foi possível registrar o consumo. Tente novamente.",
      );
    } finally {
      setProdutoConsumindo(null);
    }
  }

  const termoCompra = normalizar(buscaCompra);
  const correspondencias = termoCompra
    ? produtos.filter((produto) =>
        normalizar(produto.nome).includes(termoCompra),
      )
    : [];
  const correspondenciaExata = produtos.find(
    (produto) => termoCompra && normalizar(produto.nome) === termoCompra,
  );
  const produtoSelecionado = produtos.find(
    (produto) => produto.id === Number(produtoCompraId),
  );
  const produtoValido =
    produtoSelecionado && normalizar(produtoSelecionado.nome) === termoCompra;
  const podeCriar =
    termoCompra.length > 0 && !correspondenciaExata && !produtoValido;

  function fecharFormularioCompra() {
    setMostrarFormularioCompra(false);
    setErroCompra("");
  }

  async function registrarCompra(evento) {
    evento.preventDefault();
    if (salvandoCompra) return;

    const quantidade = Number(quantidadeCompra);
    const novo = podeCriar;
    const dadosValidos =
      Number.isInteger(quantidade) &&
      quantidade > 0 &&
      Boolean(dataCompra) &&
      dataCompra <= dataLocal() &&
      (novo
        ? Boolean(buscaCompra.trim() && categoriaNovoProduto)
        : Boolean(produtoValido));

    if (dataCompra > dataLocal()) {
      setErroCompra("A data da compra não pode ser futura.");
      return;
    }

    if (!dadosValidos) {
      setErroCompra(
        "Selecione um produto ou preencha os dados do novo produto.",
      );
      return;
    }

    if (novo && correspondencias.length > 0) {
      const confirmado = window.confirm(
        `Já existem produtos com nomes parecidos: ${correspondencias.map((p) => p.nome).join(", ")}.\n\nDeseja cadastrar "${buscaCompra.trim()}" como um produto diferente?`,
      );
      if (!confirmado) return;
    }

    setSalvandoCompra(true);
    setErroCompra("");
    setMensagemCompra("");

    try {
      const rota = novo ? "/api/compras/novo-produto" : "/api/compras";
      const dadosEnvio = novo
        ? {
            nome: buscaCompra.trim(),
            categoria: categoriaNovoProduto.trim(),
            unidade_controle: unidadeControle,
            quantidade,
            data_compra: dataCompra,
          }
        : {
            produto_id: produtoSelecionado.id,
            quantidade,
            data_compra: dataCompra,
          };
      Object.assign(dadosEnvio, {
        unidades_por_embalagem:
          unidadesPorEmbalagem === "" ? null : Number(unidadesPorEmbalagem),
        conteudo_por_unidade:
          conteudoPorUnidade === "" ? null : Number(conteudoPorUnidade),
        unidade_medida: unidadeMedida || null,
      });

      const resposta = await fetch(rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosEnvio),
      });
      if (!resposta.ok) throw new Error("Falha ao registrar compra.");

      const dados = await resposta.json();
      const atualizado = dados.estoque_atualizado;

      setProdutos((anteriores) =>
        novo
          ? [...anteriores, atualizado]
          : anteriores.map((produto) =>
              produto.id === atualizado.id ? atualizado : produto,
            ),
      );
      setCompras((anteriores) =>
        [dados.compra, ...anteriores].sort(
          (a, b) => b.data_compra.localeCompare(a.data_compra) || b.id - a.id,
        ),
      );
      setListaCompras((anteriores) =>
        anteriores.filter((produto) => produto.id !== atualizado.id),
      );

      setMensagemCompra(
        novo
          ? "Produto cadastrado e compra registrada!"
          : "Compra registrada com sucesso!",
      );
      setMostrarFormularioCompra(false);
      setProdutoCompraId("");
      setBuscaCompra("");
      setCategoriaNovoProduto("");
      setUnidadeControle("pacote");
      setQuantidadeCompra(1);
      setUnidadesPorEmbalagem("");
      setConteudoPorUnidade("");
      setUnidadeMedida("");
      setDataCompra(dataLocal());
    } catch {
      setErroCompra("Não foi possível registrar a compra. Tente novamente.");
    } finally {
      setSalvandoCompra(false);
    }
  }

  return (
    <div className="app">
      <header className="cabecalho">
        <div>
          <h1>OLIVIA.</h1>
          <p>Sua casa sob controle.</p>
        </div>
        <span className="identidade">Ecl 4:12</span>
      </header>

      <nav className="navegacao">
        {["Estoque", "Compras", "Histórico"].map((item) => (
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
                          onClick={() => {
                            const atual = disponivel(produto);
                            const confirmado = window.confirm(
                              `Deseja registrar o término de 1 ${textoUnidade(produto, 1)} de ${produto.nome}?\n\n` +
                                `Estoque atual: ${atual} ${textoUnidade(produto, atual)}.\n` +
                                `Após a baixa: ${atual - 1} ${textoUnidade(produto, atual - 1)}.`,
                            );
                            if (confirmado) registrarConsumo(produto);
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

                <label htmlFor="busca-compra">Produto</label>
                <input
                  id="busca-compra"
                  type="search"
                  placeholder="Digite o nome, ex.: Açúcar"
                  value={buscaCompra}
                  onChange={(evento) => {
                    setBuscaCompra(evento.target.value);
                    setProdutoCompraId("");
                    setErroCompra("");
                  }}
                  autoComplete="off"
                  required
                />

                {correspondenciaExata && !produtoValido && (
                  <p>Este produto já está cadastrado. Selecione-o abaixo.</p>
                )}
                {produtoValido && (
                  <p className="mensagem-consumo">
                    Produto selecionado: {produtoSelecionado.nome}
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
                          setProdutoCompraId(String(produto.id));
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
                  required
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
                  const nome =
                    produtos.find((produto) => produto.id === compra.produto_id)
                      ?.nome ?? "";

                  const correspondeNome = normalizar(nome).includes(
                    normalizar(buscaHistorico),
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

                        {comprasDoDia.map((compra) => {
                          const produto = produtos.find(
                            (item) => item.id === compra.produto_id,
                          );

                          const nome =
                            produto?.nome ?? `Produto #${compra.produto_id}`;

                          const quantidadeTexto = `${compra.quantidade} ${textoUnidade(
                            produto || { unidade_controle: "pacote" },
                            compra.quantidade,
                          )}`;

                          const possuiDetalhes =
                            compra.unidades_por_embalagem != null ||
                            compra.conteudo_por_unidade != null ||
                            Boolean(compra.unidade_medida);

                          const conteudo = (
                            <div
                              style={{
                                padding: "10px 14px",
                                background: "#fafcfb",
                                borderTop: "1px solid #e1e9e1",
                                fontSize: 13,
                                color: "#555",
                              }}
                            >
                              {compra.unidades_por_embalagem != null && (
                                <p style={{ margin: "4px 0" }}>
                                  Unidades por embalagem:{" "}
                                  <strong>
                                    {compra.unidades_por_embalagem}
                                  </strong>
                                </p>
                              )}

                              {compra.conteudo_por_unidade != null && (
                                <p style={{ margin: "4px 0" }}>
                                  Conteúdo por unidade:{" "}
                                  <strong>
                                    {compra.conteudo_por_unidade}{" "}
                                    {compra.unidade_medida || ""}
                                  </strong>
                                </p>
                              )}

                              {compra.conteudo_por_unidade == null &&
                                compra.unidade_medida && (
                                  <p style={{ margin: "4px 0" }}>
                                    Unidade de medida:{" "}
                                    <strong>{compra.unidade_medida}</strong>
                                  </p>
                                )}
                            </div>
                          );

                          return possuiDetalhes ? (
                            <details
                              key={compra.id}
                              className="historico-item-detalhe"
                              style={{ borderTop: "1px solid #e1e9e1" }}
                            >
                              <summary
                                style={{
                                  padding: "12px 14px",
                                  cursor: "pointer",
                                  listStyle: "none",
                                }}
                              >
                                <span
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 12,
                                  }}
                                >
                                  <strong>{nome}</strong>

                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    {quantidadeTexto}
                                    <span
                                      className="seta-detalhe"
                                      aria-hidden="true"
                                    >
                                      ▾
                                    </span>
                                  </span>
                                </span>
                              </summary>
                              {conteudo}
                            </details>
                          ) : (
                            <div
                              key={compra.id}
                              style={{
                                padding: "12px 14px",
                                borderTop: "1px solid #e1e9e1",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              <strong>{nome}</strong>
                              <span>{quantidadeTexto}</span>
                            </div>
                          );
                        })}
                      </details>
                    ))}
                </div>
              );
            })()}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
