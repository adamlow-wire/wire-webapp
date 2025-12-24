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

/* eslint-disable no-console */
import type {CallConfigData} from '@wireapp/api-client/lib/account/CallConfigData';

import {Runtime} from '@wireapp/commons';

export interface TurnTestConfig {
  protocol?: 'tcp' | 'udp' | 'both';
  ipVersion?: 'ipv4' | 'ipv6' | 'both';
  selectedServers?: string[];
  forceTurn?: boolean; // Force TURN usage even if direct connection is possible
}

/**
 * Applies TURN configuration overrides to the call config
 */
export function applyTurnOverrides(originalConfig: CallConfigData, turnConfig: TurnTestConfig): CallConfigData {
  console.log('[TURN Test] applyTurnOverrides called', {
    turnConfig,
    originalIceServersCount: originalConfig.ice_servers?.length || 0,
    originalIceServers: originalConfig.ice_servers,
  });

  let iceServers = originalConfig.ice_servers || [];

  // If specific servers are selected, use them directly without additional filtering
  // The user has explicitly chosen which servers to use, so we honor that selection
  if (turnConfig.selectedServers && turnConfig.selectedServers.length > 0) {
    console.log('[TURN Test] Using selected servers directly (no additional filtering)', {
      selectedServers: turnConfig.selectedServers,
      serversBeforeFilter: iceServers.length,
    });

    // Only keep servers that have at least one URL in the selected list
    iceServers = iceServers
      .map((server: any) => ({
        ...server,
        urls: server.urls?.filter((url: string) => turnConfig.selectedServers!.includes(url)),
      }))
      .filter((server: any) => server.urls && server.urls.length > 0);

    console.log('[TURN Test] After using selected servers', {
      serversAfterFilter: iceServers.length,
      filteredServers: iceServers.map((s: any) => ({
        urls: s.urls,
        urlsCount: s.urls?.length || 0,
        credential: s.credential ? '***' : undefined,
      })),
    });
  } else {
    // If no servers selected, apply protocol and IP version filters to all servers
    if (turnConfig.protocol && turnConfig.protocol !== 'both') {
      console.log('[TURN Test] Applying protocol filter (no servers selected)', {
        protocol: turnConfig.protocol,
        serversBeforeFilter: iceServers.length,
      });
      iceServers = iceServers.map((server: any) => ({
        ...server,
        urls: server.urls?.filter((url: string) => {
          if (turnConfig.protocol === 'tcp') {
            return url.includes('transport=tcp') || url.includes('?transport=tcp');
          } else if (turnConfig.protocol === 'udp') {
            return (
              url.includes('transport=udp') ||
              url.includes('?transport=udp') ||
              (!url.includes('transport=tcp') && url.startsWith('turn:'))
            );
          }
          return true;
        }),
      }));
      iceServers = iceServers.filter(server => server.urls && server.urls.length > 0);
      console.log('[TURN Test] After protocol filter', {
        serversAfterFilter: iceServers.length,
      });
    }

    // Apply IP version filter only if no servers were selected
    if (turnConfig.ipVersion && turnConfig.ipVersion !== 'both') {
      console.log('[TURN Test] Applying IP version filter (no servers selected)', {
        ipVersion: turnConfig.ipVersion,
        serversBeforeFilter: iceServers.length,
      });
      iceServers = iceServers.map((server: any) => ({
        ...server,
        urls: server.urls?.filter((url: string) => {
          if (turnConfig.ipVersion === 'ipv6') {
            return url.includes('ipv6') || url.match(/\[.*:.*\]/); // IPv6 address pattern
          } else if (turnConfig.ipVersion === 'ipv4') {
            return !url.includes('ipv6') && !url.match(/\[.*:.*\]/);
          }
          return true;
        }),
      }));
      iceServers = iceServers.filter(server => server.urls && server.urls.length > 0);
      console.log('[TURN Test] After IP version filter', {
        serversAfterFilter: iceServers.length,
      });
    }
  }

  // Remove empty server entries
  iceServers = iceServers.filter(server => server.urls && server.urls.length > 0);

  console.log('[TURN Test] Final filtered servers', {
    count: iceServers.length,
    servers: iceServers.map((s: any) => ({
      urls: s.urls,
      urlsCount: s.urls?.length || 0,
      credential: s.credential ? '***' : undefined,
    })),
  });

  // Build the result config
  const result: CallConfigData & {ice_transport_policy?: string} = {
    ...originalConfig,
    ice_servers: iceServers,
  };

  // Force TURN usage by setting ICE transport policy to 'relay'
  // This tells WebRTC to only use relay candidates (TURN servers) and skip host/srflx candidates
  if (turnConfig.forceTurn) {
    // AVS/WebRTC uses 'iceTransportPolicy' or 'ice_transport_policy' depending on the implementation
    // We'll add both to be safe
    (result as any).ice_transport_policy = 'relay';
    (result as any).iceTransportPolicy = 'relay';
    console.log('[TURN Test] Force TURN enabled - set iceTransportPolicy to relay');
  }

  console.log('[TURN Test] Final config', {
    ice_servers_count: result.ice_servers?.length || 0,
    ice_transport_policy: (result as any).ice_transport_policy,
    iceTransportPolicy: (result as any).iceTransportPolicy,
  });

  return result;
}

