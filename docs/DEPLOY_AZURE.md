# 🚀 Guía de despliegue en Azure — ICC (Static Web Apps)

> Guía reproducible para desplegar el **Simulador Web de Física Lunar** (front en
> `web/`) y su **API gestionada de Azure Functions** (`api/`) sobre
> **Azure Static Web Apps (SWA), tier Free**.
>
> **Clasificación:** Confidencial / Estratégico — Oficina del CTO.

---

## 0. Nombres por defecto

Usados a lo largo de toda la guía (cámbialos si lo necesitas, pero hazlo de forma
coherente en todos los comandos):

| Recurso              | Valor por defecto |
|----------------------|-------------------|
| Resource group       | `rg-icc`          |
| Static Web App       | `icc-simulator`   |
| Storage Account      | `iccsimulatorst01` (debe ser globalmente único; 3-24 car., minúsculas/dígitos) |
| Tablas               | `shots`, `events` |
| App setting (SWA)    | `TABLES_CONNECTION_STRING` |
| Región               | `eastus2`         |
| Repositorio GitHub   | `BTCWFD/PROYECT-ICC` |
| Rama                 | `main`            |
| Secreto en GitHub    | `AZURE_STATIC_WEB_APPS_API_TOKEN` |

Ubicaciones del proyecto (contrato del workflow de SWA):

- `app_location = "web"` · `api_location = "api"` · `output_location = ""`

---

## 1. Prerequisitos

