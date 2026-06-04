# IEDON-NET-API (Peer API for DN42)

This is the API server designed for auto-peering for iEdon-Net and the DN42. Based on `Hono.js`.

## Structures

- **```app.js```**: Entry point
- **```routes.js```**: Define routes here
- **```./handlers``**: Handlers for each defined route in `routes.js`
- **```providers```**: Extendable basic components
- **```db```**: Sequelize Models and database context
- **```common```**: shared functions

## Install

```bash
bun install
cp ./config.default.js ./config.js
```

## Run dev

```bash
bun run dev # Using bun
```

## Run prod

```bash
bun run prod
```
