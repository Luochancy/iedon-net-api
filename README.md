<!--
*******************************************************************
README.md

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
-->
# LuocyNet PeerHub API

This is the API server for auto-peering on DN42. Based on `Hono.js`.

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
