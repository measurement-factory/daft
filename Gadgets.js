/* Assorted small handy global functions. */

export function Must(condition) {
	if (!condition)
		throw new Error(`assertion failure: ${condition}`);
}
