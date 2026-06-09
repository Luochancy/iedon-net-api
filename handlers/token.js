/*
*******************************************************************
handlers/token.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { nullOrEmpty } from "../common/helper.js";
import { makeResponse, RESPONSE_CODE } from "../common/packet.js";

/*
    "REQUEST": <GET>,

    "RESPSONE": {
      "token": "string"
    },

*/

export default async function (c) {
  if (nullOrEmpty(c.var.state) || nullOrEmpty(c.var.state.asn)) {
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }

  const nextToken = await c.var.app.token.generateToken({
    asn: c.var.state.asn
  });

  if (!nextToken) {
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }

  return makeResponse(c, RESPONSE_CODE.OK, { token: nextToken });
}
