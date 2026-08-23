/**
 * zNix board — SVG behavior card for a zNix manifest (typed, showcase copy).
 * Same renderer as the `dope` quickstart template's src/board.js; keep in sync.
 */

import type { ZNix, ZNixManifest } from './znix';

function esc(s: unknown): string {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const COMPOSITION_KINDS = ['agents', 'services', 'schedules', 'pipelines', 'interfaces', 'files'];

export interface BoardOptions {
	accent?: string;
	ok?: boolean;
	inbox?: number;
}

/** One-card render of a zNix manifest. Returns standalone SVG. */
export function boardCardSVG(znix: ZNix | ZNixManifest, opts: BoardOptions = {}): string {
	const z = (znix as ZNix).manifest || (znix as ZNixManifest);
	const W = 620;
	const H = 420;
	const accent = opts.accent || '#7c5cff';
	const ok = opts.ok ?? true;

	const kinds = COMPOSITION_KINDS.filter((k) => (z.composition?.[k] || []).length > 0);
	const out: string[] = [];

	// Header: slug + endpoint + bounded state
	out.push(`<text x="24" y="30" font-size="16" font-weight="700" fill="#fff">${esc(z.address?.slug || z.id || '')}</text>`);
	out.push(`<text x="24" y="48" font-size="10" fill="#8f8fb5" font-family="monospace">${esc(z.address?.endpoint || '')}</text>`);
	out.push(`<text x="${W - 24}" y="30" font-size="11" text-anchor="end" fill="${ok ? '#57ff3b' : '#ff6b6b'}" font-family="monospace">${ok ? 'BOUNDED' : 'INVALID'}</text>`);
	out.push(`<text x="${W - 24}" y="46" font-size="10" text-anchor="end" fill="#8f8fb5" font-family="monospace">${esc((z.modes || []).join(' · '))}</text>`);

	// Composition lanes
	let y = 84;
	for (const kind of kinds) {
		const items = (z.composition?.[kind] || []) as Record<string, unknown>[];
		if (!items.length) continue;
		out.push(`<text x="24" y="${y}" font-size="10" fill="#6f738f" font-family="monospace" text-transform="uppercase">${esc(kind)}</text>`);
		let ix = 150;
		for (const it of items) {
			const label = String(it.name || it.role || it);
			out.push(`<circle cx="${ix}" cy="${y + 6}" r="3.5" fill="${accent}"/>`);
			out.push(`<text x="${ix + 10}" y="${y + 9}" font-size="11" fill="#dfdce8" font-family="monospace">${esc(label)}</text>`);
			ix += label.length * 7 + 34;
		}
		y += 30;
	}

	// Pipeline route: squares + arrows
	const pipeline = ((z.composition?.pipelines || []) as Record<string, unknown>[])[0];
	if (pipeline && Array.isArray(pipeline.steps)) {
		const py = H - 92;
		out.push(`<text x="24" y="${py - 14}" font-size="10" fill="#8f8fb5" font-family="monospace">${esc(pipeline.name)}</text>`);
		const stepX = 80;
		(pipeline.steps as string[]).forEach((step, i) => {
			const x = stepX + i * 104;
			out.push(`<rect x="${x}" y="${py}" width="70" height="24" rx="6" fill="none" stroke="${accent}" stroke-width="1"/>`);
			out.push(`<text x="${x + 35}" y="${py + 16}" font-size="10" text-anchor="middle" fill="#e8e6f5" font-family="monospace">${esc(step)}</text>`);
			if (i < (pipeline.steps as string[]).length - 1) {
				out.push(`<line x1="${x + 70}" y1="${py + 12}" x2="${x + 90}" y2="${py + 12}" stroke="#57ff3b" stroke-width="1.2" marker-end="url(#a)"/>`);
			}
		});
	}

	// Toolset: bounded-verb chips
	const verbs = (z.toolset?.verbs || []) as string[];
	let vx = 74;
	const vy = H - 20;
	out.push(`<text x="24" y="${vy - 2}" font-size="10" fill="#8f8fb5" font-family="monospace">verbs</text>`);
	for (const v of verbs) {
		out.push(`<rect x="${vx}" y="${vy - 12}" width="${v.length * 6.6 + 14}" height="16" rx="8" fill="rgba(124,92,255,.16)" stroke="rgba(124,92,255,.5)" stroke-width=".6"/>`);
		out.push(`<text x="${vx + 7}" y="${vy}" font-size="9.5" fill="#b9b3f0" font-family="monospace">${esc(v)}</text>`);
		vx += v.length * 6.6 + 20;
	}

	// Inbox: the bounded edge
	const inbox = opts.inbox ?? 0;
	out.push(`<text x="${W - 24}" y="${H - 10}" font-size="10" text-anchor="end" fill="#fdcb6e" font-family="monospace">inbox ${inbox}</text>`);

	const defs = `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#57ff3b"/></marker></defs>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, monospace">${defs}${out.join('')}</svg>`;
}
