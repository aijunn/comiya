<p align="center">
  <img src="./packages/frontend/public/favicon.svg" width="180" align="center" />
</p>

# Comiya

A simple self-hosted comic site **only for learning purpose**.

Built with Vue.js, Axum and SeaORM. Available in PWA.

  <img src="./packages/frontend/public/home.png" width="150" />

## Comic sources

The backend currently ships with Manhuagui (`manhuagui`). Sources are isolated
by a stable source id in routes, SQLite history/library rows and the browser
download cache.

To add another source:

1. Implement `ComicSource` in a new module under `packages/backend/src/source/`.
2. Register it in `SourceRegistry::new`.
3. Implement `image_headers` if the source protects images with hotlink headers.

The frontend discovers sources through `/api/get_sources`, so no frontend
changes are required. Keep source ids URL-safe and stable after release.

## Usage

### Docker Compose

```yml
services:
  comiya:
    image: mapoos/comiya:latest
    container_name: comiya
    restart: unless-stopped
    environment:
      - PASSWORD=xxx # optional
    volumes:
      - ./data:/comiya/data
    ports:
      - 8000:8000
```
