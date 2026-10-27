export interface ApiDiagnosticsSnapshot {
	application: {
		memoryBytes: number;
		runtimeMode: 'development' | 'production';
		uptimeSeconds: number;
		version: string;
	};
	counts: {
		activeDocuments: number | null;
		chunks: number | null;
		documents: number | null;
		messages: number | null;
		notebookPages: number | null;
		notebooks: number | null;
		sessions: number | null;
		syncedFolders: number | null;
	};
	generatedAt: string;
	health: {
		database: 'healthy' | 'unavailable';
		embeddingModel: 'installed' | 'missing' | 'unavailable';
		searchIndex: 'ready' | 'out-of-sync' | 'unavailable';
	};
}
