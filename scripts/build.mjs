import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rawApiUrl = process.env.VITE_API_URL?.trim();

if (!rawApiUrl) {
  console.error(
    'VITE_API_URL is required for production builds. Configure it in Vercel before deploying.',
  );
  process.exit(1);
}

let apiUrl;
try {
  apiUrl = new URL(rawApiUrl);
} catch {
  console.error('VITE_API_URL must be a valid absolute URL.');
  process.exit(1);
}

if (apiUrl.protocol !== 'https:' && apiUrl.protocol !== 'http:') {
  console.error('VITE_API_URL must use http or https.');
  process.exit(1);
}

const normalizedApiUrl = apiUrl.toString().replace(/\/$/, '');
const viteEnv = JSON.stringify({
  VITE_API_URL: normalizedApiUrl,
});
const angularCli = fileURLToPath(
  new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [angularCli, 'build', '--define', `import.meta.env=${viteEnv}`, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: false,
  },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
