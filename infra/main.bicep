// =============================================================================
// Interplanetary Champions Cup (ICC) - Infraestructura como Código
// -----------------------------------------------------------------------------
// Despliega un Azure Static Web App (SKU Free) con API gestionada de
// Azure Functions (modelo de programación Node v4) y una cuenta de
// Azure Storage con dos tablas para persistencia y analítica.
//
//   - Frontend (app_location)   -> carpeta "web"
//   - API     (api_location)    -> carpeta "api"
//   - Build   (output_location) -> "" (no hay paso de build, sitio estático)
//
//   - Storage Account (Standard_LRS) con Table Storage:
//       * tabla "shots"    -> entidades de disparo (leaderboard persistente)
//       * tabla "events"   -> analítica de uso (page_view, shot_executed, ...)
//       * tabla "waitlist" -> captura de leads ("primeros 1.000 operadores")
//
// IMPORTANTE: El SKU Free NO admite "staging environments" (entornos de
// previsualización por pull request). Si en el futuro se necesitan entornos
// de staging, hay que migrar al SKU Standard.
//
// IMPORTANTE: La cadena de conexión de la Storage Account NO se cablea aquí
// automáticamente. Tras el despliegue hay que inyectarla como app setting
// TABLES_CONNECTION_STRING de la Static Web App (ver docs/DEPLOY_AZURE.md).
// La API la lee en runtime: si existe usa Table Storage, si no cae al store
// EN MEMORIA (útil para ejecución local file:///).
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

@description('Nombre de la cuenta de Azure Storage para persistencia (tablas "shots" y "events"). Debe ser globalmente único, 3-24 caracteres, solo minúsculas y dígitos. Por defecto se deriva del nombre de la SWA + un sufijo único determinista del grupo de recursos.')
@minLength(3)
@maxLength(24)
param storageName string = toLower(take('${replace(name, '-', '')}st${uniqueString(resourceGroup().id)}', 24))

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
// Recurso: Azure Storage Account (Standard_LRS) para persistencia
// -----------------------------------------------------------------------------
// Cuenta de propósito general v2 (StorageV2), la opción más económica y la
// requerida para Table Storage. Standard_LRS = replicación local redundante,
// suficiente para la Fase 1.

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    // Buenas prácticas mínimas de seguridad para la cuenta.
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

// Servicio de tablas (Table Storage) dentro de la cuenta.
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// Tabla "shots": entidades de disparo que alimentan el leaderboard persistente.
resource shotsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'shots'
}

// Tabla "events": analítica de uso (page_view, shot_executed, milestone_reached,
// record_beaten, club_named, share_clicked). Sin PII.
resource eventsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'events'
}

// Tabla "waitlist": captura de leads de la campaña "primeros 1.000 operadores".
// Cada entidad tiene PartitionKey "global" y RowKey = email saneado (deduplicación
// natural por dirección). Alimenta el contador de la waitlist y la activación de
// la Operación Primer Toque. Contiene PII (email): tratar conforme a privacidad.
resource waitlistTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: 'waitlist'
}

// -----------------------------------------------------------------------------
// Salidas
// -----------------------------------------------------------------------------

@description('Hostname público por defecto del Static Web App (sin esquema).')
output defaultHostname string = staticSite.properties.defaultHostname

@description('Identificador de recurso (resourceId) del Static Web App.')
output resourceId string = staticSite.id

@description('Nombre de la cuenta de Azure Storage creada. Úsalo para obtener la cadena de conexión e inyectarla como app setting TABLES_CONNECTION_STRING de la Static Web App (ver docs/DEPLOY_AZURE.md).')
output storageAccountName string = storageAccount.name
