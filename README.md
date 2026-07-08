# gastos-tracker

Control de gastos personal. Vanilla JS + Supabase + Vercel.

Vive **dentro del proyecto Supabase de LifeOfSam** (`xbctgokkysfwhbhchvvq`), pero en su
propio schema `gastos` — separado por completo de las tablas que usa la app iOS. No
comparte datos con ella, solo la infraestructura del proyecto (para no gastar tu tercer
slot gratis de Supabase).

## 1. Supabase — correr el schema

1. Entra al proyecto de LifeOfSam en https://supabase.com/dashboard
2. **SQL Editor** → pega y corre completo `schema.sql` de este repo. Crea el schema
   `gastos` y sus tablas, RLS incluido — no toca nada de lo que ya existe.
3. **Settings → API → Data API Settings → Exposed schemas** → agrega `gastos` a la lista.
   Por default Supabase solo expone `public` vía la API; sin este paso la app no va a
   poder leer ni escribir aunque el SQL haya corrido bien.
4. **Settings → API** → copia `Project URL` y `anon public` key (las mismas que ya usa
   LifeOfSam, no hay credenciales nuevas que generar).

## 2. Conectar credenciales

Abre `index.html` y reemplaza:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

con la URL y anon key del proyecto de LifeOfSam. El cliente ya está configurado para
apuntar al schema `gastos` (`db: { schema: 'gastos' }`), así que aunque compartas
proyecto con LifeOfSam, nunca toca sus tablas.

## 3. GitHub + Vercel

```bash
git init
git add -A
git commit -m "gastos-tracker: primer commit"
git branch -M main
git remote add origin https://github.com/smartinez-ctrl/gastos-tracker.git
git push -u origin main
```

En https://vercel.com:
1. **Add New → Project**
2. Importa el repo `gastos-tracker`
3. Framework preset: **Other** (HTML estático, sin build)
4. Deploy

## 4. Redirect URL para el login

En Supabase → **Authentication → URL Configuration**, agrega la URL que te dé Vercel
(ej. `https://gastos-tracker.vercel.app`) a **Redirect URLs**. Si ya tienes ahí la URL
de LifeOfSam, esto se agrega aparte, no la reemplaza.

## 5. Primer login

Abre la URL de Vercel, mete tu correo, te llega un link mágico (mismo sistema de auth
que ya usa LifeOfSam — si ya tienes cuenta ahí con ese correo, es la misma). Al entrar
la app crea tus tarjetas y categorías por defecto automáticamente.

## 6. Importar PDFs directo en la app (con IA)

Ya no hace falta pegar los PDFs en el chat. En la pestaña **Importar**, arrastra o sube
el PDF del estado de cuenta:

- Si es un banco con parser rápido (Amex, Santander tarjeta de crédito) se lee
  al instante con regex, sin costo de API.
- Cualquier otro caso — incluyendo PDFs **escaneados sin capa de texto** (típico de
  Santander cuenta de débito) o un banco nuevo — cae automático a un endpoint
  serverless (`/api/parse-pdf`) que manda el PDF a la API de Claude y regresa los
  movimientos ya estructurados.

**Para que esto funcione hace falta configurar una API key de Anthropic en Vercel:**

1. Genera una key en https://console.anthropic.com/settings/keys
2. Vercel → tu proyecto `gastos` → **Settings → Environment Variables**
3. Agrega `ANTHROPIC_API_KEY` = tu key, disponible para **Production** (y Preview si
   quieres probarlo en ramas). Nunca se expone al navegador — solo la usa la función
   serverless.
4. Redeploy (o el próximo push lo dispara solo).

Esto tiene costo de API por PDF procesado (paga tu cuenta de Anthropic, no está
incluido en el plan de Vercel). Como siempre, revisa la tabla antes de confirmar —
el modelo puede leer mal un renglón, sobre todo en PDFs escaneados de mala calidad.

## 7. Importar por CSV manual (alternativa)

Si prefieres, también puedes pegar líneas directo en formato:

```
2026-06-14,UBER EATS CDMX,245.50,Amex
```

En la pestaña **Importar**, sección "Importar movimientos (CSV manual)". Columnas 5 y 6
opcionales para compras a meses: `...,tarjeta,cuota_actual,cuota_total`.
