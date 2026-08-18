import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const outdir = join(__dirname, 'dist', 'webview');

const options = {
  entryPoints: [join(__dirname, 'webview', 'src', 'main.tsx')],
  bundle: true,
  outfile: join(outdir, 'bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
  loader: {
    '.png': 'file',
    '.svg': 'file',
  },
};

async function run() {
  mkdirSync(outdir, { recursive: true });

  const htmlSrc = join(__dirname, 'webview', 'index.html');
  if (existsSync(htmlSrc)) {
    copyFileSync(htmlSrc, join(outdir, 'index.html'));
  }
  const cssSrc = join(__dirname, 'webview', 'src', 'styles.css');
  if (existsSync(cssSrc)) {
    copyFileSync(cssSrc, join(outdir, 'styles.css'));
  }

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[neurocode] watching webview...');
  } else {
    await esbuild.build(options);
    console.log('[neurocode] webview bundle built');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
