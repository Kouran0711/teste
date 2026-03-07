const express = require("express");
const path = require("path");
const crypto = require("crypto");
const supabase = require("./supabase");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;

const coordsPorCorrida = new Map();

function nowIso() {
  return new Date().toISOString();
}

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

function attachCoords(corrida) {
  if (!corrida) return corrida;
  const coords = coordsPorCorrida.get(corrida.id);
  if (!coords) {
    return corrida;
  }
  return {
    ...corrida,
    origemLat: coords.origemLat ?? null,
    origemLng: coords.origemLng ?? null,
    destinoLat: coords.destinoLat ?? null,
    destinoLng: coords.destinoLng ?? null
  };
}

function hashSenha(senha) {
  const salt = process.env.SENHA_SALT || "";
  return crypto.createHash("sha256").update(String(senha) + salt).digest("hex");
}

function sanitizeUsuario(usuario) {
  if (!usuario) return usuario;
  const { senha_hash, ...rest } = usuario;
  return rest;
}

async function buscarUsuarioPorIdentificador(identificador) {
  let { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("telefone", identificador)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (data) {
    return { data, error: null };
  }

  const response = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", identificador)
    .maybeSingle();

  return response;
}

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    mensagem: "API online",
    horario: new Date().toISOString()
  });
});

app.get("/config", (req, res) => {
  res.json({
    ok: true,
    mapboxToken: process.env.MAPBOX_TOKEN || "",
    mapboxStyle: process.env.MAPBOX_STYLE || "mapbox://styles/mapbox/streets-v12"
  });
});

app.get("/usuarios", async (req, res) => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, telefone, email, tipo, ativo, created_at, updated_at")
    .order("id", { ascending: true });

  if (error) {
    return res.status(500).json({ ok: false, mensagem: error.message });
  }

  res.json({ ok: true, usuarios: data || [] });
});

app.get("/motoristas", async (req, res) => {
  const { data, error } = await supabase
    .from("motoristas")
    .select("id, usuario_id, carro, placa, cor, disponivel, latitude, longitude, created_at, updated_at")
    .order("id", { ascending: true });

  if (error) {
    return res.status(500).json({ ok: false, mensagem: error.message });
  }

  res.json({ ok: true, motoristas: data || [] });
});

app.post("/auth/registrar", async (req, res) => {
  const { tipo, nome, telefone, email, senha, carro, placa, cor } = req.body;
  const tipoFinal = tipo === "motorista" || tipo === "admin" ? tipo : "passageiro";

  if (!nome || !telefone || !senha) {
    return res.status(400).json({
      ok: false,
      mensagem: "Nome, telefone e senha sao obrigatorios"
    });
  }

  if (tipoFinal === "motorista" && (!carro || !placa)) {
    return res.status(400).json({
      ok: false,
      mensagem: "Carro e placa sao obrigatorios para motorista"
    });
  }

  try {
    const senhaHash = hashSenha(senha);

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .insert([
        {
          nome,
          telefone,
          email: email || null,
          senha_hash: senhaHash,
          tipo: tipoFinal,
          ativo: true
        }
      ])
      .select("*")
      .single();

    if (usuarioError) {
      return res.status(400).json({ ok: false, mensagem: usuarioError.message });
    }

    let motorista = null;

    if (tipoFinal === "motorista") {
      const { data: motoristaData, error: motoristaError } = await supabase
        .from("motoristas")
        .insert([
          {
            usuario_id: usuario.id,
            carro,
            placa,
            cor: cor || null,
            disponivel: false,
            latitude: null,
            longitude: null
          }
        ])
        .select("*")
        .single();

      if (motoristaError) {
        return res.status(400).json({ ok: false, mensagem: motoristaError.message });
      }

      motorista = motoristaData;
    }

    res.status(201).json({
      ok: true,
      usuario: sanitizeUsuario(usuario),
      motorista
    });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro no cadastro", erro: String(erro) });
  }
});

