import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';
import { openPromise, type Entry, type ZipFile } from 'yauzl';

export class ZipArchive {
	private constructor(
		private readonly zip: ZipFile,
		private readonly entries: ReadonlyMap<string, Entry>
	) {}

	static async open(path: string): Promise<ZipArchive> {
		const zip = await openPromise(path, { autoClose: false, strictFileNames: true });
		try {
			const entries = new Map<string, Entry>();
			for await (const entry of zip.eachEntry()) {
				if (entry.fileName.endsWith('/')) continue;
				if (entries.has(entry.fileName)) {
					throw new Error(`The zip lists ${entry.fileName} more than once.`);
				}
				entries.set(entry.fileName, entry);
			}
			return new ZipArchive(zip, entries);
		} catch (cause) {
			zip.close();
			throw cause;
		}
	}

	has(name: string): boolean {
		return this.entries.has(name);
	}

	async read(name: string): Promise<Buffer> {
		return buffer(await this.openEntry(name));
	}

	async extract(name: string, destination: string): Promise<void> {
		await pipeline(await this.openEntry(name), createWriteStream(destination));
	}

	async sha256(name: string): Promise<string> {
		const hash = createHash('sha256');
		for await (const chunk of await this.openEntry(name)) hash.update(chunk);
		return hash.digest('hex');
	}

	close(): void {
		this.zip.close();
	}

	private async openEntry(name: string): Promise<Readable> {
		const entry = this.entries.get(name);
		if (!entry) throw new Error(`The zip has no ${name}.`);
		return this.zip.openReadStreamPromise(entry);
	}
}
