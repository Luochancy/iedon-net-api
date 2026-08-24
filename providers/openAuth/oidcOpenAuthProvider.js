/*
*******************************************************************
providers/openAuth/oidcOpenAuthProvider.js

Copyright (C) 2026 Luochancy

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DefaultOpenAuthProvider } from './defaultOpenAuthProvider.js';

export class OidcOpenAuthProvider extends DefaultOpenAuthProvider {
  constructor(app, openAuthSettings) {
    super(app, openAuthSettings);
    this._discovery = null;
    this._jwks = null;
  }

  async getDiscovery() {
    if (this._discovery) return this._discovery;

    const resp = await fetch(this.openAuthSettings.discoveryUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`OIDC discovery returned HTTP ${resp.status}`);
    this._discovery = await resp.json();
    return this._discovery;
  }

  getJwks() {
    if (this._jwks) return this._jwks;
    // createRemoteJWKSet caches keys internally and handles rotation
    this._jwks = createRemoteJWKSet(new URL(this._discovery.jwks_uri));
    return this._jwks;
  }

  async authenticate(data) {
    const { code, code_verifier } = data;
    if (!code) return false;

    try {
      // 1. Fetch discovery document
      const discovery = await this.getDiscovery();

      // 2. Exchange code for tokens
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.openAuthSettings.clientId,
        client_secret: this.openAuthSettings.clientSecret,
        redirect_uri: this.openAuthSettings.redirectUri,
        code_verifier,
      });

      const tokenResp = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenResp.ok) {
        const text = await tokenResp.text().catch(() => '');
        this.logger.error(`OIDC token exchange failed: HTTP ${tokenResp.status} ${text}`);
        return false;
      }

      const tokenData = await tokenResp.json();
      if (!tokenData.id_token) {
        this.logger.error('OIDC token response missing id_token');
        return false;
      }

      // 3. Verify id_token signature using JWKS
      const jwks = this.getJwks();
      const { payload } = await jwtVerify(tokenData.id_token, jwks, {
        issuer: this.openAuthSettings.issuer,
        audience: this.openAuthSettings.clientId,
      });

      // 4. Extract DN42 claims
      const asn = payload.dn42;
      if (!asn) {
        this.logger.error('OIDC id_token missing dn42 claim');
        return false;
      }

      return {
        asn: String(asn),
        person: payload.name || payload.preferred_username || '',
        email: payload.email || '',
      };
    } catch (error) {
      this.logger.error(`OIDC authentication failed: ${error.message}`);
      return false;
    }
  }
}
