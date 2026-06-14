# Infraestructura como Código (Bicep) — ICC

Despliega un **Azure Static Web App (SKU Free)** con **API gestionada** de
Azure Functions (Node, modelo de programación v4) para el simulador de física
lunar de la *Interplanetary Champions Cup*.

| Ubicación | Carpeta | Descripción |
|-----------|---------|-------------|
| `appLocation`    | `web` | Frontend estático |
| `apiLocation`    | `api` | Azure Functions (API gestionada) |
| `outputLocation` | `""`  | Sin paso de build |

## Archivos

- `main.bicep` — definición del recurso `Microsoft.Web/staticSites` (Free).
- `main.parameters.json` — parámetros de ejemplo (esquema ARM `deploymentParameters`).

## Requisitos previos

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) instalado.
- Sesión iniciada: `az login`.
- (Opcional) Extensión Bicep: `az bicep install` (Azure CLI la instala sola al desplegar `.bicep`).

## 1. Crear el grupo de recursos

```bash
az group create \
  --name rg-icc \
  --location eastus2
```

## 2. Desplegar la infraestructura

```bash
az deployment group create \
  --resource-group rg-icc \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json
```

> Para sobrescribir un parámetro puntual sin tocar el archivo JSON:
>
> ```bash
> az deployment group create \
>   --resource-group rg-icc \
>   --template-file infra/main.bicep \
>   --parameters infra/main.parameters.json \
>   --parameters name=icc-simulator location=eastus2
> ```

### Despliegue "desacoplado" (sin enlazar el repositorio)

Si prefieres gestionar el CI/CD manualmente con el **token de despliegue**
(en vez de que Azure cree el workflow de GitHub Actions), deja `repositoryUrl`
vacío:

```bash
az deployment group create \
  --resource-group rg-icc \
  --template-file infra/main.bicep \
  --parameters name=icc-simulator location=eastus2 repositoryUrl=""
```

## 3. Obtener las salidas del despliegue

```bash
# Hostname público del sitio
az deployment group show \
  --resource-group rg-icc \
  --name main \
  --query properties.outputs.defaultHostname.value -o tsv

# Resource ID
az deployment group show \
  --resource-group rg-icc \
  --name main \
  --query properties.outputs.resourceId.value -o tsv
```

> El nombre del despliegue (`--name main`) coincide por defecto con el nombre
> del archivo de plantilla (`main.bicep`).

## 4. Obtener el token de despliegue (deployment token)

El token se usa para publicar el contenido desde un workflow de CI/CD
(GitHub Actions, Azure DevOps) o con la CLI de SWA (`swa deploy`).

```bash
az staticwebapp secrets list \
  --name icc-simulator \
  --resource-group rg-icc \
  --query properties.apiKey -o tsv
```

Guarda ese valor como secreto del repositorio
(p. ej. `AZURE_STATIC_WEB_APPS_API_TOKEN`).

### Publicar el contenido con la CLI de SWA (opcional)

```bash
npm install -g @azure/static-web-apps-cli

swa deploy ./web \
  --api-location ./api \
  --deployment-token "<TOKEN_OBTENIDO_ARRIBA>" \
  --env production
```

## Notas importantes

- **SKU Free** no admite **staging environments** (entornos de previsualización
  por pull request). En esta plantilla `stagingEnvironmentPolicy` está en
  `Disabled`. Si más adelante necesitas entornos de staging, migra al **SKU
  Standard** cambiando `sku.name`/`sku.tier` a `Standard` en `main.bicep`.
- La disponibilidad regional del SKU Free es limitada (p. ej. `eastus2`,
  `westus2`, `centralus`, `westeurope`, `eastasia`). Ajusta `location` según
  corresponda.
- La **API gestionada** (carpeta `api`) se incluye con el SKU Free dentro de
  los límites de la cuota gratuita; para cargas mayores conviene una Function
  App independiente ("bring your own functions"), que requiere SKU Standard.