app.post("/auth/login", async (req, res) => {
  const { identificador, senha, tipo } = req.body;

  if (!identificador || !senha) {
    return res.status(400).json({ ok: false, mensagem: "Identificador e senha sao obrigatorios" });
  }

  try {
    const { data: usuario, error } = await buscarUsuarioPorIdentificador(identificador);

    if (error) {
      return res.status(500).json({ ok: false, mensagem: error.message });
    }

    if (!usuario) {
      return res.status(404).json({ ok: false, mensagem: "Usuario nao encontrado" });
    }

    if (!usuario.ativo) {
      return res.status(403).json({ ok: false, mensagem: "Usuario inativo" });
    }

    if (tipo && usuario.tipo !== tipo) {
      return res.status(403).json({ ok: false, mensagem: "Tipo de usuario invalido" });
    }

    const senhaHash = hashSenha(senha);
    if (usuario.senha_hash !== senhaHash) {
      return res.status(401).json({ ok: false, mensagem: "Senha incorreta" });
    }

    let motorista = null;
    if (usuario.tipo === "motorista") {
      const { data: motoristaData, error: motoristaError } = await supabase
        .from("motoristas")
        .select("*")
        .eq("usuario_id", usuario.id)
        .maybeSingle();

      if (motoristaError) {
        return res.status(500).json({ ok: false, mensagem: motoristaError.message });
      }

      motorista = motoristaData;
    }

    res.json({ ok: true, usuario: sanitizeUsuario(usuario), motorista });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro no login", erro: String(erro) });
  }
});

app.put("/motoristas/:id/status", async (req, res) => {
  const motoristaId = Number(req.params.id);
  const { disponivel, latitude, longitude } = req.body;

  if (!motoristaId) {
    return res.status(400).json({ ok: false, mensagem: "motoristaId invalido" });
  }

  try {
    const updates = { updated_at: nowIso() };

    if (typeof disponivel === "boolean") {
      updates.disponivel = disponivel;
    }

    const lat = toNumber(latitude);
    const lng = toNumber(longitude);
    if (lat !== null && lng !== null) {
      updates.latitude = lat;
      updates.longitude = lng;
    }

    const { data: motorista, error } = await supabase
      .from("motoristas")
      .update(updates)
      .eq("id", motoristaId)
      .select("*")
      .single();

    if (error) {
      return res.status(400).json({ ok: false, mensagem: error.message });
    }

    if (lat !== null && lng !== null) {
      await supabase.from("localizacao_motorista").insert([
        {
          motorista_id: motoristaId,
          latitude: lat,
          longitude: lng,
          atualizado_em: nowIso()
        }
      ]);
    }

    res.json({ ok: true, motorista });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao atualizar motorista", erro: String(erro) });
  }
});

