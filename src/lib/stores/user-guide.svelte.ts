import { UserGuideService } from '#lib/services';
import type { UserGuideChapter } from '#lib/types';

class UserGuideStore {
	private firstRunChecked = false;
	open = $state(false);
	chapters = $state<UserGuideChapter[]>([]);
	activeIndex = $state(0);
	loading = $state(false);
	error = $state<string | null>(null);

	activeChapter = $derived<UserGuideChapter | null>(this.chapters[this.activeIndex] ?? null);
	hasPrevious = $derived(this.activeIndex > 0);
	hasNext = $derived(this.activeIndex < this.chapters.length - 1);

	show(): void {
		this.open = true;
		void this.load();
	}

	async openOnFirstRun(): Promise<void> {
		if (this.firstRunChecked) return;
		this.firstRunChecked = true;

		try {
			const { open } = await UserGuideService.claimFirstRun();
			if (open) this.show();
		} catch {
			// The guide is still one click away in the toolbar, so a failed check
			// simply leaves it closed instead of interrupting startup with an error.
		}
	}

	setOpen(open: boolean): void {
		if (this.open === open) return;
		this.open = open;
	}

	async load(): Promise<void> {
		if (this.chapters.length || this.loading) return;

		this.loading = true;
		this.error = null;
		try {
			this.chapters = await UserGuideService.list();
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not load the user guide.';
		} finally {
			this.loading = false;
		}
	}

	select(index: number): void {
		if (index < 0 || index >= this.chapters.length || index === this.activeIndex) return;
		this.activeIndex = index;
	}

	previous(): void {
		this.select(this.activeIndex - 1);
	}

	next(): void {
		this.select(this.activeIndex + 1);
	}
}

export const userGuideStore = new UserGuideStore();