/**
 * Patches RTCPeerConnection to force relay-only (TURN) connections
 * This ensures that even if AVS doesn't respect iceTransportPolicy in the config,
 * all RTCPeerConnection instances will be forced to use relay-only mode
 */
function patchRTCPeerConnectionForRelay(): () => void {
  if (typeof window === 'undefined' || !window.RTCPeerConnection) {
    return () => {}; // No-op if not in browser or RTCPeerConnection not available
  }

  const OriginalRTCPeerConnection = window.RTCPeerConnection;

  // Create a patched constructor that always forces relay-only
  const PatchedRTCPeerConnection = function (this: RTCPeerConnection, configuration?: RTCConfiguration) {
    // Helper to normalize urls (can be string or array)
    const normalizeUrls = (urls: string | string[] | undefined): string[] => {
      if (!urls) {
        return [];
      }
      return Array.isArray(urls) ? urls : [urls];
    };

    console.log('[TURN Test] RTCPeerConnection constructor called (PATCHED)', {
      originalConfig: configuration,
      hasIceServers: !!configuration?.iceServers,
      iceServersCount: configuration?.iceServers?.length || 0,
      iceServers: configuration?.iceServers?.map((s: any) => {
        const urls = normalizeUrls(s.urls);
        return {
          urls: urls,
          urlsCount: urls.length,
          hasTcp: urls.some((url: string) => url.includes('transport=tcp')),
          hasUdp: urls.some((url: string) => !url.includes('transport=tcp')),
        };
      }),
    });

    // Always force relay-only by setting iceTransportPolicy
    const forcedConfig: RTCConfiguration = configuration
      ? {
          ...configuration,
          iceTransportPolicy: 'relay',
        }
      : {
          iceTransportPolicy: 'relay',
        };

    console.log('[TURN Test] RTCPeerConnection forced config', {
      iceTransportPolicy: forcedConfig.iceTransportPolicy,
      iceServersCount: forcedConfig.iceServers?.length || 0,
      note: 'Note: transport=tcp in TURN URLs should be respected by WebRTC, but we cannot force it here. The browser/WebRTC implementation decides the transport based on the URL parameter.',
    });

    return new OriginalRTCPeerConnection(forcedConfig);
  } as any;

  // Copy prototype and static properties
  PatchedRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
  Object.setPrototypeOf(PatchedRTCPeerConnection, OriginalRTCPeerConnection);

  // Copy static properties and methods
  Object.getOwnPropertyNames(OriginalRTCPeerConnection).forEach(name => {
    if (name !== 'prototype' && name !== 'length' && name !== 'name') {
      try {
        (PatchedRTCPeerConnection as any)[name] = (OriginalRTCPeerConnection as any)[name];
      } catch (e) {
        // Ignore errors when copying properties
      }
    }
  });

  // Replace the global RTCPeerConnection
  (window as any).RTCPeerConnection = PatchedRTCPeerConnection;

  // Return cleanup function
  return () => {
    (window as any).RTCPeerConnection = OriginalRTCPeerConnection;
  };
}

/**
 * Overrides the fetchConfig method in CallingRepository and patches RTCPeerConnection
 * Also overrides requestConfig to ensure our filtered config is used when AVS requests it
 */
