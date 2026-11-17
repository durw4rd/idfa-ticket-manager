import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

// The rules `next lint` used (next/core-web-vitals), run by the ESLint CLI: `next lint` is
// deprecated and goes away in Next.js 16
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**'] },
  ...compat.extends('next/core-web-vitals'),
];

export default config;
