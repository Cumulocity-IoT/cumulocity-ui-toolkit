export const OPERATION_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'IOperation',
  type: 'object',
  required: [],
  properties: {
    id: {
      description: 'Identifier for operation',
      type: ['string', 'number'],
    },
    deviceId: {
      type: 'string',
      description: 'Identifies the target device on which this operation should be performed',
    },
    status: {
      description: 'Status of operation, see [[OperationStatus]]',
      allOf: [
        {
          $ref: '#/definitions/OperationStatus',
        },
      ],
    },
  },
  additionalProperties: true,
  definitions: {
    OperationStatus: {
      description: 'Placeholder for OperationStatus enum or type',
      type: 'string',
    },
  },
} as const;
