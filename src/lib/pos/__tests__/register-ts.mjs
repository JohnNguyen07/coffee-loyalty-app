import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('@/')) {
        const target = resolve(projectRoot, 'src', specifier.slice(2));
        if (existsSync(target + '.ts')) {
          return nextResolve(pathToFileURL(target + '.ts').href, context);
        }
      }
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
        const parentDir = dirname(fileURLToPath(context.parentURL));
        const candidate = resolve(parentDir, specifier + '.ts');
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
      throw err;
    }
  },
});

