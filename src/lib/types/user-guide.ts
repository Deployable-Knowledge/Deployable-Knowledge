export interface UserGuideChapter {
	id: string;
	title: string;
	description: string | null;
	content: string;
}

export interface UserGuideFirstRunResponse {
	open: boolean;
}
