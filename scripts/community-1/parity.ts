/*
 * Community-1 TypeScript port: parity and regression tooling.
 *
 *   npx tsx scripts/community-1/parity.ts decode <audio> <waveform.f32>
 *   npx tsx scripts/community-1/parity.ts self-check
 *   npx tsx scripts/community-1/parity.ts compare <waveform.f32> <referenceDir>
 *   npx tsx scripts/community-1/parity.ts run <audio>
 *
 * Reference directories are produced outside this repository by the Python test harness
 * (`capture_reference.py`); nothing in the application depends on them.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeAudioFile } from '../../src/lib/server/transcription/audio-decoder';
import { UNASSIGNED } from '../../src/lib/server/transcription/community-1/clustering';
import {
	computeFbank,
	countFbankFrames,
	MEL_BINS
} from '../../src/lib/server/transcription/community-1/fbank';
import {
	poolEmbedding,
	runFrameFeatures
} from '../../src/lib/server/transcription/community-1/embeddings';
import { parseNpy, type NpyArray } from '../../src/lib/server/transcription/community-1/npy';
import {
	createCommunity1Diarizer,
	type DiarizationOutput
} from '../../src/lib/server/transcription/community-1/pipeline';
import { EMBEDDING_DIMENSION } from '../../src/lib/server/transcription/community-1/plda';
import {
	CHUNK_SAMPLES,
	copyChunk,
	FRAMES_PER_CHUNK
} from '../../src/lib/server/transcription/community-1/segmentation';
import type { SpeakerTurn } from '../../src/lib/server/transcription/speaker-turn';

type Numeric = ArrayLike<number>;

function maxAbsDiff(left: Numeric, right: Numeric): number {
	if (left.length !== right.length) return Infinity;
	let maximum = 0;
	for (let index = 0; index < left.length; index++) {
		maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
	}
	return maximum;
}

function cosine(left: Numeric, right: Numeric): number {
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < left.length; index++) {
		dot += left[index] * right[index];
		leftNorm += left[index] ** 2;
		rightNorm += right[index] ** 2;
	}
	return dot / Math.sqrt(leftNorm * rightNorm);
}

function permutations(values: number[]): number[][] {
	if (values.length <= 1) return [values];
	return values.flatMap((value, index) =>
		permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
			value,
			...rest
		])
	);
}

/** Best agreement of two label sequences over relabelings of `ours` (negative labels kept as-is). */
function matchedAgreement(
	ours: Numeric,
	reference: Numeric
): { agreement: number; mapping: number[] } {
	const labels = Math.max(0, ...Array.from(ours), ...Array.from(reference)) + 1;
	let best = { agreement: -1, mapping: [] as number[] };

	for (const mapping of permutations(Array.from({ length: labels }, (_, index) => index))) {
		let same = 0;
		for (let index = 0; index < ours.length; index++) {
			const mapped = ours[index] >= 0 ? mapping[ours[index]] : ours[index];
			if (mapped === reference[index]) same++;
		}
		const agreement = same / Math.max(1, ours.length);
		if (agreement > best.agreement) best = { agreement, mapping };
	}

	return best;
}

function speakerDurations(turns: SpeakerTurn[]): Map<number, number> {
	const durations = new Map<number, number>();
	for (const turn of turns)
		durations.set(turn.speaker, (durations.get(turn.speaker) ?? 0) + turn.end - turn.start);
	return durations;
}

function describeTurns(label: string, turns: SpeakerTurn[]): void {
	const durations = [...speakerDurations(turns)].map(
		([speaker, seconds]) => `${speaker}:${seconds.toFixed(1)}s`
	);
	console.log(
		`${label}: ${new Set(turns.map((turn) => turn.speaker)).size} speakers, ${turns.length} turns [${durations.join(' ')}]`
	);
}

function compareTurns(label: string, ours: SpeakerTurn[], reference: SpeakerTurn[]): boolean {
	const oursSpeakers = new Set(ours.map((turn) => turn.speaker)).size;
	const referenceSpeakers = new Set(reference.map((turn) => turn.speaker)).size;
	const boundaryDiff =
		ours.length === reference.length
			? Math.max(
					0,
					...ours.map((turn, index) =>
						Math.max(
							Math.abs(turn.start - reference[index].start),
							Math.abs(turn.end - reference[index].end)
						)
					)
				)
			: Infinity;
	const pass = oursSpeakers === referenceSpeakers && boundaryDiff < 0.1;

	console.log(
		`${label}: speakers ${oursSpeakers} vs ${referenceSpeakers}, turns ${ours.length} vs ${reference.length}, max boundary diff ${boundaryDiff.toFixed(4)} s -> ${pass ? 'PASS' : 'FAIL'}`
	);
	return pass;
}

