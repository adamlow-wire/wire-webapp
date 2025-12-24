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

import {memo} from 'react';

import type {CallingRepository} from 'Repositories/calling/CallingRepository';
import type {ConversationRepository} from 'Repositories/conversation/ConversationRepository';

import {PreferencesPage} from './components/PreferencesPage';
import {TurnTestConfig} from './turnTest/TurnTestConfig';
import {TurnTestStats} from './turnTest/TurnTestStats';
import {useTurnTest} from './turnTest/useTurnTest';

interface TurnTestPreferencesProps {
  callingRepository: CallingRepository;
  conversationRepository: ConversationRepository;
}

const TurnTestPreferencesComponent = ({callingRepository, conversationRepository}: TurnTestPreferencesProps) => {
  const {isRunning, testConfig, setTestConfig, stats, error, availableTurnServers, testGroup, startTest, stopTest} =
    useTurnTest(callingRepository, conversationRepository);

  return (
    <PreferencesPage title="TURN Testing">
      <div
        className="turn-test-preferences"
        style={{display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'flex-start'}}
      >
        {/* Left column: Configuration and TURN Server Table */}
        <div style={{minWidth: 0}}>
          <TurnTestConfig
            testGroup={testGroup}
            config={testConfig}
            onConfigChange={setTestConfig}
            onStart={startTest}
            onStop={stopTest}
            isRunning={isRunning}
            error={error}
            availableTurnServers={availableTurnServers}
          />
        </div>

        {/* Right column: Test Results */}
        {stats && (
          <div style={{position: 'sticky', top: '20px'}}>
            <TurnTestStats stats={stats} />
          </div>
        )}
      </div>
    </PreferencesPage>
  );
};

export const TurnTestPreferences = memo(TurnTestPreferencesComponent);
