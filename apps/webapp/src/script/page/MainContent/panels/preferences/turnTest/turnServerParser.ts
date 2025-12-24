/*
 * Wire
 * Copyright (C) 2025 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

export interface ParsedTurnServer {
  url: string;
  host: string;
  port: number;
  protocol: 'tcp' | 'udp';
  ipVersion: 'ipv4' | 'ipv6';
  secure: boolean; // true for 'turns:', false for 'turn:'
}

/**
 * Parses a TURN server URL into its components
 * Examples:
 * - turn:server.com:3478?transport=tcp
 * - turn:server.com:3478?transport=udp
 * - turns:server.com:5349?transport=tcp
 * - turn:[2001:db8::1]:3478?transport=udp
 */
export function parseTurnServerUrl(url: string): ParsedTurnServer | null {
  if (!url || (!url.startsWith('turn:') && !url.startsWith('turns:'))) {
    return null;
  }

  const secure = url.startsWith('turns:');
  const scheme = secure ? 'turns:' : 'turn:';
  const urlWithoutScheme = url.substring(scheme.length);

  // Parse query parameters
  const [urlPart, queryPart] = urlWithoutScheme.split('?');
  const params = new URLSearchParams(queryPart || '');

  // Determine protocol from transport parameter or default to UDP
  const transport = params.get('transport')?.toLowerCase();
  const protocol: 'tcp' | 'udp' = transport === 'tcp' ? 'tcp' : 'udp';

  // Parse host and port
  // Handle IPv6 addresses in brackets: [2001:db8::1]:3478
  let host: string;
  let port: number;

  if (urlPart.startsWith('[')) {
    // IPv6 address
    const closingBracket = urlPart.indexOf(']');
    if (closingBracket === -1) {
      return null;
    }
    host = urlPart.substring(1, closingBracket);
    const portPart = urlPart.substring(closingBracket + 1);
    if (portPart.startsWith(':')) {
      port = parseInt(portPart.substring(1), 10);
    } else {
      // Default ports
      port = secure ? 5349 : 3478;
    }
  } else {
    // IPv4 address or hostname
    const colonIndex = urlPart.lastIndexOf(':');
    if (colonIndex === -1) {
      host = urlPart;
      port = secure ? 5349 : 3478;
    } else {
      host = urlPart.substring(0, colonIndex);
      port = parseInt(urlPart.substring(colonIndex + 1), 10);
    }
  }

  // Determine IP version
  const ipVersion: 'ipv4' | 'ipv6' = host.includes(':') ? 'ipv6' : 'ipv4';

  if (isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }

  return {
    url,
    host,
    port,
    protocol,
    ipVersion,
    secure,
  };
}
