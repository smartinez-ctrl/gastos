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

## 6. Importar tus estados de cuenta

Sube tus PDFs de Amex y las demás tarjetas a Claude — te extraigo los movimientos y te
regreso las líneas listas en formato:

```
2026-06-14,UBER EATS CDMX,245.50,Amex
```

Las pegas en la pestaña **Importar** de la app y quedan cargadas con categoría automática.
