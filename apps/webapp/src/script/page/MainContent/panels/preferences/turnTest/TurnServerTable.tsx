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

import {useMemo} from 'react';

import {parseTurnServerUrl, type ParsedTurnServer} from './turnServerParser';

interface TurnServerTableProps {
  serverUrls: string[];
  protocolFilter: 'tcp' | 'udp' | 'both';
  ipVersionFilter: 'ipv4' | 'ipv6' | 'both';
  selectedServers: string[];
  onServerToggle: (url: string) => void;
  onProtocolFilterChange?: (protocol: 'tcp' | 'udp' | 'both') => void;
  onIpVersionFilterChange?: (ipVersion: 'ipv4' | 'ipv6' | 'both') => void;
  isDisabled?: boolean;
}

export const TurnServerTable = ({
  serverUrls,
  protocolFilter,
  ipVersionFilter,
  selectedServers,
  onServerToggle,
  onProtocolFilterChange,
  onIpVersionFilterChange,
  isDisabled = false,
}: TurnServerTableProps) => {
  // Parse all server URLs
  const parsedServers = useMemo(() => {
    return serverUrls
      .map(url => {
        const parsed = parseTurnServerUrl(url);
        return parsed ? {...parsed, url} : null;
      })
      .filter((server): server is ParsedTurnServer & {url: string} => server !== null);
  }, [serverUrls]);

  // Filter servers based on protocol and IP version
  const filteredServers = useMemo(() => {
    return parsedServers.filter(server => {
      const protocolMatch = protocolFilter === 'both' || server.protocol === protocolFilter;
      const ipVersionMatch = ipVersionFilter === 'both' || server.ipVersion === ipVersionFilter;
      return protocolMatch && ipVersionMatch;
    });
  }, [parsedServers, protocolFilter, ipVersionFilter]);

  // Group servers by host for better display
  const groupedServers = useMemo(() => {
    const groups = new Map<string, (ParsedTurnServer & {url: string})[]>();
    parsedServers.forEach(server => {
      const key = `${server.host}:${server.port}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(server);
    });
    return Array.from(groups.entries()).map(([key, servers]) => ({
      key,
      host: servers[0].host,
      port: servers[0].port,
      servers,
    }));
  }, [parsedServers]);

  if (parsedServers.length === 0) {
    return <div style={{padding: '16px', textAlign: 'center', color: '#666'}}>No TURN servers available</div>;
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column'}}>
      {/* Table */}
      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: '#fff',
          maxHeight: '500px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{overflowY: 'auto', overflowX: 'auto'}}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr style={{backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd'}}>
                <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', width: '40px'}}>
                  <input
                    type="checkbox"
                    checked={filteredServers.length > 0 && filteredServers.every(s => selectedServers.includes(s.url))}
                    onChange={e => {
                      if (e.target.checked) {
                        filteredServers.forEach(s => {
                          if (!selectedServers.includes(s.url)) {
                            onServerToggle(s.url);
                          }
                        });
                      } else {
                        filteredServers.forEach(s => {
                          if (selectedServers.includes(s.url)) {
                            onServerToggle(s.url);
                          }
                        });
                      }
                    }}
                    disabled={isDisabled || filteredServers.length === 0}
                    style={{cursor: isDisabled ? 'not-allowed' : 'pointer'}}
                  />
                </th>
                <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap'}}>Host</th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    width: '80px',
                  }}
                >
                  Port
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    width: '90px',
                  }}
                >
                  Protocol
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    width: '90px',
                  }}
                >
                  IP Version
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    textAlign: 'center',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    width: '70px',
                  }}
                >
                  Secure
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedServers.map(group =>
                group.servers.map((server, index) => {
                  const isInFilter = filteredServers.some(fs => fs.url === server.url);
                  const isSelected = selectedServers.includes(server.url);
                  const isGreyedOut = !isInFilter;

                  return (
                    <tr
                      key={server.url}
                      style={{
                        backgroundColor:
                          isSelected && !isGreyedOut ? '#e8f4f8' : isGreyedOut ? '#f9f9f9' : 'transparent',
                        opacity: isGreyedOut ? 0.5 : 1,
                        borderBottom: '1px solid #eee',
                      }}
                    >
                      <td style={{padding: '8px 12px'}}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onServerToggle(server.url)}
                          disabled={isDisabled}
                          style={{
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            opacity: isGreyedOut ? 0.5 : 1,
                          }}
                        />
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'nowrap',
                        }}
                        title={index === 0 ? server.host : ''}
                      >
                        {index === 0 ? server.host : ''}
                      </td>
                      <td
                        style={{padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap'}}
                      >
                        {index === 0 ? server.port : ''}
                      </td>
                      <td style={{padding: '8px 12px'}}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: '500',
                            backgroundColor: server.protocol === 'tcp' ? '#e3f2fd' : '#f3e5f5',
                            color: server.protocol === 'tcp' ? '#1976d2' : '#7b1fa2',
                            opacity: isGreyedOut ? 0.6 : 1,
                          }}
                        >
                          {server.protocol.toUpperCase()}
                        </span>
                      </td>
                      <td style={{padding: '8px 12px'}}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: '500',
                            backgroundColor: server.ipVersion === 'ipv6' ? '#fff3e0' : '#e8f5e9',
                            color: server.ipVersion === 'ipv6' ? '#e65100' : '#2e7d32',
                            opacity: isGreyedOut ? 0.6 : 1,
                          }}
                        >
                          {server.ipVersion.toUpperCase()}
                        </span>
                      </td>
                      <td style={{padding: '8px 12px', textAlign: 'center'}}>
                        {server.secure ? (
                          <span style={{color: '#4caf50', fontWeight: '600', opacity: isGreyedOut ? 0.6 : 1}}>✓</span>
                        ) : (
                          <span style={{color: '#999', opacity: isGreyedOut ? 0.6 : 1}}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{marginTop: '8px', fontSize: '12px', color: '#666'}}>
        Showing {filteredServers.length} of {parsedServers.length} server{parsedServers.length !== 1 ? 's' : ''}
        {selectedServers.length > 0 && ` • ${selectedServers.length} selected`}
      </div>
    </div>
  );
};