async function readReference(directory: string, name: string): Promise<NpyArray | undefined> {
	const path = join(directory, `${name}.npy`);
	if (!existsSync(path)) return undefined;
	return parseNpy(new Uint8Array(await readFile(path)));
}

async function readWaveform(path: string): Promise<Float32Array> {
	const bytes = await readFile(path);
	return new Float32Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	);
}

async function decode(audioPath: string, outputPath: string): Promise<void> {
	const samples = await decodeAudioFile(audioPath);
	await writeFile(
		outputPath,
		new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
	);
	console.log(
		`Wrote ${samples.length} samples (${(samples.length / 16_000).toFixed(2)} s) to ${outputPath}`
	);
}

async function selfCheck(): Promise<void> {
	const diarizer = await createCommunity1Diarizer();
	const fbankFrames = countFbankFrames(CHUNK_SAMPLES);
	const waveform = Float32Array.from(
		{ length: CHUNK_SAMPLES },
		(_, index) => 0.1 * Math.sin(index * 0.013) * Math.sin(index * 0.0007)
	);
	const fbank = new Float32Array(fbankFrames * MEL_BINS);
	computeFbank(waveform, fbank);

	const { features, channels, frames, embedding } = await runFrameFeatures(
		diarizer.embeddingModel,
		fbank,
		1
	);
	const pooled = new Float64Array(EMBEDDING_DIMENSION);
	poolEmbedding(
		diarizer.embeddingModel,
		features,
		channels,
		frames,
		new Float32Array(FRAMES_PER_CHUNK).fill(1),
		pooled
	);

	const similarity = cosine(pooled, embedding);
	console.log(
		`Weighted head vs graph embedding (all-ones mask): cosine ${similarity.toFixed(9)}, max abs diff ${maxAbsDiff(pooled, embedding).toExponential(2)}`
	);
	console.log(
		`PLDA phi: ${diarizer.plda.phi.length} values, largest ${diarizer.plda.phi[0].toFixed(4)}, smallest ${diarizer.plda.phi[diarizer.plda.phi.length - 1].toExponential(3)}`
	);

	if (similarity < 0.99999) process.exitCode = 1;
}

function printTimings(output: DiarizationOutput): void {
	const timings = output.intermediates?.timings ?? {};
	const summary = Object.entries(timings).map(
		([stage, milliseconds]) => `${stage} ${(milliseconds / 1000).toFixed(2)} s`
	);
	console.log(
		`Timings: ${summary.join(', ')}; peak RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`
	);
}

