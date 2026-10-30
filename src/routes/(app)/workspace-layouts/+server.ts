import { error } from '@sveltejs/kit';

import type { ApiWorkspaceLayoutCreateRequest } from '#lib/types';
import { WorkspaceLayoutsRepository } from '#lib/server/repositories';
import {
	nextLayoutName,
	normalizeLayoutName,
	normalizeLayoutSnapshot
} from '#lib/server/workspace/layout-values';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return Response.json(await WorkspaceLayoutsRepository.loadState());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiWorkspaceLayoutCreateRequest;
	const snapshot = normalizeLayoutSnapshot(body.snapshot);

	if (!snapshot) {
		throw error(400, 'Layout snapshot is invalid');
	}

	const existing = await WorkspaceLayoutsRepository.list();
	const name = normalizeLayoutName(body.name) ?? nextLayoutName(existing.map(({ name }) => name));
	const layout = await WorkspaceLayoutsRepository.create({ name, snapshot });

	return Response.json(layout, { status: 201 });
};
