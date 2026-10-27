export const SETUP_COMPONENT_IDS = ['ocr', 'transcription', 'reranker', 'embedding'] as const;

export type SetupComponentId = (typeof SETUP_COMPONENT_IDS)[number];
