import type { RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { ApiNotebookTitleRequest } from '#lib/types';
import { db } from '#lib/server/database/database';
import { notebooks, type Notebook } from '#lib/server/database/schema';
import {
	createDefaultNotebook,
	getActiveNotebookId,
	loadNotebookState,
	setActiveNotebook
} from '#lib/server/repositories/notebooks.repository';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = params.id;
	if (!id) return Response.json({ error: 'Missing notebook id' }, { status: 400 });
	const body = (await request.json()) as ApiNotebookTitleRequest;
	const title = body.title.trim();
	if (!title) return Response.json({ error: 'Notebook title is required' }, { status: 400 });

	await db
		.update(notebooks)
		.set({ title, updatedAt: new Date().toISOString() })
		.where(eq(notebooks.id, id));
	return Response.json(await loadNotebookState());
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = params.id;
	if (!id) return Response.json({ error: 'Missing notebook id' }, { status: 400 });
	const activeId = await getActiveNotebookId();
	await db.delete(notebooks).where(eq(notebooks.id, id));
	const remaining: Notebook[] = await db
		.select()
		.from(notebooks)
		.orderBy(asc(notebooks.sortOrder), asc(notebooks.createdAt));

	if (!remaining.length) await createDefaultNotebook();
	else if (activeId === id || !remaining.some((notebook) => notebook.id === activeId)) {
		await setActiveNotebook(remaining[0].id);
	}
	return Response.json(await loadNotebookState());
};
