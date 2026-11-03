export type IndexCollection = 'logs' | 'analyses';

export interface IndexDefinition {
  collection: IndexCollection;
  name: string;
  keys: Record<string, 1 | -1>;
}

export const INDEX_DEFINITIONS: IndexDefinition[] = [
  {
    collection: 'logs',
    name: 'timestamp_-1',
    keys: { timestamp: -1 },
  },
  {
    collection: 'logs',
    name: 'service_1_timestamp_-1',
    keys: { service: 1, timestamp: -1 },
  },
  {
    collection: 'logs',
    name: 'level_1_timestamp_-1',
    keys: { level: 1, timestamp: -1 },
  },
  {
    collection: 'analyses',
    name: 'status_1_createdAt_-1',
    keys: { status: 1, createdAt: -1 },
  },
  {
    collection: 'analyses',
    name: 'createdAt_-1',
    keys: { createdAt: -1 },
  },
];

export function formatIndexCommands(
  definitions: IndexDefinition[],
): string[] {
  return definitions.map(
    (definition) => `${definition.collection}.${definition.name}`,
  );
}
