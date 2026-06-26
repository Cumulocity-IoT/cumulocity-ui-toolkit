export const EVENT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'IEvent',
  type: 'object',
  required: ['type', 'time', 'text'],
  properties: {
    source: {
      description: 'The ManagedObject that the event originated from, see [[ISource]]',
      allOf: [
        {
          $ref: '#/definitions/ISource',
        },
      ],
    },
    type: {
      type: 'string',
      description: 'Identifies the type of this event',
    },
    time: {
      type: 'string',
      description: 'Time of the event',
      format: 'date-time',
    },
    text: {
      type: 'string',
      description: 'Text description of the event',
    },
    id: {
      description: 'Uniquely identifies an event',
      type: ['string', 'number'],
    },
    self: {
      type: 'string',
      description: 'Link to this resource',
      format: 'uri',
    },
    creationTime: {
      type: 'string',
      description: 'Time when event was created in the database',
      format: 'date-time',
    },
  },
  additionalProperties: true,
  definitions: {
    ISource: {
      type: 'object',
      description: 'Placeholder for ISource definition',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
        },
        name: {
          type: 'string',
        },
        self: {
          type: 'string',
          format: 'uri',
        },
      },
    },
  },
} as const;
