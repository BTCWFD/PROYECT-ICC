// =============================================================================
// Interplanetary Champions Cup (ICC) - Infraestructura como Código
// -----------------------------------------------------------------------------
// Despliega un Azure Static Web App (SKU Free) con API gestionada de
// Azure Functions (modelo de programación Node v4).
//
//   - Frontend (app_location)   -> carpeta "web"
//   - API     (api_location)    -> carpeta "api"
//   - Build   (output_location) -> "" (no hay paso de build, sitio estático)
//
// IMPORTANTE: El SKU Free NO admite "staging environments" (entornos de
// previsualización por pull request). Si en el futuro se necesitan entornos
// de staging, hay que migrar al SKU Standard.
// =============================================================================

targetScope = 'resourceGroup'

// -----------------------------------------------------------------------------
// Parámetros
// -----------------------------------------------------------------------------

@description('Nombre del recurso Static Web App.')
param name string = 'icc-simulator'

@description('Región de Azure donde se crea el recurso. El SKU Free está disponible en un conjunto limitado de regiones (p. ej. eastus2, westus2, centralus, westeurope, eastasia).')
param location string = 'eastus2'

@description('URL del repositorio de GitHub (opcional). Si se deja vacío, el despliegue queda desacoplado del repo y la integración CI/CD se configura aparte con el token de despliegue.')
param repositoryUrl string = ''

@description('Rama del repositorio a desplegar (opcional). Solo se aplica si repositoryUrl no está vacío.')
param branch string = 'main'

// -----------------------------------------------------------------------------
// Variables
// -----------------------------------------------------------------------------

// Solo enlazamos el repositorio si se proporciona una URL. Así el mismo Bicep
// sirve tanto para despliegues "vacíos" (token manual) como para CI/CD nativo.
var linkRepository = !empty(repositoryUrl)

// -----------------------------------------------------------------------------
// Recurso: Azure Static Web App (SKU Free) con API gestionada
// -----------------------------------------------------------------------------

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location

  // SKU Free: gratis, sin entornos de staging, ideal para Fase 1.
  sku: {
    name: 'Free'
    tier: 'Free'
  }

  properties: {
    // Enlace opcional al repositorio de GitHub para CI/CD nativo.
    repositoryUrl: linkRepository ? repositoryUrl : null
    branch: linkRepository ? branch : null

    // Configuración de ubicaciones del monorepo.
    buildProperties: {
      appLocation: 'web' // Frontend estático
      apiLocation: 'api' // Azure Functions (Node v4) como API gestionada
      outputLocation: '' // Sin paso de build: se publica tal cual
    }

    // En Free no aplican entornos de staging; mantenemos la configuración
    // por defecto (control de versiones del repositorio si está enlazado).
    stagingEnvironmentPolicy: 'Disabled'

    // Permite que la API gestionada se aprovisione junto con el sitio.
    allowConfigFileUpdates: true
  }
}

// -----------------------------------------------------------------------------
// Salidas
// -----------------------------------------------------------------------------

@description('Hostname público por defecto del Static Web App (sin esquema).')
output defaultHostname string = staticSite.properties.defaultHostname

@description('Identificador de recurso (resourceId) del Static Web App.')
output resourceId string = staticSite.id
