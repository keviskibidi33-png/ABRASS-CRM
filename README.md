# ABRASS CRM Frontend

Microfrontend del módulo **ABRASS ASTM C131/C131M-20** para Geofal.

- Dominio productivo: `https://abrass.geofal.com.pe`
- Backend API: `https://api.geofal.com.pe` (rutas `/api/abrass`)

## Objetivo

- Registrar/editar ensayos de abrasión Los Angeles para agregado pequeño.
- Guardar estado en BD (`EN PROCESO`/`COMPLETO`).
- Exportar Excel con plantilla oficial `Template_ABRASCRM.xlsx`.
- Cerrar modal del CRM al finalizar guardado.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Axios
- React Hot Toast

## Variables de entorno

- `VITE_API_URL=https://api.geofal.com.pe`
- `VITE_CRM_LOGIN_URL=https://crm.geofal.com.pe/login`

## Desarrollo local

```bash
npm install
npm run dev
```