async function compare(waveformPath: string, referenceDir: string): Promise<void> {
	const samples = await readWaveform(waveformPath);
	const diarizer = await createCommunity1Diarizer();
	const output = await diarizer.diarize(samples, { capture: true });
	const intermediates = output.intermediates!;
	const checks: [string, boolean][] = [];

	const logits = await readReference(referenceDir, 'segmentation_logits');
	if (logits) {
		const diff = maxAbsDiff(intermediates.segmentationScores, logits.data);
		console.log(
			`Segmentation logits: shape ${logits.shape.join('x')}, max abs diff ${diff.toExponential(2)}`
		);
		checks.push(['segmentation logits', diff < 1e-3]);
	}

	const activity = await readReference(referenceDir, 'segmentation');
	if (activity) {
		let identical = 0;
		for (let index = 0; index < activity.data.length; index++) {
			if (intermediates.activity[index] === activity.data[index]) identical++;
		}
		const ratio = identical / activity.data.length;
		console.log(`Powerset activity: ${(ratio * 100).toFixed(4)} % identical`);
		checks.push(['checkpoint 1 (activity)', ratio >= 0.999]);
	}

	const count = await readReference(referenceDir, 'speaker_counting');
	if (count) {
		console.log(
			`Speaker count: max abs diff ${maxAbsDiff(intermediates.count, count.data)} over ${count.data.length} vs ${intermediates.count.length} frames`
		);
	}

	for (let chunk = 0; ; chunk++) {
		const reference = await readReference(referenceDir, `fbank_${chunk}`);
		if (!reference) break;
		const waveform = new Float32Array(CHUNK_SAMPLES);
		copyChunk(samples, chunk, waveform);
		const fbank = new Float32Array(countFbankFrames(CHUNK_SAMPLES) * MEL_BINS);
		computeFbank(waveform, fbank);
		const diff = maxAbsDiff(fbank, reference.data);
		console.log(`FBank chunk ${chunk}: max abs diff ${diff.toExponential(2)}`);
		checks.push([`fbank ${chunk}`, diff < 1e-3]);
	}

	const embeddings = await readReference(referenceDir, 'embeddings');
	if (embeddings) {
		let minimum = Infinity;
		for (let pair = 0; pair < embeddings.data.length / EMBEDDING_DIMENSION; pair++) {
			const range = [pair * EMBEDDING_DIMENSION, (pair + 1) * EMBEDDING_DIMENSION] as const;
			minimum = Math.min(
				minimum,
				cosine(intermediates.embeddings.subarray(...range), embeddings.data.subarray(...range))
			);
		}
		console.log(`Embeddings: min cosine ${minimum.toFixed(6)}`);
		checks.push(['checkpoint 2 (embeddings)', minimum > 0.9999]);
	}

	const { clustering } = intermediates;
	const pldaFeatures = await readReference(referenceDir, 'plda_features');
	if (pldaFeatures) {
		// Eigenvector signs are arbitrary per dimension, so compare magnitudes.
		const diff = maxAbsDiff(clustering.pldaFeatures.map(Math.abs), pldaFeatures.data.map(Math.abs));
		console.log(`PLDA features: max abs diff (up to sign) ${diff.toExponential(2)}`);
		checks.push(['plda features', diff < 1e-3]);
	}

	const ahc = await readReference(referenceDir, 'ahc_labels');
	if (ahc) {
		const { agreement } = matchedAgreement(clustering.ahcLabels, ahc.data);
		console.log(
			`AHC: ${Math.max(...clustering.ahcLabels) + 1} vs ${Math.max(...ahc.data) + 1} clusters, agreement ${(agreement * 100).toFixed(2)} %`
		);
		checks.push(['ahc', agreement === 1]);
	}

	const pi = await readReference(referenceDir, 'vbx_pi');
	if (pi) {
		const kept = (values: Numeric) => Array.from(values).filter((value) => value > 1e-7).length;
		console.log(
			`VBx: kept speakers ${kept(clustering.pi)} vs ${kept(pi.data)}; pi ${Array.from(clustering.pi, (value) => value.toFixed(4)).join(',')} vs ${Array.from(pi.data, (value) => value.toFixed(4)).join(',')}`
		);
		checks.push(['vbx kept speakers', kept(clustering.pi) === kept(pi.data)]);
	}

	const hard = await readReference(referenceDir, 'hard_clusters');
	if (hard) {
		// The reference is captured before silent local speakers are unassigned; their clusters are
		// arbitrary tie-breaks, so compare after applying the same inactive mask to both.
		const referenceHard = hard.data.map((cluster, pair) =>
			clustering.hardClusters[pair] === UNASSIGNED ? UNASSIGNED : cluster
		);
		const { agreement } = matchedAgreement(clustering.hardClusters, referenceHard);
		console.log(`Hard clusters: agreement ${(agreement * 100).toFixed(3)} %`);
		checks.push(['hard clusters', agreement >= 0.999]);
	}

	const turnsPath = join(referenceDir, 'turns.json');
	if (existsSync(turnsPath)) {
		const reference = JSON.parse(await readFile(turnsPath, 'utf8')) as {
			regular: SpeakerTurn[];
			exclusive: SpeakerTurn[];
		};
		const sorted = (turns: SpeakerTurn[]) =>
			[...turns].sort((left, right) => left.start - right.start || left.end - right.end);
		checks.push([
			'checkpoint 3 (regular turns)',
			compareTurns('Regular turns', sorted(output.turns), sorted(reference.regular))
		]);
		checks.push([
			'exclusive turns',
			compareTurns('Exclusive turns', sorted(output.exclusiveTurns), sorted(reference.exclusive))
		]);
	}

	describeTurns('Ours (regular)', output.turns);
	printTimings(output);

	const failed = checks.filter(([, pass]) => !pass).map(([name]) => name);
	console.log(failed.length ? `FAILED: ${failed.join(', ')}` : 'All parity checks passed.');
	if (failed.length) process.exitCode = 1;
}

async function run(audioPath: string): Promise<void> {
	const samples = await decodeAudioFile(audioPath);
	const diarizer = await createCommunity1Diarizer();
	const output = await diarizer.diarize(samples, { capture: true });
	describeTurns('Regular', output.turns);
	describeTurns('Exclusive', output.exclusiveTurns);
	printTimings(output);
}

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, (...values: string[]) => Promise<void>> = {
	decode,
	'self-check': selfCheck,
	compare,
	run
};

if (!commands[command]) {
	console.error(
		'Usage: parity.ts decode <audio> <out.f32> | self-check | compare <waveform.f32> <refDir> | run <audio>'
	);
	process.exit(2);
}

await commands[command](...args);
