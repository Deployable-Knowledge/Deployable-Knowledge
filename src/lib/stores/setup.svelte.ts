import type { SetupComponentId } from '#lib/constants';
import { SetupService } from '#lib/services';
import type { ApiDocumentIngestProgress, ApiSetupStatus } from '#lib/types';

export type SetupStep = 'components' | 'model';

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

class SetupStore {
	status = $state<ApiSetupStatus | null>(null);
	step = $state<SetupStep>('components');
	installingId = $state<SetupComponentId | null>(null);
	failedId = $state<SetupComponentId | null>(null);
	progress = $state<ApiDocumentIngestProgress | null>(null);
	error = $state<string | null>(null);
	finishing = $state(false);

	readonly pending = $derived(
		this.status?.components.filter((component) => !component.installed) ?? []
	);

	async init(): Promise<void> {
		if (this.status) return;

		this.error = null;
		try {
			this.status = await SetupService.getStatus();
		} catch (error) {
			this.error = errorMessage(error, 'Could not check which components are installed.');
			return;
		}

		if (this.pending.length === 0) this.step = 'model';
		else await this.installPending();
	}

	async retry(): Promise<void> {
		if (this.status) await this.installPending();
		else await this.init();
	}

	async installPending(): Promise<void> {
		if (this.installingId) return;

		this.error = null;
		this.failedId = null;
		for (const component of this.pending) {
			if (this.step !== 'components') return;

			this.installingId = component.id;
			try {
				await SetupService.install(component.id, (progress) => (this.progress = progress));
				component.installed = true;
			} catch (error) {
				this.failedId = component.id;
				this.error = errorMessage(error, 'The download failed.');
				return;
			} finally {
				this.installingId = null;
				this.progress = null;
			}
		}
	}

	showModels(): void {
		this.step = 'model';
		this.error = null;
	}

	async finish(): Promise<boolean> {
		if (this.finishing) return false;

		this.finishing = true;
		this.error = null;
		try {
			await SetupService.complete();
			return true;
		} catch (error) {
			this.error = errorMessage(error, 'Could not finish setup.');
			return false;
		} finally {
			this.finishing = false;
		}
	}
}

export const setupStore = new SetupStore();
