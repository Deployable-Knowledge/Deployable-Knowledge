import BetweenHorizontalEnd from '@lucide/svelte/icons/between-horizontal-end';
import BetweenHorizontalStart from '@lucide/svelte/icons/between-horizontal-start';
import BetweenVerticalEnd from '@lucide/svelte/icons/between-vertical-end';
import BetweenVerticalStart from '@lucide/svelte/icons/between-vertical-start';
import Columns3 from '@lucide/svelte/icons/columns-3';
import Rows3 from '@lucide/svelte/icons/rows-3';
import Trash2 from '@lucide/svelte/icons/trash-2';
import type { TableCommand } from './notebook-editing';

interface TableEdit {
	command: TableCommand;
	label: string;
	icon: typeof Rows3;
	destructive?: boolean;
}

export const TABLE_EDIT_GROUPS: TableEdit[][] = [
	[
		{ command: 'add-row-above', label: 'Insert row above', icon: BetweenHorizontalStart },
		{ command: 'add-row-below', label: 'Insert row below', icon: BetweenHorizontalEnd },
		{ command: 'add-column-left', label: 'Insert column left', icon: BetweenVerticalStart },
		{ command: 'add-column-right', label: 'Insert column right', icon: BetweenVerticalEnd }
	],
	[
		{ command: 'delete-row', label: 'Delete row', icon: Rows3 },
		{ command: 'delete-column', label: 'Delete column', icon: Columns3 },
		{ command: 'delete-table', label: 'Delete table', icon: Trash2, destructive: true }
	]
];
