import fs from 'fs-extra';
import path from 'path';
import prompts from 'prompts';
import chalk from 'chalk';
import isBinaryPath from 'is-binary-path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY_URL = 'https://console.browserpod.io';

const PORTALS_NOTE = `To enable Portals, which let you share the page or service running inside your pod,
register at ${API_KEY_URL} and paste your API key after choosing a template.`;

const templates = [
  {
    value: 'vite-basic',
    title: 'Basic',
    description: 'Node.js REPL',
    usesPortals: false
  },
  {
    value: 'bash',
    title: 'Bash shell',
    description: 'Interactive Bash terminal',
    usesPortals: false
  },
  {
    value: 'vite-web',
    title: 'Web server',
    description: 'Express server with a live preview',
    usesPortals: true
  }
];

const templateValues = templates.map(t => t.value).join(', ');

function findTemplate(value) {
  return templates.find(t => t.value === value);
}

function templateLabel(template) {
  return `${template.title} - ${template.description}${template.usesPortals ? ' (uses Portals)' : ''}`;
}

const optionAliases = {
  '-t': 'template',
  '--template': 'template',
  '-k': 'apiKey',
  '--api-key': 'apiKey'
};

const booleanOptions = new Map([
  ['-h', 'help'],
  ['--help', 'help'],
  ['--non-interactive', 'nonInteractive']
]);

class PromptCancelledError extends Error {
  constructor() {
    super('Setup cancelled');
    this.name = 'PromptCancelledError';
  }
}

function printHelp() {
  const valueWidth = Math.max(...templates.map(t => t.value.length));
  const templateList = templates
    .map(t => `  ${t.value.padEnd(valueWidth)}   ${templateLabel(t)}`)
    .join('\n');

  console.log(`Create Browserpod Quickstart

Usage:
  create-browserpod-quickstart [project-name] [options]

Options:
  -t, --template <name>        Template to use (${templateValues})
  -k, --api-key <key>          BrowserPod API key to write to .env
      --non-interactive        Fail instead of prompting for missing required values
  -h, --help                   Show this help message

Templates:
${templateList}

The API key is optional. To enable Portals, which let you share the page
or service running inside your pod, register at ${API_KEY_URL}
and pass your key with --api-key, or add VITE_BP_APIKEY to .env later.

Examples:
  create-browserpod-quickstart my-app --template vite-basic
  create-browserpod-quickstart my-app --template vite-web --api-key bp_...
`);
}

function readOptionValue(argv, index, option) {
  const next = argv[index + 1];

  if (next === undefined || next.startsWith('-')) {
    throw new Error(`Missing value for ${option}`);
  }

  return next;
}

function parseArgs(argv) {
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    const option = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);

    if (booleanOptions.has(option)) {
      if (inlineValue !== undefined) {
        throw new Error(`${option} does not take a value`);
      }

      options[booleanOptions.get(option)] = true;
      continue;
    }

    const optionName = optionAliases[option];

    if (!optionName) {
      throw new Error(`Unknown option: ${option}`);
    }

    if (inlineValue !== undefined) {
      options[optionName] = inlineValue;
    } else {
      options[optionName] = readOptionValue(argv, i, option);
      i += 1;
    }
  }

  if (positional.length > 1) {
    throw new Error(`Unexpected arguments: ${positional.slice(1).join(' ')}`);
  }

  if (positional.length === 1) {
    options.projectName = positional[0];
  }

  return options;
}

async function validateProjectName(name) {
  if (!name || name.trim().length === 0) {
    return 'Project name is required';
  }

  if (!/^[a-z0-9-_]+$/i.test(name)) {
    return 'Project name can only contain letters, numbers, hyphens, and underscores';
  }

  if (fs.existsSync(name)) {
    return `Directory "${name}" already exists`;
  }

  return true;
}

function validateTemplateName(name) {
  if (!findTemplate(name)) {
    return `Unknown template "${name}". Available templates: ${templateValues}`;
  }

  return true;
}

// npm strips .gitignore files from published packages, so templates ship them as _gitignore
const renameFiles = {
  _gitignore: '.gitignore'
};

async function copyFilesAndDirectories(src, dest, projectName) {
  const items = await fs.readdir(src);

  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, renameFiles[item] ?? item);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      await fs.ensureDir(destPath);
      await copyFilesAndDirectories(srcPath, destPath, projectName);
    } else if (isBinaryPath(srcPath)) {
      await fs.copyFile(srcPath, destPath);
    } else {
      let content = await fs.readFile(srcPath, 'utf8');

      // Replace template variables
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);

      await fs.writeFile(destPath, content, 'utf8');
    }
  }
}

async function writeEnvFile(dest, apiKey) {
  const content = apiKey
    ? `VITE_BP_APIKEY=${apiKey}\n`
    : `# Add your API key to enable Portals (register at ${API_KEY_URL})\n# VITE_BP_APIKEY=your-key-here\n`;

  await fs.writeFile(path.join(dest, '.env'), content, 'utf8');
}

