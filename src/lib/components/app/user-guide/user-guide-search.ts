import type { UserGuideChapter } from '#lib/types';
import { renderMarkdown } from '#lib/utils/markdown';

export const USER_GUIDE_SEARCH_MIN_LENGTH = 2;

const MAX_RESULTS = 100;
const SNIPPET_LEAD = 24;
const SNIPPET_TAIL = 72;
const HEADINGS = 'h1, h2, h3, h4, h5, h6';

interface ChapterHeading {
	start: number;
	title: string;
}

export interface RenderedChapterText {
	headings: ChapterHeading[];
	text: string;
}

export interface UserGuideSearchResult {
	after: string;
	before: string;
	chapterIndex: number;
	heading: string | null;
	match: string;
	occurrence: number;
}

export interface UserGuideSearch {
	results: UserGuideSearchResult[];
	total: number;
}

interface TextMatch {
	end: number;
	start: number;
}

interface TextRun {
	node: Text;
	start: number;
}

function findMatches(text: string, term: string): TextMatch[] {
	const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
	return Array.from(text.matchAll(pattern), ({ 0: match, index }) => ({
		end: index + match.length,
		start: index
	}));
}

function textRuns(root: Element): TextRun[] {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const runs: TextRun[] = [];
	let start = 0;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node as Text;
		runs.push({ node: text, start });
		start += text.data.length;
	}
	return runs;
}

function snippetStart(text: string, matchStart: number): number {
	const lineStart = text.lastIndexOf('\n', matchStart - 1) + 1;
	const earliest = matchStart - SNIPPET_LEAD;
	if (earliest <= lineStart) return lineStart;
	const wordStart = text.indexOf(' ', earliest) + 1;
	return wordStart > 0 && wordStart <= matchStart ? wordStart : earliest;
}

export function renderedChapterText({ content }: UserGuideChapter): RenderedChapterText {
	const { body } = new DOMParser().parseFromString(renderMarkdown(content), 'text/html');
	const prefix = body.ownerDocument.createRange();
	prefix.setStart(body, 0);

	const headings = Array.from(body.querySelectorAll(HEADINGS), (heading) => {
		prefix.setEnd(heading, 0);
		return { start: prefix.toString().length, title: heading.textContent.trim() };
	});
	return { headings, text: body.textContent };
}

export function searchUserGuide(chapters: RenderedChapterText[], term: string): UserGuideSearch {
	const results: UserGuideSearchResult[] = [];
	let total = 0;

	for (const [chapterIndex, { headings, text }] of chapters.entries()) {
		const matches = findMatches(text, term);
		total += matches.length;

		for (const [occurrence, { end, start }] of matches.entries()) {
			if (results.length === MAX_RESULTS) break;
			results.push({
				after: text.slice(end, end + SNIPPET_TAIL).split('\n', 1)[0],
				before: text.slice(snippetStart(text, start), start),
				chapterIndex,
				heading: headings.findLast((heading) => heading.start <= start)?.title ?? null,
				match: text.slice(start, end),
				occurrence
			});
		}
	}
	return { results, total };
}

export function findTextRanges(root: Element, term: string): Range[] {
	const runs = textRuns(root);
	const text = runs.map(({ node }) => node.data).join('');
	let cursor = 0;
	const runAt = (offset: number): TextRun => {
		while (cursor + 1 < runs.length && runs[cursor + 1].start <= offset) cursor += 1;
		return runs[cursor];
	};

	return findMatches(text, term).map(({ end, start }) => {
		const range = root.ownerDocument.createRange();
		const first = runAt(start);
		range.setStart(first.node, start - first.start);
		const last = runAt(end - 1);
		range.setEnd(last.node, end - last.start);
		return range;
	});
}
