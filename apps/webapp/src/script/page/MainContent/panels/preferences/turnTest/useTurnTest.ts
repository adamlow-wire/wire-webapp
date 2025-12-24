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
import {useState, useCallback, useRef, useEffect} from 'react';

import {amplify} from 'amplify';
import {container} from 'tsyringe';

import {STATE as CALL_STATE} from '@wireapp/avs';
import {WebAppEvents} from '@wireapp/webapp-events';

import type {CallingRepository} from 'Repositories/calling/CallingRepository';
import {LEAVE_CALL_REASON} from 'Repositories/calling/enum/LeaveCallReason';
import {ConversationRepository} from 'Repositories/conversation/ConversationRepository';
import {ConversationState} from 'Repositories/conversation/ConversationState';
import type {Conversation} from 'Repositories/entity/Conversation';
import {EventName} from 'Repositories/tracking/EventName';
import {UserState} from 'Repositories/user/UserState';

import {overrideTurnConfig, type TurnTestConfig} from './turnConfigOverride';

export interface TurnTestStats {
  timestamp: number;
  bytesSent?: number;
  bytesReceived?: number;
  packetsSent?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
  rtt?: number;
  turnServer?: string;
  protocol?: 'tcp' | 'udp';
  ipVersion?: 'ipv4' | 'ipv6';
  connectionQuality?: string;
  callType?: string;
  selectedTurnServer?: string;
  callDuration?: number; // Duration in seconds
}

interface UseTurnTestReturn {
  isRunning: boolean;
  testConfig: TurnTestConfig & {duration: number; selectedServers?: string[]};
  setTestConfig: (config: Partial<TurnTestConfig & {duration: number; selectedServers?: string[]}>) => void;
  stats: TurnTestStats | null;
  error: string | null;
  availableTurnServers: string[];
  testGroup: Conversation | null;
  startTest: () => Promise<void>;
  stopTest: () => void;
}

/**
 * Gets or creates a persistent TURN test group for the current user
 */
async function getOrCreateTurnTestGroup(conversationRepository: ConversationRepository): Promise<Conversation> {
  const conversationState = container.resolve(ConversationState);
  const userState = container.resolve(UserState);

  const selfUser = userState.self();
  if (!selfUser) {
    throw new Error('Self user is not available');
  }

  // Generate unique group name: "TURN Test - [username]" or "TURN Test - [user_id]" if username unavailable
  const username = selfUser.username() || selfUser.id;
  const groupName = `TURN Test - ${username}`;

  // Search for existing group with this name
  const existingGroup = conversationState.conversations().find(conv => {
    return conv.isGroupOrChannel() && conv.name() === groupName;
  });

  if (existingGroup) {
    return existingGroup;
  }

  // Create new group with empty user list (just self user)
  const newGroup = await conversationRepository.createGroupConversation(
    [], // Empty user list - just self user
    groupName,
    undefined, // No access state
    {
      // Group type (not channel)
      group_conv_type: undefined, // Default to group
    },
  );

  return newGroup;
}

