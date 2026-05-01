import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = (await import('../package.json', { with: { type: 'json' } })).default;

for (const [subpath, target] of Object.entries(packageJson.exports)) {
  const conditions = typeof target === 'string' ? { default: target } : target;

  for (const condition of ['types', 'default']) {
    const relativePath = conditions[condition];
    if (!relativePath) continue;

    const absolutePath = resolve(packageRoot, relativePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`${subpath} ${condition} export points to missing file: ${relativePath}`);
    }
  }

  if (conditions.default) {
    await import(resolve(packageRoot, conditions.default));
  }
}