app.post("/corridas", async (req, res) => {
  const {
    passageiroId,
    origem,
    destino,
    origemLat,
    origemLng,
    destinoLat,
    destinoLng,
    distanciaKm,
    pagamentoMetodo
  } = req.body;

  if (!passageiroId || !origem || !destino) {
    return res.status(400).json({
      ok: false,
      mensagem: "passageiroId, origem e destino sao obrigatorios"
    });
  }

  try {
    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, tipo, ativo")
      .eq("id", passageiroId)
      .maybeSingle();

    if (usuarioError) {
      return res.status(500).json({ ok: false, mensagem: usuarioError.message });
    }

    if (!usuario || usuario.tipo !== "passageiro") {
      return res.status(404).json({ ok: false, mensagem: "Passageiro nao encontrado" });
    }

    if (!usuario.ativo) {
      return res.status(403).json({ ok: false, mensagem: "Passageiro inativo" });
    }

    const { data: corridaAtiva, error: corridaAtivaError } = await supabase
      .from("corridas")
      .select("id, status")
      .eq("passageiro_id", Number(passageiroId))
      .in("status", ["aguardando_motorista", "motorista_a_caminho", "em_andamento"])
      .limit(1)
      .maybeSingle();

    if (corridaAtivaError) {
      return res.status(500).json({ ok: false, mensagem: corridaAtivaError.message });
    }

    if (corridaAtiva) {
      return res.status(400).json({
        ok: false,
        mensagem: "Voce ja possui uma corrida ativa. Cancele antes de solicitar outra.",
        corridaId: corridaAtiva.id
      });
    }

    const oLat = toNumber(origemLat);
    const oLng = toNumber(origemLng);
    const dLat = toNumber(destinoLat);
    const dLng = toNumber(destinoLng);
    const distInformada = toNumber(distanciaKm);

    let distanciaCalculada = distInformada;
    if (distanciaCalculada === null && oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
      distanciaCalculada = haversineKm(oLat, oLng, dLat, dLng);
    }
    if (distanciaCalculada === null) {
      distanciaCalculada = 0;
    }

    const distanciaFinal = Number(Number(distanciaCalculada).toFixed(2));
    const valorFinal = Number((distanciaFinal * 1).toFixed(2));

    const metodoFinal = ["dinheiro", "cartao", "pix"].includes(pagamentoMetodo)
      ? pagamentoMetodo
      : "dinheiro";

    const { data: corrida, error: corridaError } = await supabase
      .from("corridas")
      .insert([
        {
          passageiro_id: Number(passageiroId),
          origem,
          destino,
          valor: valorFinal,
          distancia_km: distanciaFinal,
          status: "aguardando_motorista",
          created_at: nowIso()
        }
      ])
      .select("*")
      .single();

    if (corridaError) {
      return res.status(400).json({ ok: false, mensagem: corridaError.message });
    }

    const { data: pagamento, error: pagamentoError } = await supabase
      .from("pagamentos")
      .insert([
        {
          corrida_id: corrida.id,
          metodo: metodoFinal,
          status: "pendente",
          valor: valorFinal,
          created_at: nowIso(),
          updated_at: nowIso()
        }
      ])
      .select("*")
      .single();

    if (pagamentoError) {
      return res.status(400).json({ ok: false, mensagem: pagamentoError.message });
    }

    if (oLat !== null && oLng !== null) {
      coordsPorCorrida.set(corrida.id, {
        origemLat: oLat,
        origemLng: oLng,
        destinoLat: dLat,
        destinoLng: dLng
      });
    }

    res.status(201).json({
      ok: true,
      mensagem: "Corrida solicitada com sucesso",
      corrida: attachCoords(corrida),
      pagamento
    });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao criar corrida", erro: String(erro) });
  }
});

app.get("/corridas/pendentes", async (req, res) => {
  const motoristaId = Number(req.query.motoristaId);

  if (!motoristaId) {
    return res.status(400).json({ ok: false, mensagem: "motoristaId e obrigatorio" });
  }

  try {
    const { data: motorista, error: motoristaError } = await supabase
      .from("motoristas")
      .select("id, latitude, longitude")
      .eq("id", motoristaId)
      .maybeSingle();

    if (motoristaError) {
      return res.status(500).json({ ok: false, mensagem: motoristaError.message });
    }

    if (!motorista) {
      return res.status(404).json({ ok: false, mensagem: "Motorista nao encontrado" });
    }

    const { data: corridas, error: corridasError } = await supabase
      .from("corridas")
      .select("*")
      .eq("status", "aguardando_motorista")
      .order("created_at", { ascending: true });

    if (corridasError) {
      return res.status(500).json({ ok: false, mensagem: corridasError.message });
    }

    const pendentes = (corridas || [])
      .map((c) => {
        const coords = coordsPorCorrida.get(c.id);
        const dist =
          motorista.latitude !== null &&
          motorista.longitude !== null &&
          coords &&
          coords.origemLat !== null &&
          coords.origemLng !== null
            ? Number(haversineKm(motorista.latitude, motorista.longitude, coords.origemLat, coords.origemLng).toFixed(2))
            : null;
        return { ...attachCoords(c), distanciaParaMotoristaKm: dist };
      })
      .sort((a, b) => {
        const da = a.distanciaParaMotoristaKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanciaParaMotoristaKm ?? Number.POSITIVE_INFINITY;
        return da - db;
      });

    res.json({ ok: true, corridas: pendentes });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao listar corridas", erro: String(erro) });
  }
});

