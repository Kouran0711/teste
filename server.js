const express = require("express");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;

// Banco falso em memoria
let usuarios = [];
let motoristas = [];
let corridas = [];

let proximoUsuarioId = 1;
let proximoMotoristaId = 1;
let proximaCorridaId = 1;

function toNumber(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function nowIso() {
  return new Date().toISOString();
}

// Status da API
app.get("/status", (req, res) => {
  res.json({
    ok: true,
    mensagem: "API online",
    horario: new Date().toISOString()
  });
});

// Cadastro de usuario
app.post("/usuarios", (req, res) => {
  const { nome, telefone } = req.body;

  if (!nome || !telefone) {
    return res.status(400).json({
      ok: false,
      mensagem: "Nome e telefone sao obrigatorios"
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
    mensagem: "Usuario cadastrado com sucesso",
    usuario
  });
});

// Listar usuarios
app.get("/usuarios", (req, res) => {
  res.json({
    ok: true,
    usuarios
  });
});

// Cadastro de motorista
app.post("/motoristas", (req, res) => {
  const { nome, carro, placa, cor } = req.body;

  if (!nome || !carro || !placa) {
    return res.status(400).json({
      ok: false,
      mensagem: "Nome, carro e placa sao obrigatorios"
    });
  }

  const motorista = {
    id: proximoMotoristaId++,
    nome,
    carro,
    placa,
    cor: cor || null,
    disponivel: false,
    latitude: null,
    longitude: null
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

// Atualizar status e localizacao do motorista
app.put("/motoristas/:id/status", (req, res) => {
  const motoristaId = Number(req.params.id);
  const { disponivel, latitude, longitude } = req.body;

  const motorista = motoristas.find((m) => m.id === motoristaId);

  if (!motorista) {
    return res.status(404).json({
      ok: false,
      mensagem: "Motorista nao encontrado"
    });
  }

  if (typeof disponivel === "boolean") {
    motorista.disponivel = disponivel;
  }

  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (lat !== null && lng !== null) {
    motorista.latitude = lat;
    motorista.longitude = lng;
  }

  res.json({
    ok: true,
    motorista
  });
});

// Solicitar corrida
app.post("/corridas", (req, res) => {
  const {
    usuarioId,
    origem,
    destino,
    origemLat,
    origemLng,
    destinoLat,
    destinoLng,
    distanciaKm,
    pagamentoMetodo
  } = req.body;

  if (!usuarioId || !origem || !destino) {
    return res.status(400).json({
      ok: false,
      mensagem: "usuarioId, origem e destino sao obrigatorios"
    });
  }

  const usuario = usuarios.find((u) => u.id === Number(usuarioId));

  if (!usuario) {
    return res.status(404).json({
      ok: false,
      mensagem: "Usuario nao encontrado"
    });
  }

  const oLat = toNumber(origemLat);
  const oLng = toNumber(origemLng);
  const dLat = toNumber(destinoLat);
  const dLng = toNumber(destinoLng);
  const distInformada = toNumber(distanciaKm);

  let distanciaCalculada = 0;
  if (oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
    distanciaCalculada = haversineKm(oLat, oLng, dLat, dLng);
  } else if (distInformada !== null) {
    distanciaCalculada = distInformada;
  }

  const distanciaFinal = Number(distanciaCalculada.toFixed(2));
  const valorFinal = Number((distanciaFinal * 1).toFixed(2));

  const corrida = {
    id: proximaCorridaId++,
    usuarioId: usuario.id,
    motoristaId: null,
    origem,
    destino,
    origemLat: oLat,
    origemLng: oLng,
    destinoLat: dLat,
    destinoLng: dLng,
    distanciaKm: distanciaFinal,
    valor: valorFinal,
    pagamentoMetodo: pagamentoMetodo || "dinheiro",
    status: "aguardando_motorista",
    criadaEm: nowIso(),
    aceitaEm: null,
    iniciadaEm: null,
    finalizadaEm: null,
    canceladaEm: null
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

// Listar corridas pendentes para motorista com prioridade por distancia
app.get("/corridas/pendentes", (req, res) => {
  const motoristaId = Number(req.query.motoristaId);

  if (!motoristaId) {
    return res.status(400).json({
      ok: false,
      mensagem: "motoristaId e obrigatorio"
    });
  }

  const motorista = motoristas.find((m) => m.id === motoristaId);

  if (!motorista) {
    return res.status(404).json({
      ok: false,
      mensagem: "Motorista nao encontrado"
    });
  }

  const pendentes = corridas
    .filter((c) => c.status === "aguardando_motorista")
    .map((c) => {
      const dist =
        motorista.latitude !== null &&
        motorista.longitude !== null &&
        c.origemLat !== null &&
        c.origemLng !== null
          ? Number(haversineKm(motorista.latitude, motorista.longitude, c.origemLat, c.origemLng).toFixed(2))
          : null;
      return { ...c, distanciaParaMotoristaKm: dist };
    })
    .sort((a, b) => {
      const da = a.distanciaParaMotoristaKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanciaParaMotoristaKm ?? Number.POSITIVE_INFINITY;
      return da - db;
    });

  res.json({
    ok: true,
    corridas: pendentes
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
      mensagem: "Corrida nao encontrada"
    });
  }

  if (corrida.status !== "aguardando_motorista") {
    return res.status(400).json({
      ok: false,
      mensagem: "Essa corrida nao pode mais ser aceita"
    });
  }

  const motorista = motoristas.find((m) => m.id === Number(motoristaId));

  if (!motorista) {
    return res.status(404).json({
      ok: false,
      mensagem: "Motorista nao encontrado"
    });
  }

  if (!motorista.disponivel) {
    return res.status(400).json({
      ok: false,
      mensagem: "Motorista indisponivel"
    });
  }

  corrida.motoristaId = motorista.id;
  corrida.status = "motorista_a_caminho";
  corrida.aceitaEm = nowIso();
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
      mensagem: "Corrida nao encontrada"
    });
  }

  if (corrida.status !== "motorista_a_caminho") {
    return res.status(400).json({
      ok: false,
      mensagem: "A corrida nao pode ser iniciada agora"
    });
  }

  corrida.status = "em_andamento";
  corrida.iniciadaEm = nowIso();

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
      mensagem: "Corrida nao encontrada"
    });
  }

  if (corrida.status !== "em_andamento") {
    return res.status(400).json({
      ok: false,
      mensagem: "A corrida nao pode ser finalizada agora"
    });
  }

  corrida.status = "finalizada";
  corrida.finalizadaEm = nowIso();

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
      mensagem: "Corrida nao encontrada"
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
