/*
*******************************************************************
common/probe.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export const PROBE_PACKET_HEADER = Buffer.from([0x42, 0x42, 0x42]);
export const PROBE_PACKET_FOOTER = Buffer.from([0x21, 0x89]);
export const PROBE_REDIS_KEY_PREFIX = "probe";
export const PROBE_FAMILY_IPV4 = "ipv4";
export const PROBE_FAMILY_IPV6 = "ipv6";
export const PROBE_FAMILIES = [PROBE_FAMILY_IPV4, PROBE_FAMILY_IPV6];

export function buildProbeRedisKey(sessionUuid, family) {
  if (!sessionUuid) return '';
  return `${PROBE_REDIS_KEY_PREFIX}:${sessionUuid}:${family}`;
}