function normalizeApiKey(apiKey) {
  return apiKey?.trim() || undefined;
}

async function resolveProjectOptions(cliOptions) {
  if (cliOptions.template) {
    const templateValidation = validateTemplateName(cliOptions.template);

    if (templateValidation !== true) {
      throw new Error(templateValidation);
    }
  }

  if (cliOptions.projectName) {
    const projectValidation = await validateProjectName(cliOptions.projectName);

    if (projectValidation !== true) {
      throw new Error(projectValidation);
    }
  }

  const hasRequiredOptions = Boolean(cliOptions.template && cliOptions.projectName);

  if (cliOptions.nonInteractive && !hasRequiredOptions) {
    const missing = [
      !cliOptions.template ? 'template' : null,
      !cliOptions.projectName ? 'project name' : null
    ].filter(Boolean);

    throw new Error(`Missing required option${missing.length > 1 ? 's' : ''} for non-interactive mode: ${missing.join(', ')}`);
  }

  const shouldPromptForKey = cliOptions.apiKey === undefined;

  // The key is optional, so with everything else given only ask when a person can answer
  const canPromptForKey = !cliOptions.nonInteractive && Boolean(process.stdin.isTTY);

  if (hasRequiredOptions && !(canPromptForKey && shouldPromptForKey)) {
    return {
      template: cliOptions.template,
      projectName: cliOptions.projectName,
      apiKey: normalizeApiKey(cliOptions.apiKey)
    };
  }

  const questions = [];

  if (!cliOptions.template) {
    questions.push({
      type: 'select',
      name: 'template',
      message: 'Select a template:',
      choices: templates.map(t => ({
        title: templateLabel(t),
        value: t.value
      }))
    });
  }

  if (!cliOptions.projectName) {
    questions.push({
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      validate: validateProjectName
    });
  }

  if (shouldPromptForKey) {
    questions.push({
      type: 'password',
      name: 'apiKey',
      message: 'BrowserPod API key (optional, leave blank to skip):'
    });

    console.log(`${PORTALS_NOTE}\n`);
  }

  let promptCancelled = false;
  const response = await prompts(questions, {
    onCancel: () => {
      promptCancelled = true;
      return false;
    }
  });

  if (promptCancelled) {
    throw new PromptCancelledError();
  }

  return {
    template: cliOptions.template || response.template,
    projectName: cliOptions.projectName || response.projectName,
    apiKey: normalizeApiKey(cliOptions.apiKey ?? response.apiKey)
  };
}

function printKeyNotice(template, projectName, apiKey) {
  if (apiKey) {
    return;
  }

  if (template.usesPortals) {
    console.log(chalk.yellow.bold('This template previews its server through a Portal, which needs an API key.'));
    console.log(chalk.yellow(`To see the preview, add VITE_BP_APIKEY=<your key> to ${projectName}/.env`));
    console.log(chalk.yellow(`(register at ${API_KEY_URL}).\n`));
  } else {
    console.log(`To enable Portals, add VITE_BP_APIKEY=<your key> to ${projectName}/.env (register at ${API_KEY_URL}).\n`);
  }
}

async function createProject(argv = process.argv.slice(2)) {
  let cliOptions;

  try {
    cliOptions = parseArgs(argv);
  } catch (error) {
    console.error(chalk.red(error.message));
    printHelp();
    process.exit(1);
  }

  if (cliOptions.help) {
    printHelp();
    return;
  }

  console.log(chalk.blue.bold('🚀 Create Browserpod Quickstart\n'));

  let response;

  try {
    response = await resolveProjectOptions(cliOptions);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      console.log(chalk.red(error.message));
      process.exit(1);
    }

    console.error(chalk.red(error.message));
    printHelp();
    process.exit(1);
  }

  if (!response.template || !response.projectName) {
    console.log(chalk.red('Setup cancelled'));
    process.exit(1);
  }

  const { template, projectName, apiKey } = response;
  const templatePath = path.join(__dirname, '..', 'templates', template);
  const targetPath = path.resolve(projectName);

  console.log(chalk.blue(`\n📁 Creating project in ${targetPath}...`));

  try {
    await fs.ensureDir(targetPath);
    await copyFilesAndDirectories(templatePath, targetPath, projectName);
    await writeEnvFile(targetPath, apiKey);

    console.log(chalk.green.bold('✅ Project created successfully!\n'));
    printKeyNotice(findTemplate(template), projectName, apiKey);
    console.log(chalk.yellow('Next steps:'));
    console.log(`  cd ${projectName}`);
    console.log('  npm install');
    console.log('  npm run dev');
    console.log(chalk.gray('\nHappy coding! 🎉'));

  } catch (error) {
    console.error(chalk.red('Error creating project:'), error.message);
    process.exit(1);
  }
}

export { createProject };
