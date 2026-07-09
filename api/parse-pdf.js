// Proxy server-side a la API de Anthropic para extraer movimientos de un PDF
// de estado de cuenta — incluye PDFs escaneados sin capa de texto (ej.
// Santander cuenta de débito), que el parser client-side (pdf.js, basado en
// regex sobre texto) no puede leer.
//
// Requiere la variable de entorno ANTHROPIC_API_KEY configurada en
// Vercel → Settings → Environment Variables (NUNCA se expone al cliente,
// solo vive en este endpoint server-side).
//
// CommonJS a propósito: el repo no tiene package.json con "type":"module",
// así que Vercel trata los .js como CommonJS por default.

const EXTRACTION_PROMPT = `Eres un extractor de movimientos de estados de cuenta bancarios mexicanos. Pueden ser de tarjeta de crédito (una columna de "Importe") O de cuenta de cheques/débito (columnas separadas de FECHA, DESCRIPCIÓN, DEPÓSITO, RETIRO, SALDO). Vas a recibir una imagen por cada página del estado de cuenta, en orden. Puede ser una imagen escaneada sin texto seleccionable, en ese caso léelo visualmente.

Devuelve ÚNICAMENTE un JSON array (sin texto adicional, sin markdown, sin backticks, nada antes ni después) con esta forma exacta:
[{"fecha":"YYYY-MM-DD","descripcion":"NOMBRE DEL COMERCIO O CONCEPTO","monto":123.45,"cuota_actual":null,"cuota_total":null}]

Si es un estado de cuenta de TARJETA DE CRÉDITO (una sola columna de importe):
- Incluye SOLO cargos/compras reales (gasto). NO incluyas pagos que el usuario le hizo a la tarjeta (ej. "PAGO POR TRANSFERENCIA", "PAGO RECIBIDO", "PAGO DE NÓMINA").
- Si encuentras un cargo reembolsado/regresado por el comercio (un crédito que NO es un pago a la tarjeta), inclúyelo con monto NEGATIVO y agrega " (reembolso/cargo regresado)" al final de la descripción.
- Si el movimiento es parte de una compra a meses sin intereses (MSI) y el estado de cuenta indica el número de pago (ej. "09 DE 12"), llena cuota_actual y cuota_total; si no aplica, déjalos en null.

Si es un estado de cuenta de CUENTA DE CHEQUES/DÉBITO (columnas FECHA, DESCRIPCIÓN, DEPÓSITO, RETIRO, SALDO — puede haber varias sub-cuentas en el mismo documento, ej. "Supercuenta Cheques", "Mis Metas", etc.):
- Cada renglón tiene SOLO una de las dos columnas (DEPÓSITO o RETIRO) con valor — la otra queda vacía. Usa ese valor como "monto".
- La columna SALDO es el saldo acumulado de la cuenta después de ese movimiento — NUNCA la uses como monto de un movimiento, ni la incluyas como si fuera un renglón aparte.
- Incluye TANTO depósitos como retiros como movimientos separados — no los filtres ni asumas cuáles son gasto real; eso se decide después en la app. Usa siempre monto POSITIVO para ambos (no le pongas signo negativo a los retiros).
- descripcion: usa el concepto principal de la línea (ej. "PAGO TRANSFERENCIA SPEI ENVIADO A SCOTIABANK", "DOMICILIACION PAGO SERVICIO AMERICAN EXPRESS", "ABONO TRANSFERENCIA SPEI RECIBIDO DE BBVA MEXICO") — puedes incluir el nombre del banco/cliente contraparte si aporta contexto, pero omite folios de rastreo, RFC, y claves largas.
- Si el mismo estado de cuenta tiene varias sub-cuentas (ej. cuenta de cheques + Mis Metas + Dinero Creciente), inclúyelas todas como movimientos, cada una con su propia fecha/descripción/monto.

Reglas generales para ambos casos:
- fecha en formato YYYY-MM-DD. Convierte abreviaturas de mes en español (ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic).
- Si un movimiento muestra un monto en moneda extranjera (ej. "23.24 USD TC 17.9001") junto con su conversión a pesos mexicanos, usa SIEMPRE el monto ya convertido a MXN, NUNCA el monto en la moneda original.
- No inventes movimientos ni montos. Si un renglón es ilegible o no estás seguro, omítelo — mejor incompleto que incorrecto. Pero NO te detengas después de solo 1 o 2 movimientos — revisa TODAS las páginas y extrae TODOS los renglones de movimientos que encuentres, el estado de cuenta puede tener docenas.
- Responde solo con el JSON array, nada más, ni siquiera una palabra de contexto.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY no está configurada en Vercel (Settings → Environment Variables)' });
    return;
  }

  const { images } = req.body || {};
  if (!images || !Array.isArray(images) || images.length === 0) {
    res.status(400).json({ error: 'Falta images (array de páginas en base64 JPEG) en el body' });
    return;
  }

  try {
    const content = [
      ...images.map(img => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })),
      { type: 'text', text: EXTRACTION_PROMPT },
    ];
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 16000,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      res.status(anthropicRes.status).json({ error: (data.error && data.error.message) || 'Error de la API de Anthropic' });
      return;
    }

    const textBlock = (data.content || []).find(b => b.type === 'text');
    const raw = ((textBlock && textBlock.text) || '').trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

    let rows;
    try {
      rows = JSON.parse(cleaned);
    } catch (e) {
      res.status(500).json({ error: 'No se pudo interpretar la respuesta del modelo como JSON', raw: cleaned.slice(0, 2000) });
      return;
    }
    if (!Array.isArray(rows)) {
      res.status(500).json({ error: 'La respuesta del modelo no fue un array', raw: cleaned.slice(0, 2000) });
      return;
    }

    res.status(200).json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error inesperado' });
  }
};

module.exports.config = { maxDuration: 60 };
