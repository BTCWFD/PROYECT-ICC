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

4. **Leaderboard:**
   ```bash
   curl https://<defaultHostname>/api/leaderboard
   # Esperado: {"entries":[ ... ]}  (ordenado desc por "range")
   ```

5. **Registrar un disparo de prueba:**
   ```bash
   curl -X POST https://<defaultHostname>/api/shots \
     -H "Content-Type: application/json" \
     -d '{"club":"Test FC","world":"moon","power":80,"angle":45,"range":612.3,"hangTime":18.4}'
   # Esperado: {"ok":true,"rank":<n>,"total":<n>}
   ```

> Recuerda: la API usa un **store en memoria**, por lo que el leaderboard se
> **reinicia en cada cold start** del Function App. Para persistencia real,
> consulta la ruta de evolución (Azure Table Storage / Cosmos DB) en
> [`ARCHITECTURE.md`](ARCHITECTURE.md).

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
| El leaderboard "se vacía solo" | Store en memoria + cold start | Comportamiento esperado en Fase 1; migrar a Table/Cosmos. |
| `az staticwebapp create` no acepta `--sku Free` | CLI desactualizada | `az upgrade` y reintenta. |
