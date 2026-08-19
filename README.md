# GILD Social Metrics Dashboard

Dashboard local para ver métricas de LinkedIn, Instagram, YouTube y Spotify.

## Run

```powershell
cd C:\Users\Equipo\Documents\Atendees\gild-social-dashboard
python -m http.server 5174
```

Abrir:

```txt
http://localhost:5174
```

## Sync manual

```powershell
node .\sync-socials.mjs
```

El script actualiza `social-data.json`. Lee variables del sistema y también un archivo local `.env`.

Para empezar:

```powershell
Copy-Item .\.env.example .\.env
```

Después completar `.env` con los IDs/tokens reales.

## Indispensable para conectar datos reales

Ya cargado por URL publica:

- LinkedIn: `joingild`
- Instagram: `@gild.hq`
- YouTube: `@GILDhq`, channel ID `UCC0lbied2G_PVm_WVK-xhrw`
- Spotify: show ID `0TSnQszN4VY8tyOgIYPsQy`

Todavia falta para metricas completas:

- `GILD_LINKEDIN_ORG_ID`
- `LINKEDIN_ACCESS_TOKEN`
- `GILD_INSTAGRAM_BUSINESS_ID`
- `META_ACCESS_TOKEN`
- `GILD_YOUTUBE_CHANNEL_ID`
- `YOUTUBE_API_KEY`
- `GILD_SPOTIFY_SHOW_ID`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Opcional para mostrar nombres lindos en el dashboard:

- `GILD_LINKEDIN_HANDLE`
- `GILD_INSTAGRAM_HANDLE`
- `GILD_YOUTUBE_HANDLE`
- `GILD_SPOTIFY_HANDLE`

## Auto-sync recomendado

Para v1, usar polling cada 1 hora. Instagram puede soportar webhooks en cuentas Business/Creator, pero YouTube y Spotify suelen ser más simples con polling. LinkedIn depende de permisos aprobados en la app.

Instalar auto-sync horario en Windows:

```powershell
.\install-hourly-sync.ps1
```

## Auto-sync sin tokens

El sync ya usa todo lo publico posible:

- LinkedIn: followers desde metadata publica de la company page.
- Instagram: followers/posts desde metadata publica cuando Instagram la expone.
- YouTube: videos recientes desde RSS publico y subscribers publicos.
- Spotify: show publico desde oEmbed.
- Snapshots: guarda historial local en `social-snapshots.json` para construir tendencia con el tiempo.

Los tokens siguen siendo necesarios para analytics completos como reach, impressions, likes, comments, shares, saves, watch time, engagement rate y post analytics detallados.
