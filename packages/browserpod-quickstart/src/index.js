import fs from 'fs-extra';
import path from 'path';
import prompts from 'prompts';
import chalk from 'chalk';
import isBinaryPath from 'is-binary-path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templates = [
  {
    name: 'vite-basic',
    display: 'Basic',
    description: 'A simple project running a basic script'
  },
  {
    name: 'vite-web',
    display: 'Web Server',
    description: 'A simple project running a web server'
  },
  {
    name: 'bash',
    display: 'Bash shell',
    description: 'An interactive Bash shell'
  }
];

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
  console.log(`Create Browserpod Quickstart

Usage:
  create-browserpod-quickstart [project-name] [options]

Options:
  -t, --template <name>        Template to use (${templates.map(t => t.name).join(', ')})
  -k, --api-key <key>          BrowserPod API key to write to .env
      --non-interactive        Fail instead of prompting for missing required values
  -h, --help                   Show this help message

Examples:
  create-browserpod-quickstart my-app --template vite-web
  create-browserpod-quickstart my-app --template bash --api-key bp_...
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
  if (!templates.some(template => template.name === name)) {
    return `Unknown template "${name}". Available templates: ${templates.map(t => t.name).join(', ')}`;
  }

  return true;
}

async function copyFilesAndDirectories(src, dest, projectName, apiKey) {
  const items = await fs.readdir(src);

  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      await fs.ensureDir(destPath);
      await copyFilesAndDirectories(srcPath, destPath, projectName, apiKey);
    } else if (isBinaryPath(srcPath)) {
      await fs.copyFile(srcPath, destPath);
    } else {
      let content = await fs.readFile(srcPath, 'utf8');

      // Replace template variables
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      content = content.replace(/\{\{API_KEY\}\}/g, apiKey || '');

      await fs.writeFile(destPath, content, 'utf8');
    }
  }
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

  if (hasRequiredOptions) {
    return {
      template: cliOptions.template,
      projectName: cliOptions.projectName,
      apiKey: cliOptions.apiKey || ''
    };
  }

  const questions = [];

  if (!cliOptions.template) {
    questions.push({
      type: 'select',
      name: 'template',
      message: 'Select a template:',
      choices: templates.map(t => ({
        title: `${t.display} - ${t.description}`,
        value: t.name
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

  if (cliOptions.apiKey === undefined) {
    questions.push({
      type: 'password',
      name: 'apiKey',
      message: 'BrowserPod API key (leave blank to add it later in .env, get one at https://console.browserpod.io):'
    });
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
    apiKey: cliOptions.apiKey !== undefined ? cliOptions.apiKey : response.apiKey
  };
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
    await copyFilesAndDirectories(templatePath, targetPath, projectName, apiKey);

    console.log(chalk.green.bold('✅ Project created successfully!\n'));
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
