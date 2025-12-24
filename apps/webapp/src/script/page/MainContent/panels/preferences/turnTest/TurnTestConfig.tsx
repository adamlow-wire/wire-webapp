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

import {ChangeEvent, useCallback} from 'react';

import {Button, ButtonVariant, Checkbox, CheckboxLabel, Input} from '@wireapp/react-ui-kit';

import type {Conversation} from 'Repositories/entity/Conversation';

import type {TurnTestConfig as TurnTestConfigType} from './turnConfigOverride';
import {TurnServerTable} from './TurnServerTable';

import {PreferencesSection} from '../components/PreferencesSection';

interface TurnTestConfigProps {
  testGroup: Conversation | null;
  config: TurnTestConfigType & {duration: number; selectedServers?: string[]};
  onConfigChange: (config: Partial<TurnTestConfigType & {duration: number; selectedServers?: string[]}>) => void;
  onStart: () => Promise<void>;
  onStop: () => void;
  isRunning: boolean;
  error: string | null;
  availableTurnServers: string[];
}

export const TurnTestConfig = ({
  testGroup,
  config,
  onConfigChange,
  onStart,
  onStop,
  isRunning,
  error,
  availableTurnServers,
}: TurnTestConfigProps) => {
  const handleServerToggle = useCallback(
    (url: string) => {
      const currentSelected = config.selectedServers || [];
      const newSelected = currentSelected.includes(url)
        ? currentSelected.filter(s => s !== url)
        : [...currentSelected, url];
      onConfigChange({selectedServers: newSelected});
    },
    [config.selectedServers, onConfigChange],
  );

  const handleDurationChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const duration = parseInt(event.target.value, 10);
      if (!isNaN(duration) && duration > 0) {
        onConfigChange({duration});
      }
    },
    [onConfigChange],
  );

  const handleForceTurnChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onConfigChange({forceTurn: event.target.checked});
    },
    [onConfigChange],
  );

  return (
    <PreferencesSection title="TURN Testing">
      {/* Test Group Info */}
      {testGroup && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px',
            backgroundColor: '#f0f9ff',
            borderRadius: '6px',
            border: '1px solid #bae6fd',
          }}
        >
          <div style={{fontSize: '12px', color: '#666', marginBottom: '4px'}}>Test Group</div>
          <div style={{fontSize: '14px', color: '#1e40af', fontWeight: '500'}}>
            {testGroup.display_name() || testGroup.name() || 'TURN Test Group'}
          </div>
        </div>
      )}

      {/* Top row: Duration, Start Test button */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px auto',
          gap: '16px',
          alignItems: 'flex-end',
          marginBottom: '16px',
        }}
      >
        <Input
          type="number"
          label="Duration (sec)"
          value={config.duration.toString()}
          onChange={handleDurationChange}
          disabled={isRunning}
          data-uie-name="turn-test-duration"
          min={1}
          max={300}
        />
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
          {!isRunning ? (
            <Button
              variant={ButtonVariant.PRIMARY}
              onClick={onStart}
              disabled={!testGroup}
              data-uie-name="turn-test-start"
            >
              Start Test
            </Button>
          ) : (
            <Button variant={ButtonVariant.SECONDARY} onClick={onStop} data-uie-name="turn-test-stop">
              Stop Test
            </Button>
          )}
          {isRunning && <span style={{color: '#666', fontSize: '12px', textAlign: 'center'}}>Test in progress...</span>}
        </div>
      </div>

      {/* Force TURN checkbox */}
      <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px'}}>
        <Checkbox
          id="turn-test-force-turn"
          checked={config.forceTurn || false}
          onChange={handleForceTurnChange}
          disabled={isRunning}
          data-uie-name="turn-test-force-turn"
        />
        <CheckboxLabel
          htmlFor="turn-test-force-turn"
          style={{fontSize: '13px', cursor: isRunning ? 'not-allowed' : 'pointer'}}
        >
          Force TURN usage (skip direct connections)
        </CheckboxLabel>
      </div>

      {error && (
        <div
          style={{
            color: 'red',
            padding: '12px',
            backgroundColor: '#fee',
            borderRadius: '4px',
            border: '1px solid #fcc',
            marginBottom: '16px',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* TURN Server Table - Full width below */}
      {availableTurnServers.length > 0 && (
        <TurnServerTable
          serverUrls={availableTurnServers}
          protocolFilter="both"
          ipVersionFilter="both"
          selectedServers={config.selectedServers || []}
          onServerToggle={handleServerToggle}
          isDisabled={isRunning}
        />
      )}
    </PreferencesSection>
  );
};
