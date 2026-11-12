import { error } from '@sveltejs/kit';
import type { ApiDocumentImportEvent } from '#lib/types';
import { PackageFormatError } from '#lib/server/documents/document-package';
import {
	importDocumentPackage,
	receiveDocumentPackage,
	type DocumentPackage
} from '#lib/server/documents/import-documents';
import { createLogger } from '#lib/server/logging';
import { ndjsonTaskResponse } from '#lib/server/utils/ndjson-response';
import type { RequestHandler } from './$types';

const log = createLogger('documents');

export const POST: RequestHandler = async ({ request, url }) => {
	if (!request.body) throw error(400, 'Choose an exported zip file.');
	const localOnly = url.searchParams.get('localOnly') === 'true';

	let documentPackage: DocumentPackage;
	try {
		documentPackage = await receiveDocumentPackage(request.body);
	} catch (cause) {
		if (cause instanceof PackageFormatError) throw error(400, cause.message);
		throw cause;
	}

	return ndjsonTaskResponse<ApiDocumentImportEvent>(
		log,
		'Document import',
		async (send) => {
			try {
				const result = await importDocumentPackage(documentPackage, localOnly, (progress) =>
					send({ status: 'progress', ...progress })
				);
				send({ status: 'complete', result });
			} finally {
				await documentPackage.dispose();
			}
		},
		(cause) => ({
			status: 'error',
			message: cause instanceof Error ? cause.message : 'Document import failed'
		})
	);
};