export function useTurnTest(
  callingRepository: CallingRepository,
  conversationRepository: ConversationRepository,
): UseTurnTestReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [testConfig, setTestConfigState] = useState<TurnTestConfig & {duration: number; selectedServers?: string[]}>({
    protocol: 'both',
    ipVersion: 'both',
    duration: 30,
    selectedServers: [],
    forceTurn: true, // Default to forcing TURN for testing
  });
  const [stats, setStats] = useState<TurnTestStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableTurnServers, setAvailableTurnServers] = useState<string[]>([]);
  const [testGroup, setTestGroup] = useState<Conversation | null>(null);
  const availableTurnServersRef = useRef<string[]>([]);

  const cleanupRef = useRef<(() => void) | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatsRef = useRef<TurnTestStats | null>(null);
  const callStartTimeRef = useRef<number | null>(null);

  const setTestConfig = useCallback(
    (config: Partial<TurnTestConfig & {duration: number; selectedServers?: string[]}>) => {
      setTestConfigState(prev => ({...prev, ...config}));
    },
    [],
  );

  // Get or create test group on mount
  useEffect(() => {
    let isMounted = true;

    getOrCreateTurnTestGroup(conversationRepository)
      .then(group => {
        if (isMounted) {
          setTestGroup(group);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(`Failed to get or create test group: ${err.message}`);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [conversationRepository]);

  // Extract stats from WebRTC RTCStatsReport (standard WebRTC API)
  const extractStatsFromRTCStats = useCallback((statsMap: Map<string, any>): TurnTestStats => {
    const result: TurnTestStats = {
      timestamp: Date.now(),
    };

    if (!statsMap || statsMap.size === 0) {
      return result;
    }

    // Convert Map to array for easier iteration
    const statsArray = Array.from(statsMap.values());

    // Find audio RTP stats (inbound and outbound)
    const inboundRtp = statsArray.find((stat: any) => stat.type === 'inbound-rtp' && stat.kind === 'audio') as any;
    const outboundRtp = statsArray.find((stat: any) => stat.type === 'outbound-rtp' && stat.kind === 'audio') as any;

    // Extract audio stats
    if (inboundRtp) {
      result.bytesReceived = inboundRtp.bytesReceived || inboundRtp.bytes_received || 0;
      result.packetsReceived = inboundRtp.packetsReceived || inboundRtp.packets_received || 0;
      result.packetsLost = inboundRtp.packetsLost || inboundRtp.packets_lost || 0;
      result.jitter = inboundRtp.jitter || 0;
    }

    if (outboundRtp) {
      result.bytesSent = outboundRtp.bytesSent || outboundRtp.bytes_sent || 0;
      result.packetsSent = outboundRtp.packetsSent || outboundRtp.packets_sent || 0;
    }

    // Find candidate-pair for connection info
    const candidatePairs = statsArray.filter((stat: any) => stat.type === 'candidate-pair') as any[];
    const activePair = candidatePairs.find((pair: any) => pair.selected) || candidatePairs[0];

    if (activePair) {
      // Get RTT from candidate-pair
      if (activePair.currentRoundTripTime !== undefined) {
        result.rtt = activePair.currentRoundTripTime * 1000; // Convert to ms
      }

      // Get local and remote candidate IDs
      const localCandidateId = activePair.localCandidateId;
      const remoteCandidateId = activePair.remoteCandidateId;

      // Find the actual candidate objects
      const localCandidate = statsArray.find(
        (stat: any) => stat.type === 'local-candidate' && stat.id === localCandidateId,
      ) as any;
      const remoteCandidate = statsArray.find(
        (stat: any) => stat.type === 'remote-candidate' && stat.id === remoteCandidateId,
      ) as any;

      // Extract TURN server info from relay candidates
      // Try to match the candidate back to our known TURN server URLs
      const candidateToMatch =
        localCandidate?.candidateType === 'relay'
          ? localCandidate
          : remoteCandidate?.candidateType === 'relay'
            ? remoteCandidate
            : null;

      if (candidateToMatch) {
        const candidateIp = candidateToMatch.ip || candidateToMatch.address;
        const candidatePort = candidateToMatch.port;
        const candidateProtocol = (candidateToMatch.protocol || 'udp').toLowerCase() as 'tcp' | 'udp';

        console.log('[TURN Test] Actual server used - candidate info', {
          candidateType: candidateToMatch.candidateType,
          candidateIp,
          candidatePort,
          candidateProtocol,
          candidateId: candidateToMatch.id,
          localCandidateType: localCandidate?.candidateType,
          remoteCandidateType: remoteCandidate?.candidateType,
        });

        // Try to find matching TURN server URL from available servers
        // Note: We match by IP only, not port, because the candidate port is the allocated
        // relay port (e.g., 60991), not the server's listening port (e.g., 3478)
        let matchedTurnUrl: string | null = null;
        if (candidateIp) {
          matchedTurnUrl =
            availableTurnServersRef.current.find(url => {
              // Parse the URL to extract host
              const urlMatch = url.match(/^(?:turn|turns):(?:\[([^\]]+)\]|([^:]+)):(\d+)/);
              if (!urlMatch) {
                return false;
              }

              const urlHost = urlMatch[1] || urlMatch[2];

              // Match by IP address (hostname will be resolved by browser, but we compare IPs)
              // If urlHost is already an IP, compare directly
              // If urlHost is a hostname, we can't resolve it here, but we'll try to match
              // by checking if the candidate IP matches any known hostname's IP
              // For now, we'll do a simple string comparison (works if hostname was already resolved)
              if (urlHost === candidateIp) {
                return true; // Direct IP match
              }

              // If urlHost is a hostname and candidateIp is an IP, we can't match here
              // without DNS resolution. The browser resolves hostnames, so if the candidate
              // IP matches what the hostname resolves to, we have a match.
              // We'll log this for debugging and try to match by checking if the URL
              // contains transport info that matches the protocol
              return false;
            }) || null;

          // If no direct match, try to match by checking all available servers
          // and see if any hostname might resolve to this IP
          // (This is a fallback - ideally we'd have DNS resolution, but that's async)
          if (!matchedTurnUrl && candidateIp) {
            // Try matching by checking if any server URL's hostname might be this IP
            // We'll use a heuristic: if the URL host is the same as candidate IP, it's a match
            const potentialMatch = availableTurnServersRef.current.find(url => {
              const urlMatch = url.match(/^(?:turn|turns):(?:\[([^\]]+)\]|([^:]+)):(\d+)/);
              if (!urlMatch) {
                return false;
              }
              const urlHost = urlMatch[1] || urlMatch[2];
              // If hostname contains the IP or vice versa, it might be a match
              // This is imperfect but better than nothing
              return urlHost === candidateIp;
            });

            if (potentialMatch) {
              matchedTurnUrl = potentialMatch;
              console.log('[TURN Test] Matched by IP (hostname resolution assumed)', {
                candidateIp,
                matchedUrl: matchedTurnUrl,
              });
            }
          }
        }

        // Set the TURN server info
        if (matchedTurnUrl) {
          result.turnServer = matchedTurnUrl;

          // Check if protocol matches what was selected
          const selectedProtocol = matchedTurnUrl.includes('transport=tcp')
            ? 'tcp'
            : matchedTurnUrl.includes('transport=udp')
              ? 'udp'
              : 'udp';
          const protocolMismatch = selectedProtocol !== candidateProtocol;

          console.log('[TURN Test] Actual server used - matched URL', {
            matchedTurnUrl,
            candidateIp,
            candidatePort: `${candidatePort} (allocated relay port, not server port)`,
            candidateProtocol,
            selectedProtocol,
            protocolMismatch: protocolMismatch ? '⚠️ PROTOCOL MISMATCH!' : '✓ Protocol matches',
            warning: protocolMismatch
              ? `Selected ${selectedProtocol.toUpperCase()} but using ${candidateProtocol.toUpperCase()}`
              : undefined,
          });

          if (protocolMismatch) {
            console.warn('[TURN Test] ⚠️ PROTOCOL MISMATCH DETECTED', {
              selectedUrl: matchedTurnUrl,
              selectedProtocol,
              actualProtocol: candidateProtocol,
              possibleCauses: [
                'RTCPeerConnection patch not applied before connection creation',
                'AVS creating connections before our override is active',
                'TURN server not respecting transport=tcp parameter',
                'WebRTC falling back to UDP due to connection issues',
              ],
            });
          }
        } else {
          // Fallback: construct a display string from candidate info
          result.turnServer =
            candidateIp && candidatePort
              ? `${candidateIp}:${candidatePort}`
              : candidateIp || candidateToMatch.url || 'unknown';

          console.log('[TURN Test] Actual server used - no URL match, using fallback', {
            fallbackTurnServer: result.turnServer,
            candidateIp,
            candidatePort: `${candidatePort} (allocated relay port)`,
            availableServers: availableTurnServersRef.current.map(url => {
              const urlMatch = url.match(/^(?:turn|turns):(?:\[([^\]]+)\]|([^:]+)):(\d+)/);
              const host = urlMatch ? urlMatch[1] || urlMatch[2] : 'unknown';
              return {url, host};
            }),
            note: 'Could not match candidate IP to any known TURN server hostname. This may be due to DNS resolution happening in the browser.',
          });
        }

        result.protocol = candidateProtocol;
        if (candidateIp) {
          result.ipVersion = candidateIp.includes(':') ? 'ipv6' : 'ipv4';
        }
      } else {
        // Not using TURN (direct connection)
        result.turnServer = 'Direct connection (no TURN)';
        console.log('[TURN Test] Actual server used - DIRECT CONNECTION (not using TURN)', {
          localCandidateType: localCandidate?.candidateType,
          remoteCandidateType: remoteCandidate?.candidateType,
          activePairState: activePair?.state,
          activePairSelected: activePair?.selected,
        });
      }

      // If we have protocol from candidate but not TURN server, extract it
      if (!result.protocol && localCandidate?.protocol) {
        result.protocol = localCandidate.protocol.toLowerCase() as 'tcp' | 'udp';
      }
      if (!result.ipVersion && localCandidate) {
        const ip = localCandidate.ip || localCandidate.address;
        if (ip) {
          result.ipVersion = ip.includes(':') ? 'ipv6' : 'ipv4';
        }
      }
    }

    // Calculate connection quality
    if (result.packetsLost !== undefined && result.packetsReceived !== undefined) {
      const totalPackets = (result.packetsReceived || 0) + (result.packetsLost || 0);
      if (totalPackets > 0) {
        const lossRate = (result.packetsLost / totalPackets) * 100;
        if (lossRate < 1) {
          result.connectionQuality = 'Excellent';
        } else if (lossRate < 3) {
          result.connectionQuality = 'Good';
        } else if (lossRate < 5) {
          result.connectionQuality = 'Fair';
        } else {
          result.connectionQuality = 'Poor';
        }
      }
    }

    return result;
  }, []);

  const stopTest = useCallback(() => {
    setIsRunning(false);
    setError(null);

    // Clear intervals
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }

    // Update final duration before preserving stats
    if (lastStatsRef.current && callStartTimeRef.current) {
      lastStatsRef.current.callDuration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      callStartTimeRef.current = null;
    }

    // Preserve last stats instead of clearing them
    if (lastStatsRef.current) {
      setStats(lastStatsRef.current);
    }

    // Cleanup TURN override
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // End call if active
    if (testGroup) {
      try {
        const call = callingRepository.findCall(testGroup.qualifiedId);
        if (call) {
          callingRepository.leaveCall(testGroup.qualifiedId, LEAVE_CALL_REASON.MANUAL_LEAVE_BY_UI_CLICK);
        }
      } catch (err) {
        // Ignore errors when stopping
      }
    }
  }, [callingRepository, testGroup]);

  const startTest = useCallback(async () => {
    if (!testGroup) {
      setError('Test group not available. Please wait...');
      return;
    }

    setIsRunning(true);
    setError(null);
    setStats(null);

    try {
      // Apply TURN config override
      console.log('[TURN Test] Starting test - applying overrides', {
        testConfig,
        testGroup: testGroup?.qualifiedId,
      });
      cleanupRef.current = overrideTurnConfig(callingRepository, testConfig);
      console.log('[TURN Test] Override applied, starting call');

      // Start call with test group
      await callingRepository.startCall(testGroup);

      // Wait for call to establish
      const maxWaitTime = 30000; // 30 seconds
      const startWait = Date.now();
      let established = false;

      while (!established && Date.now() - startWait < maxWaitTime) {
        const call = callingRepository.findCall(testGroup.qualifiedId);
        if (call && call.state() === CALL_STATE.MEDIA_ESTAB) {
          established = true;
          // Record call start time for duration calculation
          callStartTimeRef.current = call.startedAt() || Date.now();
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!established) {
        throw new Error('Call did not establish within timeout');
      }

      // Collect stats - try wCall.getStats() first (simplest and most reliable)
      const collectStats = async () => {
        try {
          const call = callingRepository.findCall(testGroup.qualifiedId);
          if (!call) {
            return;
          }

          const statsPromise = callingRepository.getStats(testGroup.qualifiedId);
          if (!statsPromise) {
            return;
          }

          const rawStats = await statsPromise;
          if (!rawStats) {
            return;
          }

          // Try to extract stats - be very flexible with format
          const statsMap: Map<string, any> = new Map();

          if (Array.isArray(rawStats)) {
            // Handle array format from wCall: [{userid: "...", stats: RTCStatsReport}, ...]
            rawStats.forEach((userStats: any) => {
              // The stats property is an RTCStatsReport (Map-like object)
              if (userStats && userStats.stats) {
                const userStatsReport = userStats.stats;

                // RTCStatsReport is Map-like, iterate through it
                if (typeof (userStatsReport as any).forEach === 'function') {
                  (userStatsReport as any).forEach((statValue: any, statKey: string) => {
                    statsMap.set(statKey, statValue);
                  });
                } else if (Array.isArray(userStatsReport)) {
                  // Fallback: if it's an array
                  userStatsReport.forEach((stat: any, statIndex: number) => {
                    const key = `user-stat-${statIndex}`;
                    statsMap.set(key, stat);
                  });
                }
              }
            });
          } else if (
            rawStats &&
            typeof rawStats === 'object' &&
            'forEach' in rawStats &&
            typeof (rawStats as any).forEach === 'function'
          ) {
            // It's Map-like (RTCStatsReport) - direct format
            (rawStats as any).forEach((value: any, key: string) => {
              statsMap.set(key, value);
            });
          } else if (typeof rawStats === 'object') {
            Object.entries(rawStats).forEach(([key, value]) => {
              statsMap.set(key, value);
            });
          }

          // Extract stats
          const extracted = extractStatsFromRTCStats(statsMap);

          // Add call type information
          extracted.callType = call.conversation.is1to1()
            ? '1-to-1'
            : call.conversation.isGroupOrChannel()
              ? 'Group'
              : 'Unknown';

          // Add selected TURN server info from config
          if (testConfig.selectedServers && testConfig.selectedServers.length > 0) {
            if (testConfig.selectedServers.length === 1) {
              extracted.selectedTurnServer = testConfig.selectedServers[0];
            } else {
              extracted.selectedTurnServer = `${testConfig.selectedServers.length} servers selected`;
            }
          } else {
            extracted.selectedTurnServer = 'All servers';
          }

          // Calculate call duration
          if (callStartTimeRef.current) {
            extracted.callDuration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
          }

          setStats(extracted);
          lastStatsRef.current = extracted;
        } catch (err) {
          // Silently handle stats collection errors
        }
      };

      // Collect initial stats
      collectStats();

      // Set up interval for real-time stats collection (every 1 second for real-time updates)
      statsIntervalRef.current = setInterval(() => {
        collectStats();
      }, 1000);

      // Set timeout to end test
      testTimeoutRef.current = setTimeout(() => {
        stopTest();
      }, testConfig.duration * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRunning(false);
      stopTest();
    }
  }, [callingRepository, testConfig, testGroup, extractStatsFromRTCStats, stopTest]);

  // Load available TURN servers on mount and when config changes
  useEffect(() => {
    const loadTurnServers = async () => {
      try {
        if (callingRepository.fetchConfig) {
          const config = await callingRepository.fetchConfig();
          const iceServers = config?.ice_servers || [];
          const serverUrls: string[] = [];

          iceServers.forEach((server: any) => {
            if (server.urls && Array.isArray(server.urls)) {
              server.urls.forEach((url: string) => {
                if (url.startsWith('turn:') || url.startsWith('turns:')) {
                  serverUrls.push(url);
                }
              });
            } else if (typeof server.urls === 'string') {
              if (server.urls.startsWith('turn:') || server.urls.startsWith('turns:')) {
                serverUrls.push(server.urls);
              }
            }
          });

          setAvailableTurnServers(serverUrls);
          availableTurnServersRef.current = serverUrls;
        }
      } catch (err) {
        // Silently handle errors
      }
    };

    void loadTurnServers();
  }, [callingRepository]);

  // Listen for call end events to auto-stop the test
  useEffect(() => {
    const handleCallEnd = (eventName: string) => {
      if (eventName === EventName.CALLING.ENDED_CALL && isRunning && !callingRepository.hasActiveCall()) {
        // Call ended, stop the test automatically
        stopTest();
      }
    };

    amplify.subscribe(WebAppEvents.ANALYTICS.EVENT, handleCallEnd);
    return () => {
      amplify.unsubscribe(WebAppEvents.ANALYTICS.EVENT, handleCallEnd);
    };
  }, [isRunning, callingRepository, stopTest]);

  return {
    isRunning,
    testConfig,
    setTestConfig,
    stats,
    error,
    availableTurnServers,
    testGroup,
    startTest,
    stopTest,
  };
}