app.put("/corridas/:id/aceitar", async (req, res) => {
  const corridaId = Number(req.params.id);
  const { motoristaId } = req.body;

  if (!corridaId || !motoristaId) {
    return res.status(400).json({ ok: false, mensagem: "corridaId e motoristaId sao obrigatorios" });
  }

  try {
    const { data: corrida, error: corridaError } = await supabase
      .from("corridas")
      .select("*")
      .eq("id", corridaId)
      .maybeSingle();

    if (corridaError) {
      return res.status(500).json({ ok: false, mensagem: corridaError.message });
    }

    if (!corrida) {
      return res.status(404).json({ ok: false, mensagem: "Corrida nao encontrada" });
    }

    if (corrida.status !== "aguardando_motorista") {
      return res.status(400).json({ ok: false, mensagem: "Essa corrida nao pode mais ser aceita" });
    }

    const { data: motorista, error: motoristaError } = await supabase
      .from("motoristas")
      .select("*")
      .eq("id", motoristaId)
      .maybeSingle();

    if (motoristaError) {
      return res.status(500).json({ ok: false, mensagem: motoristaError.message });
    }

    if (!motorista) {
      return res.status(404).json({ ok: false, mensagem: "Motorista nao encontrado" });
    }

    const { data: corridaAtualizada, error: updateError } = await supabase
      .from("corridas")
      .update({
        motorista_id: motoristaId,
        status: "motorista_a_caminho",
        aceita_em: nowIso()
      })
      .eq("id", corridaId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(500).json({ ok: false, mensagem: updateError.message });
    }

    await supabase
      .from("motoristas")
      .update({ disponivel: false, updated_at: nowIso() })
      .eq("id", motoristaId);

    res.json({ ok: true, mensagem: "Corrida aceita com sucesso", corrida: attachCoords(corridaAtualizada) });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao aceitar corrida", erro: String(erro) });
  }
});

app.put("/corridas/:id/iniciar", async (req, res) => {
  const corridaId = Number(req.params.id);

  if (!corridaId) {
    return res.status(400).json({ ok: false, mensagem: "corridaId invalido" });
  }

  try {
    const { data: corrida, error } = await supabase
      .from("corridas")
      .select("*")
      .eq("id", corridaId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, mensagem: error.message });
    }

    if (!corrida) {
      return res.status(404).json({ ok: false, mensagem: "Corrida nao encontrada" });
    }

    if (corrida.status !== "motorista_a_caminho") {
      return res.status(400).json({ ok: false, mensagem: "A corrida nao pode ser iniciada agora" });
    }

    const { data: atualizada, error: updateError } = await supabase
      .from("corridas")
      .update({ status: "em_andamento", iniciada_em: nowIso() })
      .eq("id", corridaId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(500).json({ ok: false, mensagem: updateError.message });
    }

    res.json({ ok: true, mensagem: "Corrida iniciada com sucesso", corrida: attachCoords(atualizada) });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao iniciar corrida", erro: String(erro) });
  }
});

app.put("/corridas/:id/cancelar", async (req, res) => {
  const corridaId = Number(req.params.id);
  const { passageiroId } = req.body;

  if (!corridaId || !passageiroId) {
    return res.status(400).json({ ok: false, mensagem: "corridaId e passageiroId sao obrigatorios" });
  }

  try {
    const { data: corrida, error } = await supabase
      .from("corridas")
      .select("*")
      .eq("id", corridaId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, mensagem: error.message });
    }

    if (!corrida) {
      return res.status(404).json({ ok: false, mensagem: "Corrida nao encontrada" });
    }

    if (corrida.passageiro_id !== Number(passageiroId)) {
      return res.status(403).json({ ok: false, mensagem: "Passageiro invalido" });
    }

    if (!["aguardando_motorista", "motorista_a_caminho", "em_andamento"].includes(corrida.status)) {
      return res.status(400).json({ ok: false, mensagem: "A corrida nao pode ser cancelada agora" });
    }

    const { data: atualizada, error: updateError } = await supabase
      .from("corridas")
      .update({ status: "cancelada", cancelada_em: nowIso() })
      .eq("id", corridaId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(500).json({ ok: false, mensagem: updateError.message });
    }

    if (corrida.motorista_id) {
      await supabase
        .from("motoristas")
        .update({ disponivel: true, updated_at: nowIso() })
        .eq("id", corrida.motorista_id);
    }

    coordsPorCorrida.delete(corridaId);

    res.json({ ok: true, mensagem: "Corrida cancelada com sucesso", corrida: attachCoords(atualizada) });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao cancelar corrida", erro: String(erro) });
  }
});