1. **Cuenta de Azure** con una suscripción activa.
2. **Azure CLI (`az`)** — [instalación](https://learn.microsoft.com/cli/azure/install-azure-cli).
   ```bash
   az version          # comprobar instalación
   az login            # iniciar sesión (abre el navegador)
   az account show     # verificar la suscripción activa
   ```
   Si tienes varias suscripciones:
   ```bash
   az account set --subscription "<NOMBRE_O_ID_DE_SUSCRIPCION>"
   ```
3. **Node.js 18+ y npm** (para la API de Functions y, opcionalmente, la SWA CLI).
   ```bash
   node --version      # debe ser >= 18
   npm --version
   ```
4. **GitHub CLI (`gh`)** — opcional pero recomendado para configurar el secreto.
   ```bash
   gh --version
   gh auth login       # autenticarse en GitHub
   ```

---

## 2. Crear el grupo de recursos

```bash
az group create \
  --name rg-icc \
  --location eastus2
```

---

## 3. Crear la Static Web App (tier Free)

> Hay dos caminos. **El A es el recomendado** porque deja el CI/CD ya cableado.

### Opción A — Conectada a GitHub (CI/CD automático)

Crea la SWA enlazada al repositorio. Esto **genera automáticamente el workflow de
GitHub Actions** en `.github/workflows/` y guarda el token de despliegue como
secreto del repo:

```bash
az staticwebapp create \
  --name icc-simulator \
  --resource-group rg-icc \
  --location eastus2 \
  --sku Free \
  --source https://github.com/BTCWFD/PROYECT-ICC \
  --branch main \
  --app-location "web" \
  --api-location "api" \
  --output-location "" \
  --login-with-github
```

`--login-with-github` abre un flujo de autorización en el navegador para que Azure
pueda crear el workflow y registrar el secreto en GitHub.

### Opción B — Recurso "desconectado" (despliegas tú el workflow/CLI)

Útil si prefieres controlar el workflow manualmente o desplegar con la SWA CLI:

```bash
az staticwebapp create \
  --name icc-simulator \
  --resource-group rg-icc \
  --location eastus2 \
  --sku Free
```

---

## 3b. Crear la Storage Account y configurar la persistencia

La API persiste los disparos (tabla `shots`) y la analítica (tabla `events`) en
**Azure Table Storage**. La selección es **en runtime**: si la SWA tiene el app
setting `TABLES_CONNECTION_STRING`, la API usa Table Storage; si no, cae al **store
en memoria** (datos volátiles). Para tener un leaderboard persistente, sigue estos
pasos.

> Si despliegas con Bicep (`infra/main.bicep`), la cuenta y las tablas `shots` /
> `events` **ya se crean** por plantilla; en ese caso salta al paso **3b.3** para
> obtener la connection string y al **3b.4** para fijar el app setting.

### 3b.1 Crear la cuenta de almacenamiento

> El nombre debe ser **globalmente único**, 3-24 caracteres, solo minúsculas y
> dígitos. Cambia `iccsimulatorst01` si ya está en uso.

```bash
az storage account create \
  --name iccsimulatorst01 \
  --resource-group rg-icc \
  --location eastus2 \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false
```

### 3b.2 Crear las tablas `shots` y `events`

```bash
# Obtén la connection string en una variable de entorno
CONN=$(az storage account show-connection-string \
  --name iccsimulatorst01 \
  --resource-group rg-icc \
  --query connectionString --output tsv)

# Crea ambas tablas (idempotente)
az storage table create --name shots  --connection-string "$CONN"
az storage table create --name events --connection-string "$CONN"
```

### 3b.3 Obtener la cadena de conexión

```bash
az storage account show-connection-string \
  --name iccsimulatorst01 \
  --resource-group rg-icc \
  --query connectionString --output tsv
```

Copia el valor (empieza por `DefaultEndpointsProtocol=https;AccountName=...`).
**Trátalo como una credencial**: no lo subas al repo ni lo pegues en logs públicos.

### 3b.4 Inyectar la connection string como app setting de la SWA

Este es el paso que **activa** Table Storage en la API:

```bash
az staticwebapp appsettings set \
  --name icc-simulator \
  --resource-group rg-icc \
  --setting-names TABLES_CONNECTION_STRING="<CADENA_DE_CONEXION>"
```

O, encadenando con la obtención automática de la cadena:

```bash
CONN=$(az storage account show-connection-string \
  --name iccsimulatorst01 \
  --resource-group rg-icc \
  --query connectionString --output tsv)

az staticwebapp appsettings set \
  --name icc-simulator \
  --resource-group rg-icc \
  --setting-names TABLES_CONNECTION_STRING="$CONN"
```

> Para listar los app settings actuales:
> `az staticwebapp appsettings list -n icc-simulator -g rg-icc`.
> Tras cambiar app settings, la API los recoge en el siguiente arranque.

---

## 4. Obtener el token de despliegue

El token autentica los despliegues (lo usan tanto GitHub Actions como la SWA CLI):

```bash
az staticwebapp secrets list \
  --name icc-simulator \
  --resource-group rg-icc \
  --query "properties.apiKey" \
  --output tsv
```

Copia el valor: es tu `<deployment-token>`. **Trátalo como una credencial**
(no lo subas al repo ni lo pegues en logs públicos).

---

## 5. Configurar el secreto en GitHub

> Solo necesario en la **Opción B** (en la A, `az` ya lo creó). También sirve para
> rotar el token.

Con **GitHub CLI**:

```bash
# Lee el token de forma segura y lo guarda como secreto del repo
az staticwebapp secrets list \
  --name icc-simulator \
  --resource-group rg-icc \
  --query "properties.apiKey" \
  --output tsv \
| gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN \
    --repo BTCWFD/PROYECT-ICC
```

O manualmente desde la web: **GitHub → repo → Settings → Secrets and variables →
Actions → New repository secret**, nombre `AZURE_STATIC_WEB_APPS_API_TOKEN`.

---

## 6. Desplegar

### 6.1 Vía GitHub Actions (recomendado)

Si usaste la **Opción A**, ya existe el workflow y el secreto: **basta con hacer
push a `main`** y GitHub Actions desplegará automáticamente.

Si gestionas el workflow tú mismo (Opción B), asegúrate de que
`.github/workflows/azure-static-web-apps.yml` contiene el paso oficial con estas
claves (debe coincidir con el contrato del proyecto):

```yaml
- name: Build And Deploy
  uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
    repo_token: ${{ secrets.GITHUB_TOKEN }}
    action: "upload"
    app_location: "web"     # frontend estático
    api_location: "api"     # Azure Functions (Node v4)
    output_location: ""     # sin paso de build
```

Cada `git push` a `main` dispara el despliegue. Sigue el progreso en la pestaña
**Actions** del repositorio.

### 6.2 Alternativa manual con la SWA CLI

Útil para un despliegue puntual sin pasar por GitHub Actions. Desde la **raíz del
repo**:

```bash
npx @azure/static-web-apps-cli deploy web \
  --api-location api \
  --deployment-token <deployment-token> \
  --env production
```

- `web` es el `app_location`; `--api-location api` es la carpeta de Functions.
- Sustituye `<deployment-token>` por el valor obtenido en el paso 4.
- `--env production` publica en el entorno de producción (no en uno de preview).

> Buena práctica: en lugar de pegar el token, expórtalo en una variable de entorno
> y pásalo (`--deployment-token "$SWA_DEPLOY_TOKEN"`) para no dejarlo en el historial
> del shell.

---

## 7. Verificación

1. **Obtener la URL pública** de la app:
   ```bash
   az staticwebapp show \
     --name icc-simulator \
     --resource-group rg-icc \
     --query "defaultHostname" \
     --output tsv
   ```
   Devuelve algo como `icc-simulator.azurestaticapps.net`.

2. **Front:** abre `https://<defaultHostname>/` y comprueba que el simulador carga.

3. **Sonda de salud de la API:**
   ```bash
   curl https://<defaultHostname>/api/health
   # Esperado: {"status":"ok","service":"icc-api","version":"1.0.0"}
   ```

4. **Leaderboard** (admite `?top=N`, por defecto **5**, máximo **50**):
   ```bash
   curl "https://<defaultHostname>/api/leaderboard"          # top 5 (por defecto)
   curl "https://<defaultHostname>/api/leaderboard?top=10"   # top 10
   # Esperado: {"entries":[ ... ]}  (ordenado desc por "range")
   ```

5. **Registrar un disparo de prueba** (el body incluye `airResistance`; el servidor
   **ignora** el `range`/`hangTime` enviados y los **recalcula** — anti-trampas):
   ```bash
   curl -X POST https://<defaultHostname>/api/shots \
     -H "Content-Type: application/json" \
     -d '{"club":"Test FC","world":"moon","power":80,"angle":45,"airResistance":false,"range":612.3,"hangTime":18.4}'
   # Esperado: {"ok":true,"rank":<n>,"total":<n>}
   # Nota: el "range" guardado será el recalculado por el servidor, no el enviado.
   ```

6. **Analítica (events)** — siempre responde `{ "ok":true }` (fire-and-forget):
   ```bash
   curl -X POST https://<defaultHostname>/api/events \
     -H "Content-Type: application/json" \
     -d '{"event":"page_view","props":{"ref":"verificacion"}}'
   # Esperado: {"ok":true}
   ```
   Eventos válidos: `page_view`, `shot_executed`, `milestone_reached`,
   `record_beaten`, `club_named`, `share_clicked`. Sin PII. Si la SWA **no** tiene
   `TABLES_CONNECTION_STRING`, el endpoint sigue devolviendo `{ "ok":true }` como
   no-op.

> **Persistencia:** si configuraste `TABLES_CONNECTION_STRING` (paso 3b), el
> leaderboard y la analítica se guardan en **Azure Table Storage** (tablas `shots` /
> `events`) y **sobreviven** a los cold starts. Si **no** lo configuraste, la API
> usa el **store en memoria** y el leaderboard se **reinicia en cada cold start**.
> Detalles en [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 8. Limpieza (opcional)

Para eliminar **todos** los recursos creados y evitar cualquier cargo residual:

```bash
az group delete --name rg-icc --yes --no-wait
```

---

## 9. Solución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `/api/*` devuelve 404 | `api_location` mal configurado o la build de Functions falló | Revisa el log de Actions y confirma `api_location: "api"`. |
| El despliegue falla con "token inválido" | Token caducado o secreto mal puesto | Re-obtén el token (paso 4) y vuelve a fijar el secreto (paso 5). |
| El front carga pero no hay estilos/JS | `app_location`/`output_location` incorrectos | Confirma `app_location: "web"` y `output_location: ""`. |
| El leaderboard "se vacía solo" | Falta `TABLES_CONNECTION_STRING` → store en memoria + cold start | Configura el app setting (paso 3b.4); con Table Storage el leaderboard persiste. |
| `POST /api/events` no persiste pero responde `{"ok":true}` | Sin `TABLES_CONNECTION_STRING` el endpoint es un no-op | Esperado; configura la connection string para guardar en la tabla `events`. |
| Disparo enviado con `range` enorme no aparece arriba | Anti-trampas: el servidor **recalcula** `range`/`hangTime` | Esperado; solo cuentan las métricas recalculadas desde `power`/`angle`/`world`/`airResistance`. |
| `az storage account create` falla por nombre en uso | El nombre debe ser globalmente único | Elige otro `storageName` (3-24 car., minúsculas/dígitos). |
| `az staticwebapp create` no acepta `--sku Free` | CLI desactualizada | `az upgrade` y reintenta. |
