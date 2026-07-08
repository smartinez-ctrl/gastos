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

const EXTRACTION_PROMPT = `Eres un extractor de movimientos de estados de cuenta bancarios mexicanos (tarjeta de crédito o débito). Lee el PDF adjunto — puede ser una imagen escaneada sin texto seleccionable, en ese caso léelo visualmente.

Devuelve ÚNICAMENTE un JSON array (sin texto adicional, sin markdown, sin backticks, nada antes ni después) con esta forma exacta:
[{"fecha":"YYYY-MM-DD","descripcion":"NOMBRE DEL COMERCIO","monto":123.45,"cuota_actual":null,"cuota_total":null}]

Reglas:
- Incluye SOLO cargos/compras reales (gasto). NO incluyas pagos que el usuario le hizo a la tarjeta/cuenta (ej. "PAGO POR TRANSFERENCIA", "PAGO RECIBIDO", "PAGO DE NÓMINA", traspasos entre cuentas propias).
- Si encuentras un cargo que fue reembolsado/regresado por el comercio (un crédito que NO es un pago a la tarjeta), inclúyelo con monto NEGATIVO y agrega " (reembolso/cargo regresado)" al final de la descripción.
- Si el movimiento es parte de una compra a meses sin intereses (MSI) y el estado de cuenta indica el número de pago (ej. "09 DE 12"), llena cuota_actual y cuota_total con esos números; si no aplica, déjalos en null.
- fecha en formato YYYY-MM-DD. Convierte abreviaturas de mes en español (ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic).
- monto siempre positivo salvo el caso de reembolso de arriba.
- Si un movimiento muestra un monto en moneda extranjera (ej. "23.24 USD TC 17.9001") junto con su conversión a pesos mexicanos, usa SIEMPRE el monto ya convertido a MXN (el que realmente se cobró en la tarjeta), NUNCA el monto en la moneda original. El monto en USD/EUR/etc. es solo informativo.
- descripcion: nombre del comercio limpio, sin códigos de referencia largos (RFC, folios).
- No inventes movimientos ni montos. Si no puedes leer un renglón con confianza, omítelo — mejor incompleto que incorrecto.
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

  const { pdfBase64 } = req.body || {};
  if (!pdfBase64) {
    res.status(400).json({ error: 'Falta pdfBase64 en el body' });
    return;
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        }],
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
