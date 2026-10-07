export interface Matrix {
	rows: number;
	cols: number;
	data: Float64Array;
}

export function matrix(
	rows: number,
	cols: number,
	data: Float64Array = new Float64Array(rows * cols)
): Matrix {
	if (data.length !== rows * cols) {
		throw new Error(`Matrix data has ${data.length} values; expected ${rows}x${cols}.`);
	}
	return { rows, cols, data };
}

export function transpose(a: Matrix): Matrix {
	const out = matrix(a.cols, a.rows);
	for (let i = 0; i < a.rows; i++) {
		for (let j = 0; j < a.cols; j++) out.data[j * a.rows + i] = a.data[i * a.cols + j];
	}
	return out;
}

export function multiply(a: Matrix, b: Matrix): Matrix {
	if (a.cols !== b.rows)
		throw new Error(`Cannot multiply ${a.rows}x${a.cols} by ${b.rows}x${b.cols}.`);

	const out = matrix(a.rows, b.cols);
	for (let i = 0; i < a.rows; i++) {
		for (let k = 0; k < a.cols; k++) {
			const scale = a.data[i * a.cols + k];
			if (scale === 0) continue;
			for (let j = 0; j < b.cols; j++) out.data[i * b.cols + j] += scale * b.data[k * b.cols + j];
		}
	}
	return out;
}

export function invert(a: Matrix): Matrix {
	const n = a.rows;
	if (n !== a.cols) throw new Error('Only square matrices can be inverted.');

	const work = Float64Array.from(a.data);
	const inverse = matrix(n, n);
	for (let i = 0; i < n; i++) inverse.data[i * n + i] = 1;

	for (let column = 0; column < n; column++) {
		let pivot = column;
		for (let row = column + 1; row < n; row++) {
			if (Math.abs(work[row * n + column]) > Math.abs(work[pivot * n + column])) pivot = row;
		}
		if (work[pivot * n + column] === 0) throw new Error('Matrix is singular.');

		if (pivot !== column) {
			for (let j = 0; j < n; j++) {
				[work[column * n + j], work[pivot * n + j]] = [work[pivot * n + j], work[column * n + j]];
				[inverse.data[column * n + j], inverse.data[pivot * n + j]] = [
					inverse.data[pivot * n + j],
					inverse.data[column * n + j]
				];
			}
		}

		const scale = 1 / work[column * n + column];
		for (let j = 0; j < n; j++) {
			work[column * n + j] *= scale;
			inverse.data[column * n + j] *= scale;
		}

		for (let row = 0; row < n; row++) {
			const factor = work[row * n + column];
			if (row === column || factor === 0) continue;
			for (let j = 0; j < n; j++) {
				work[row * n + j] -= factor * work[column * n + j];
				inverse.data[row * n + j] -= factor * inverse.data[column * n + j];
			}
		}
	}

	return inverse;
}

export function cholesky(a: Matrix): Matrix {
	const n = a.rows;
	const lower = matrix(n, n);

	for (let i = 0; i < n; i++) {
		for (let j = 0; j <= i; j++) {
			let sum = a.data[i * n + j];
			for (let k = 0; k < j; k++) sum -= lower.data[i * n + k] * lower.data[j * n + k];

			if (i === j) {
				if (sum <= 0) throw new Error('Matrix is not positive definite.');
				lower.data[i * n + i] = Math.sqrt(sum);
			} else {
				lower.data[i * n + j] = sum / lower.data[j * n + j];
			}
		}
	}

	return lower;
}

export function symmetricEigen(a: Matrix): { values: Float64Array; vectors: Matrix } {
	const n = a.rows;
	const work = Float64Array.from(a.data);
	const vectors = matrix(n, n);
	for (let i = 0; i < n; i++) vectors.data[i * n + i] = 1;

	for (let sweep = 0; sweep < 100; sweep++) {
		let offDiagonal = 0;
		let diagonal = 0;
		for (let i = 0; i < n; i++) {
			diagonal += work[i * n + i] ** 2;
			for (let j = i + 1; j < n; j++) offDiagonal += work[i * n + j] ** 2;
		}
		if (offDiagonal <= 1e-30 * diagonal) break;

		for (let p = 0; p < n - 1; p++) {
			for (let q = p + 1; q < n; q++) {
				const apq = work[p * n + q];
				if (apq === 0) continue;

				const theta = (work[q * n + q] - work[p * n + p]) / (2 * apq);
				const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
				const c = 1 / Math.sqrt(t * t + 1);
				const s = t * c;

				for (let k = 0; k < n; k++) {
					const akp = work[k * n + p];
					const akq = work[k * n + q];
					work[k * n + p] = c * akp - s * akq;
					work[k * n + q] = s * akp + c * akq;
				}
				for (let k = 0; k < n; k++) {
					const apk = work[p * n + k];
					const aqk = work[q * n + k];
					work[p * n + k] = c * apk - s * aqk;
					work[q * n + k] = s * apk + c * aqk;
				}
				for (let k = 0; k < n; k++) {
					const vkp = vectors.data[k * n + p];
					const vkq = vectors.data[k * n + q];
					vectors.data[k * n + p] = c * vkp - s * vkq;
					vectors.data[k * n + q] = s * vkp + c * vkq;
				}
			}
		}
	}

	const values = new Float64Array(n);
	for (let i = 0; i < n; i++) values[i] = work[i * n + i];
	return { values, vectors };
}
