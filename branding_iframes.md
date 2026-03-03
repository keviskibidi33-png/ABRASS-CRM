# Branding Iframes - ABRASS

Documento de referencia para mantener consistente el branding del microfrontend de **ABRASS** y su visualización embebida en iframe dentro del CRM.

## Alcance

- Microfrontend: `abrass-crm`
- Shell embebedor: `crm-geofal` módulo ABRASS
- Flujo: CRM abre `https://abrass.geofal.com.pe` en dialog modal con `token` y opcionalmente `ensayo_id`

## Reglas visuales

- Mantener estructura de hoja técnica fiel a `Template_ABRASCRM.xlsx`.
- Preservar encabezado institucional y bloque ASTM C131/C131M-20.
- Mantener consistencia visual con módulos recientes de laboratorio.
- Botonera final con acciones `Guardar` y `Guardar y Descargar`.

## Contrato iframe

- Entrada por query params: `token`, `ensayo_id`.
- Mensajes hijo -> padre: `TOKEN_REFRESH_REQUEST`, `CLOSE_MODAL`.
- Mensaje padre -> hijo: `TOKEN_REFRESH`.
