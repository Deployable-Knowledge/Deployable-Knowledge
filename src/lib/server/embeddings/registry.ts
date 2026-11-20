import { LOCAL_MODEL_PROVIDER_ID } from '#lib/constants';
import type { CustomProviderRecord } from '#lib/server/database/schema';
import { CustomProvidersRepository } from '#lib/server/repositories';
import { LlamaCppEmbeddingProvider } from './llamacpp';
import { OpenAiCompatibleEmbeddingProvider } from './openai-compatible';
import type { EmbeddingProvider } from './provider';

export const localEmbeddingProvider = new LlamaCppEmbeddingProvider();

function servesEmbeddings(record: CustomProviderRecord): boolean {
	return record.type !== 'anthropic';
}

export async function findEmbeddingProvider(id: string): Promise<EmbeddingProvider | null> {
	if (id === LOCAL_MODEL_PROVIDER_ID) return localEmbeddingProvider;

	const record = await CustomProvidersRepository.find(id);
	return record && servesEmbeddings(record) ? new OpenAiCompatibleEmbeddingProvider(record) : null;
}

export async function listEmbeddingProviders(): Promise<EmbeddingProvider[]> {
	const custom = (await CustomProvidersRepository.list()).filter(servesEmbeddings);
	return [
		localEmbeddingProvider,
		...custom.map((record) => new OpenAiCompatibleEmbeddingProvider(record))
	];
}