app.put("/corridas/:id/cancelar-motorista", async (req, res) => {
  const corridaId = Number(req.params.id);
  const { motoristaId } = req.body;

  if (!corridaId || !motoristaId) {
    return res.status(400).json({ ok: false, mensagem: "corridaId e motoristaId sao obrigatorios" });
  }

  try {
    const { data: corrida, error } = await supabase
      .from("corridas")
      .select("*")
      .eq("id", corridaId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, mensagem: error.message });
    }

    if (!corrida) {
      return res.status(404).json({ ok: false, mensagem: "Corrida nao encontrada" });
    }

    if (corrida.motorista_id !== Number(motoristaId)) {
      return res.status(403).json({ ok: false, mensagem: "Motorista invalido" });
    }

    if (!["motorista_a_caminho", "em_andamento"].includes(corrida.status)) {
      return res.status(400).json({ ok: false, mensagem: "A corrida nao pode ser cancelada agora" });
    }

    const { data: atualizada, error: updateError } = await supabase
      .from("corridas")
      .update({ status: "cancelada", cancelada_em: nowIso() })
      .eq("id", corridaId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(500).json({ ok: false, mensagem: updateError.message });
    }

    await supabase
      .from("motoristas")
      .update({ disponivel: true, updated_at: nowIso() })
      .eq("id", motoristaId);

    coordsPorCorrida.delete(corridaId);

    res.json({ ok: true, mensagem: "Corrida cancelada pelo motorista", corrida: attachCoords(atualizada) });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao cancelar corrida", erro: String(erro) });
  }
});

app.put("/corridas/:id/finalizar", async (req, res) => {
  const corridaId = Number(req.params.id);

  if (!corridaId) {
    return res.status(400).json({ ok: false, mensagem: "corridaId invalido" });
  }

  try {
    const { data: corrida, error } = await supabase
      .from("corridas")
      .select("*")
      .eq("id", corridaId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, mensagem: error.message });
    }

    if (!corrida) {
      return res.status(404).json({ ok: false, mensagem: "Corrida nao encontrada" });
    }

    if (corrida.status !== "em_andamento") {
      return res.status(400).json({ ok: false, mensagem: "A corrida nao pode ser finalizada agora" });
    }

    const { data: atualizada, error: updateError } = await supabase
      .from("corridas")
      .update({ status: "finalizada", finalizada_em: nowIso() })
      .eq("id", corridaId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(500).json({ ok: false, mensagem: updateError.message });
    }

    if (corrida.motorista_id) {
      await supabase
        .from("motoristas")
        .update({ disponivel: true, updated_at: nowIso() })
        .eq("id", corrida.motorista_id);
    }

    coordsPorCorrida.delete(corridaId);

    res.json({ ok: true, mensagem: "Corrida finalizada com sucesso", corrida: attachCoords(atualizada) });
  } catch (erro) {
    res.status(500).json({ ok: false, mensagem: "Erro ao finalizar corrida", erro: String(erro) });
  }
});

app.get("/corridas/:id", async (req, res) => {
  const corridaId = Number(req.params.id);

  if (!corridaId) {
    return res.status(400).json({ ok: false, mensagem: "corridaId invalido" });
  }

  const { data, error } = await supabase
    .from("corridas")
    .select(
      `
      *,
      motoristas (
        id,
        carro,
        placa,
        cor,
        usuario_id,
        usuarios ( nome, telefone, email )
      )
    `
    )
    .eq("id", corridaId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ ok: false, mensagem: error.message });
  }

  if (!data) {
    return res.status(404).json({ ok: false, mensagem: "Corrida nao encontrada" });
  }

  res.json({ ok: true, corrida: attachCoords(data) });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
