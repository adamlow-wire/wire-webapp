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

import type {TurnTestStats as TurnTestStatsType} from './useTurnTest';

import {PreferencesSection} from '../components/PreferencesSection';

interface TurnTestStatsProps {
  stats: TurnTestStatsType;
}

const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null) {
    return 'N/A';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatQuality = (quality?: string): string => {
  if (!quality) {
    return 'N/A';
  }
  const colors: Record<string, string> = {
    Excellent: '#22c55e',
    Good: '#84cc16',
    Fair: '#f59e0b',
    Poor: '#ef4444',
  };
  const color = colors[quality] || '#666';
  return `<span style="color: ${color}; font-weight: 600;">${quality}</span>`;
};

const formatDuration = (seconds?: number): string => {
  if (seconds === undefined || seconds === null) {
    return 'N/A';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};

export const TurnTestStats = ({stats}: TurnTestStatsProps) => {
  return (
    <PreferencesSection title="Test Results" hasSeparator>
      {/* Connection Info Section - Row layout */}
      <div
        style={{
          marginBottom: '12px',
          padding: '10px',
          backgroundColor: '#f0f9ff',
          borderRadius: '6px',
          border: '1px solid #bae6fd',
        }}
      >
        <div style={{display: 'flex', flexDirection: 'row', gap: '12px', fontSize: '12px', flexWrap: 'wrap'}}>
          <div style={{flex: '1', minWidth: '80px'}}>
            <strong style={{color: '#666', display: 'block', marginBottom: '2px', fontSize: '11px'}}>Call Type</strong>
            <span style={{color: '#1e40af', fontWeight: '500'}}>{stats.callType || 'N/A'}</span>
          </div>
          <div style={{flex: '1', minWidth: '80px'}}>
            <strong style={{color: '#666', display: 'block', marginBottom: '2px', fontSize: '11px'}}>Quality</strong>
            <span
              dangerouslySetInnerHTML={{
                __html: formatQuality(stats.connectionQuality),
              }}
            />
          </div>
        </div>
        <div style={{marginTop: '8px', fontSize: '11px'}}>
          <strong style={{color: '#666', display: 'block', marginBottom: '2px'}}>Selected TURN</strong>
          <span style={{color: '#1e40af', fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all'}}>
            {stats.selectedTurnServer || 'N/A'}
          </span>
        </div>
      </div>

      {/* Actual TURN Server Used - Row layout */}
      {stats.turnServer && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px',
            backgroundColor: '#dcfce7',
            borderRadius: '6px',
            border: '1px solid #86efac',
          }}
        >
          <div style={{fontSize: '11px', fontWeight: '600', color: '#166534', marginBottom: '6px'}}>
            Actual TURN Server Used
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '12px',
              fontSize: '12px',
              flexWrap: 'wrap',
              marginBottom: '6px',
            }}
          >
            {stats.protocol && (
              <div>
                <strong style={{color: '#666', display: 'block', marginBottom: '2px', fontSize: '10px'}}>
                  Protocol
                </strong>
                <span style={{color: '#166534', fontWeight: '500'}}>{stats.protocol.toUpperCase()}</span>
              </div>
            )}
            {stats.ipVersion && (
              <div>
                <strong style={{color: '#666', display: 'block', marginBottom: '2px', fontSize: '10px'}}>
                  IP Version
                </strong>
                <span style={{color: '#166534', fontWeight: '500'}}>{stats.ipVersion.toUpperCase()}</span>
              </div>
            )}
          </div>
          <div style={{fontSize: '11px'}}>
            <strong style={{color: '#666', display: 'block', marginBottom: '2px'}}>TURN Server URL</strong>
            <span style={{color: '#166534', fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all'}}>
              {stats.turnServer}
            </span>
          </div>
        </div>
      )}

      {/* Performance Metrics - 2 Column Layout */}
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
        <div style={{padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb'}}>
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              marginBottom: '6px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Data Transfer
          </div>
          <div style={{fontSize: '12px', lineHeight: '1.8'}}>
            <div>
              <strong>Sent:</strong> {formatBytes(stats.bytesSent)}
            </div>
            <div>
              <strong>Received:</strong> {formatBytes(stats.bytesReceived)}
            </div>
          </div>
        </div>

        <div style={{padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb'}}>
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              marginBottom: '6px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Packet Statistics
          </div>
          <div style={{fontSize: '12px', lineHeight: '1.8'}}>
            <div>
              <strong>Sent:</strong> {stats.packetsSent ?? 'N/A'}
            </div>
            <div>
              <strong>Received:</strong> {stats.packetsReceived ?? 'N/A'}
            </div>
            <div>
              <strong>Lost:</strong>{' '}
              <span style={{color: stats.packetsLost && stats.packetsLost > 0 ? '#ef4444' : '#22c55e'}}>
                {stats.packetsLost ?? 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div style={{padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb'}}>
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              marginBottom: '6px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Network Quality
          </div>
          <div style={{fontSize: '12px', lineHeight: '1.8'}}>
            <div>
              <strong>Jitter:</strong>{' '}
              {stats.jitter !== undefined && stats.jitter !== null ? `${stats.jitter.toFixed(2)} ms` : 'N/A'}
            </div>
            <div>
              <strong>RTT:</strong>{' '}
              {stats.rtt !== undefined && stats.rtt !== null ? `${stats.rtt.toFixed(2)} ms` : 'N/A'}
            </div>
          </div>
        </div>

        <div style={{padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb'}}>
          <div
            style={{
              fontSize: '11px',
              color: '#6b7280',
              marginBottom: '6px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Test Info
          </div>
          <div style={{fontSize: '12px', lineHeight: '1.8'}}>
            <div>
              <strong>Timestamp:</strong> {new Date(stats.timestamp).toLocaleTimeString()}
            </div>
            {stats.callDuration !== undefined && (
              <div>
                <strong>Duration:</strong> {formatDuration(stats.callDuration)}
              </div>
            )}
            {stats.connectionQuality && (
              <div>
                <strong>Quality:</strong>{' '}
                <span
                  dangerouslySetInnerHTML={{
                    __html: formatQuality(stats.connectionQuality),
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </PreferencesSection>
  );
};