export function overrideTurnConfig(callingRepository: any, turnConfig: TurnTestConfig): () => void {
  console.log('[TURN Test] overrideTurnConfig called', {
    turnConfig,
    hasFetchConfig: !!callingRepository.fetchConfig,
    hasRequestConfig: !!(callingRepository as any).requestConfig,
  });

  const originalFetchConfig = callingRepository.fetchConfig?.bind(callingRepository);
  const originalRequestConfig = (callingRepository as any).requestConfig;

  if (!originalFetchConfig) {
    throw new Error('CallingRepository.fetchConfig not available');
  }

  // Override fetchConfig - this is called by requestConfig
  // Note: This may be called multiple times (initial config refresh, when call starts, etc.)
  // This is normal behavior - AVS requests config at different stages
  callingRepository.fetchConfig = async (limit?: number) => {
    const callId = new Error().stack?.split('\n')[2]?.trim() || 'unknown';
    console.log('[TURN Test] fetchConfig called (OVERRIDDEN)', {
      limit,
      callStack: callId.substring(0, 100), // First 100 chars of stack trace for context
    });
    const config = await originalFetchConfig(limit);
    console.log('[TURN Test] Original config received from API', {
      ice_servers_count: config.ice_servers?.length || 0,
      ice_servers: config.ice_servers?.map((s: any) => ({
        urls: s.urls,
        urlsCount: s.urls?.length || 0,
      })),
    });

    const overriddenConfig = applyTurnOverrides(config, turnConfig);

    console.log('[TURN Test] Overridden config returning', {
      originalServers: config.ice_servers?.length || 0,
      filteredServers: overriddenConfig.ice_servers?.length || 0,
      selectedServers: turnConfig.selectedServers?.length || 0,
      forceTurn: turnConfig.forceTurn,
      overriddenConfig: {
        ice_servers: overriddenConfig.ice_servers?.map((s: any) => ({
          urls: s.urls,
          urlsCount: s.urls?.length || 0,
        })),
        ice_transport_policy: (overriddenConfig as any).ice_transport_policy,
        iceTransportPolicy: (overriddenConfig as any).iceTransportPolicy,
      },
    });

    return overriddenConfig;
  };

  // Also override requestConfig directly to ensure our filtered config is used
  // This is the callback that AVS calls when it needs config
  // Note: requestConfig is a private method, but we can override it if it exists
  if (originalRequestConfig) {
    console.log('[TURN Test] Overriding requestConfig');
    (callingRepository as any).requestConfig = () => {
      console.log('[TURN Test] requestConfig called (OVERRIDDEN)');
      const useRustSft = (callingRepository as any).isOnAvsRustSft;
      const _requestConfig = async () => {
        // Match the original logic exactly
        const CallingRepositoryClass = callingRepository.constructor as any;
        const limit = Runtime.isFirefox() ? CallingRepositoryClass.CONFIG?.MAX_FIREFOX_TURN_COUNT : undefined;
        console.log('[TURN Test] requestConfig: calling fetchConfig', {limit, useRustSft});

        // This will call our overridden fetchConfig which applies the TURN filters
        const config = await callingRepository.fetchConfig(limit);

        if (useRustSft) {
          (config as any).sft_servers = [{urls: ['https://rust-sft.stars.wire.link']}];
          (config as any).sft_servers_all = [{urls: ['https://rust-sft.stars.wire.link']}];
        }

        const configJson = JSON.stringify(config);
        console.log('[TURN Test] requestConfig: Sending config to AVS via configUpdate', {
          configLength: configJson.length,
          ice_servers_count: config.ice_servers?.length || 0,
          ice_servers: config.ice_servers?.map((s: any) => ({
            urls: s.urls,
            urlsCount: s.urls?.length || 0,
          })),
          ice_transport_policy: (config as any).ice_transport_policy,
          iceTransportPolicy: (config as any).iceTransportPolicy,
        });

        (callingRepository as any).wCall?.configUpdate((callingRepository as any).wUser, 0, configJson);
      };
      _requestConfig().catch((error: any) => {
        console.error('[TURN Test] requestConfig error', error);
        (callingRepository as any).logger?.warn('Failed fetching calling config', error);
        (callingRepository as any).wCall?.configUpdate((callingRepository as any).wUser, 1, '');
      });

      return 0;
    };
  } else {
    console.warn('[TURN Test] requestConfig not found - cannot override');
  }

  // Patch RTCPeerConnection to force relay-only if forceTurn is enabled
  let unpatchRTCPeerConnection: (() => void) | null = null;
  if (turnConfig.forceTurn) {
    console.log('[TURN Test] Patching RTCPeerConnection to force relay-only');
    unpatchRTCPeerConnection = patchRTCPeerConnectionForRelay();
    console.log('[TURN Test] RTCPeerConnection patched');
  }

  // Trigger a config refresh to ensure AVS gets the new filtered config
  // This is important because AVS might have already cached the old config
  if ((callingRepository as any).requestConfig) {
    console.log('[TURN Test] Triggering immediate config refresh');
    // Call requestConfig to trigger a config update with our filtered servers
    try {
      (callingRepository as any).requestConfig();
      console.log('[TURN Test] Config refresh triggered successfully');
    } catch (error) {
      // Ignore errors - config will be requested when needed
      console.error('[TURN Test] Failed to trigger config refresh', error);
      if ((callingRepository as any).logger) {
        (callingRepository as any).logger.warn('TURN Test: Failed to trigger config refresh', error);
      }
    }
  } else {
    console.warn('[TURN Test] Cannot trigger config refresh - requestConfig not available');
  }

  console.log('[TURN Test] Override setup complete');

  // Return cleanup function
  return () => {
    console.log('[TURN Test] Cleaning up overrides');
    if (originalFetchConfig) {
      callingRepository.fetchConfig = originalFetchConfig;
      console.log('[TURN Test] Restored original fetchConfig');
    }
    if (originalRequestConfig) {
      (callingRepository as any).requestConfig = originalRequestConfig;
      console.log('[TURN Test] Restored original requestConfig');
    }
    if (unpatchRTCPeerConnection) {
      unpatchRTCPeerConnection();
      console.log('[TURN Test] Removed RTCPeerConnection patch');
    }
    console.log('[TURN Test] Cleanup complete');
  };
}
