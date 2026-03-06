export const ALARM_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'IAlarm',
  type: 'object',
  required: ['severity', 'type', 'time', 'text'],
  properties: {
    severity: {
      description: 'Specifies the severity of an alarm',
      allOf: [
        {
          $ref: '#/definitions/SeverityType',
        },
      ],
    },
    source: {
      description: 'Specifies which device has the alarm',
      allOf: [
        {
          $ref: '#/definitions/ISource',
        },
      ],
    },
    type: {
      type: 'string',
      description: 'Type of the alarm',
    },
    time: {
      type: 'string',
      description: 'Time when the alarm occurred',
      format: 'date-time',
    },
    text: {
      type: 'string',
      description: 'Alarm text',
    },
    id: {
      description: 'Identifier of the alarm',
      type: ['string', 'number'],
    },
    status: {
      description: 'Current status of the alarm',
      allOf: [
        {
          $ref: '#/definitions/AlarmStatusType',
        },
      ],
    },
    count: {
      type: 'number',
      description: 'How many times the same alarm appeared',
    },
    name: {
      type: 'string',
      description: 'Name of the alarm',
    },
    history: {
      type: 'object',
      description: 'Object with audit records as array',
    },
    self: {
      type: 'string',
      description: 'Self link to the alarm',
    },
    creationTime: {
      type: 'string',
      description: 'When was the alarm created as first instance',
      format: 'date-time',
    },
    firstOccurrenceTime: {
      type: 'string',
      description: 'The time when the alarm first occurred',
      format: 'date-time',
    },
  },
  additionalProperties: true,
  definitions: {
    SeverityType: {
      type: 'string',
      enum: ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING'],
    },
    AlarmStatusType: {
      type: 'string',
      enum: ['ACKNOWLEDGED', 'CLEARED', 'ACTIVE'],
    },
    ISource: {
      type: 'object',
      description: 'Placeholder for ISource definition',
    },
  },
} as const;
