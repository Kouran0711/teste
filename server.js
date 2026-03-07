const express = require("express");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// Banco falso em memória
let usuarios = [];
let motoristas = [];
let corridas = [];

let proximoUsuarioId = 1;
let proximoMotoristaId = 1;
let proximaCorridaId = 1;

// Rota inicial
app.get("/", (req, res) => {
  res.send("Backend do app de corrida funcionando!");
});

// Status da API
app.get("/status", (req, res) => {
  res.json({
    ok: true,
    mensagem: "API online",
    horario: new Date().toISOString()
  });
});

// Cadastro de usuário
app.post("/usuarios", (req, res) => {
  const { nome, telefone } = req.body;

  if (!nome || !telefone) {
    return res.status(400).json({
      ok: false,
      mensagem: "Nome e telefone são obrigatórios"
    });
  }

  const usuario = {
    id: proximoUsuarioId++,
    nome,
    telefone
  };

  usuarios.push(usuario);

  res.status(201).json({
    ok: true,
    mensagem: "Usuário cadastrado com sucesso",
    usuario
  });
});

// Listar usuários
app.get("/usuarios", (req, res) => {
  res.json({
    ok: true,
    usuarios
  });
});

// Cadastro de motorista
app.post("/motoristas", (req, res) => {
  const { nome, carro, placa } = req.body;

  if (!nome || !carro || !placa) {
    return res.status(400).json({
      ok: false,
      mensagem: "Nome, carro e placa são obrigatórios"
    });
  }

  const motorista = {
    id: proximoMotoristaId++,
    nome,
    carro,
    placa,
    disponivel: true
  };

  motoristas.push(motorista);

  res.status(201).json({
    ok: true,
    mensagem: "Motorista cadastrado com sucesso",
    motorista
  });
});

// Listar motoristas
app.get("/motoristas", (req, res) => {
  res.json({
    ok: true,
    motoristas
  });
});

// Solicitar corrida
app.post("/corridas", (req, res) => {
  const { usuarioId, origem, destino } = req.body;

  if (!usuarioId || !origem || !destino) {
    return res.status(400).json({
      ok: false,
      mensagem: "usuarioId, origem e destino são obrigatórios"
    });
  }

  const usuario = usuarios.find((u) => u.id === Number(usuarioId));

  if (!usuario) {
    return res.status(404).json({
      ok: false,
      mensagem: "Usuário não encontrado"
    });
  }

  const corrida = {
    id: proximaCorridaId++,
    usuarioId: usuario.id,
    motoristaId: null,
    origem,
    destino,
    status: "aguardando_motorista",
    criadaEm: new Date().toISOString()
  };

  corridas.push(corrida);

  res.status(201).json({
    ok: true,
    mensagem: "Corrida solicitada com sucesso",
    corrida
  });
});

// Listar corridas
app.get("/corridas", (req, res) => {
  res.json({
    ok: true,
    corridas
  });
});

// Motorista aceitar corrida
app.put("/corridas/:id/aceitar", (req, res) => {
  const corridaId = Number(req.params.id);
  const { motoristaId } = req.body;

  const corrida = corridas.find((c) => c.id === corridaId);

  if (!corrida) {
    return res.status(404).json({
      ok: false,
      mensagem: "Corrida não encontrada"
    });
  }

  if (corrida.status !== "aguardando_motorista") {
    return res.status(400).json({
      ok: false,
      mensagem: "Essa corrida não pode mais ser aceita"
    });
  }

  const motorista = motoristas.find((m) => m.id === Number(motoristaId));

  if (!motorista) {
    return res.status(404).json({
      ok: false,
      mensagem: "Motorista não encontrado"
    });
  }

  if (!motorista.disponivel) {
    return res.status(400).json({
      ok: false,
      mensagem: "Motorista indisponível"
    });
  }

  corrida.motoristaId = motorista.id;
  corrida.status = "motorista_a_caminho";
  motorista.disponivel = false;

  res.json({
    ok: true,
    mensagem: "Corrida aceita com sucesso",
    corrida
  });
});

// Iniciar corrida
app.put("/corridas/:id/iniciar", (req, res) => {
  const corridaId = Number(req.params.id);
  const corrida = corridas.find((c) => c.id === corridaId);

  if (!corrida) {
    return res.status(404).json({
      ok: false,
      mensagem: "Corrida não encontrada"
    });
  }

  if (corrida.status !== "motorista_a_caminho") {
    return res.status(400).json({
      ok: false,
      mensagem: "A corrida não pode ser iniciada agora"
    });
  }

  corrida.status = "em_andamento";

  res.json({
    ok: true,
    mensagem: "Corrida iniciada com sucesso",
    corrida
  });
});

// Finalizar corrida
app.put("/corridas/:id/finalizar", (req, res) => {
  const corridaId = Number(req.params.id);
  const corrida = corridas.find((c) => c.id === corridaId);

  if (!corrida) {
    return res.status(404).json({
      ok: false,
      mensagem: "Corrida não encontrada"
    });
  }

  if (corrida.status !== "em_andamento") {
    return res.status(400).json({
      ok: false,
      mensagem: "A corrida não pode ser finalizada agora"
    });
  }

  corrida.status = "finalizada";

  const motorista = motoristas.find((m) => m.id === corrida.motoristaId);
  if (motorista) {
    motorista.disponivel = true;
  }

  res.json({
    ok: true,
    mensagem: "Corrida finalizada com sucesso",
    corrida
  });
});

// Buscar corrida por ID
app.get("/corridas/:id", (req, res) => {
  const corridaId = Number(req.params.id);
  const corrida = corridas.find((c) => c.id === corridaId);

  if (!corrida) {
    return res.status(404).json({
      ok: false,
      mensagem: "Corrida não encontrada"
    });
  }

  res.json({
    ok: true,
    corrida
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});