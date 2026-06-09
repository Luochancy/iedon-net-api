/*
*******************************************************************
common/packet.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export const RESPONSE_CODE = {
  OK: 0,
  SERVER_ERROR: 1,
  SERVICE_UNAVAILABLE: 2,
  UNAUTHORIZED: 3,
  BAD_REQUEST: 4,
  NOT_FOUND: 5,
  ROUTER_OPERATION_FAILED: 6,
  ROUTER_NOT_AVAILABLE: 7
};

export function makeResponse(c, code, data) {
  let message = 'ok';
  switch (code) {
    default: case RESPONSE_CODE.OK: break;
    case RESPONSE_CODE.SERVER_ERROR: { message = 'server error'; c.status(500); } break;
    case RESPONSE_CODE.SERVICE_UNAVAILABLE: { message = 'service unavailable'; c.status(503); } break;
    case RESPONSE_CODE.UNAUTHORIZED: { message = 'unauthorized'; c.status(401); } break;
    case RESPONSE_CODE.BAD_REQUEST: { message = 'bad request'; c.status(400); } break;
    case RESPONSE_CODE.NOT_FOUND: { message = 'not found'; c.status(404); } break;
    case RESPONSE_CODE.ROUTER_OPERATION_FAILED: message = 'router operation failed'; break;
    case RESPONSE_CODE.ROUTER_NOT_AVAILABLE: message = 'router not available'; break;
  };
  return c.json({
    code,
    message,
    data: data || ''
  });
}
