import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ref = execFileSync('git', ['stash', 'create'], { encoding: 'utf8' }).trim() || 'HEAD';

// native realpath expands 8.3 short paths; shexli aborts unless the scan root is long form
const dir = mkdtempSync(join(realpathSync.native(tmpdir()), 'shexli-'));
const src = join(dir, 'src');
const tar = join(dir, 'extension.tar');

try
{
	mkdirSync(src);
	execFileSync('git', ['archive', ref, '--format=tar', '-o', tar], { stdio: 'inherit' });
	execFileSync('tar', ['--force-local', '-xf', tar, '-C', src], { stdio: 'inherit' });
	execFileSync('shexli', [src], { stdio: 'inherit' });
}
finally
{
	rmSync(dir, { recursive: true, force: true });
}
