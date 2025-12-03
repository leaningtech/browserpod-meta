#!/usr/bin/env node

import { createProject } from './src/index.js';

createProject().catch((error) => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});