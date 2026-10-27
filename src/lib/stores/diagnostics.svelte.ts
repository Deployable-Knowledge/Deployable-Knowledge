import { browser } from '$app/env';
import { DiagnosticsService } from '#lib/services';
import type { ApiDiagnosticsSnapshot, ApiLogsResponse, LogEntry } from '#lib/types';

const CLIENT_LOG_LIMIT = 1_000;
const LOG_POLL_INTERVAL_MS = 2_000;
const SNAPSHOT_REFRESH_INTERVAL_MS = 15_000;

class DiagnosticsStore {
	private logTimer: number | null = null;
	private latestId = 0;
	private listeners = 0;
	private polling = false;
	private runId: string | null = null;
	private snapshotTimer: number | null = null;

	entries = $state<LogEntry[]>([]);
	error = $state<string | null>(null);
	loading = $state(false);
	paused = $state(false);
	snapshot = $state<ApiDiagnosticsSnapshot | null>(null);

	start(): void {
		if (!browser) return;
		this.listeners += 1;
		if (this.listeners > 1) return;

		void this.refresh();
		this.logTimer = window.setInterval(() => this.pollLogs(), LOG_POLL_INTERVAL_MS);
		this.snapshotTimer = window.setInterval(
			() => this.pollSnapshot(),
			SNAPSHOT_REFRESH_INTERVAL_MS
		);
	}

	stop(): void {
		this.listeners = Math.max(0, this.listeners - 1);
		if (this.listeners > 0) return;

		if (this.logTimer !== null) window.clearInterval(this.logTimer);
		if (this.snapshotTimer !== null) window.clearInterval(this.snapshotTimer);
		this.logTimer = null;
		this.snapshotTimer = null;
	}

	setPaused(paused: boolean): void {
		if (paused === this.paused) return;
		this.paused = paused;
		if (!paused) this.pollLogs();
	}

	async refresh(): Promise<void> {
		if (this.loading) return;
		this.loading = true;
		this.error = null;
		try {
			await Promise.all([this.refreshSnapshot(), this.refreshLogs()]);
		} catch (error) {
			this.error = message(error, 'Diagnostics could not be loaded.');
		} finally {
			this.loading = false;
		}
	}

	private pollLogs(): void {
		void this.refreshLogs().catch((error) => {
			this.error = message(error, 'Log polling failed.');
		});
	}

	private pollSnapshot(): void {
		void this.refreshSnapshot().catch((error) => {
			this.error = message(error, 'Diagnostic health check failed.');
		});
	}

	private async refreshSnapshot(): Promise<void> {
		this.snapshot = await DiagnosticsService.getSnapshot();
		this.error = null;
	}

	private async refreshLogs(): Promise<void> {
		if (this.paused || this.polling) return;
		this.polling = true;
		try {
			const response = await DiagnosticsService.getLogs(this.latestId);
			if (response.runId === this.runId) {
				this.appendEntries(response);
			} else {
				this.replaceEntries(this.latestId > 0 ? await DiagnosticsService.getLogs(0) : response);
			}
			this.error = null;
		} finally {
			this.polling = false;
		}
	}

	private appendEntries(response: ApiLogsResponse): void {
		this.latestId = response.latestId;
		if (response.entries.length === 0) return;
		this.entries = [...this.entries, ...response.entries].slice(-CLIENT_LOG_LIMIT);
	}

	private replaceEntries(response: ApiLogsResponse): void {
		this.runId = response.runId;
		this.latestId = response.latestId;
		this.entries = response.entries.slice(-CLIENT_LOG_LIMIT);
	}
}

function message(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export const diagnosticsStore = new DiagnosticsStore();
