const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend online no Render!");
});

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    mensagem: "API funcionando",
    horario: new Date().toISOString(),
  });
});

app.post("/pedido", (req, res) => {
  const dados = req.body;

  res.json({
    ok: true,
    recebido: dados,
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
