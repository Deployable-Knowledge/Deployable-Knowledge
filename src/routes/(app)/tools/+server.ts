import { toolRegistry } from '#lib/server/tools';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => Response.json(toolRegistry.catalog());
