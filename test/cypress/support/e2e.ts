import 'cumulocity-cypress/lib/commands';
import { registerCommands } from './commands';

registerCommands();

import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector';

installLogsCollector();

