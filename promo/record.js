/* eslint-env node */

import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const FPS = 30;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PAGE_URL = new URL('index.html?capture', import.meta.url).href;

function run(args, stdin)
{
	return new Promise((resolve, reject) =>
	{
		let proc = spawn(FFMPEG, args, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'inherit'] });
		proc.on('error', reject);
		proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited with ' + code)));
		if (stdin)
			stdin(proc.stdin).catch(reject);
	});
}

let browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' });
let page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.goto(PAGE_URL);
await page.evaluate(() => globalThis.ready);
let duration = await page.evaluate(() => globalThis.DURATION);

// the page is stepped frame by frame, so the output is smooth regardless of how fast the machine renders
await run(['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
	'-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'rss-feed-promo.mp4'],
async (stdin) =>
{
	let frames = Math.round(duration * FPS);
	for (let i = 0; i < frames; i++)
	{
		await page.evaluate(t => globalThis.renderAt(t), i / FPS);
		if (!stdin.write(await page.screenshot({ type: 'png' })))
			await new Promise(r => stdin.once('drain', r));
	}
	stdin.end();
});

await browser.close();

await run(['-y', '-i', 'rss-feed-promo.mp4', '-vf',
	'fps=12,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
	'rss-feed-promo.gif']);
