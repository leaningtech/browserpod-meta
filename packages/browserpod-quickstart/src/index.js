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
  }
];

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

async function createProject() {
  console.log(chalk.blue.bold('🚀 Create Browserpod Quickstart\n'));

  const response = await prompts([
    {
      type: 'select',
      name: 'template',
      message: 'Select a template:',
      choices: templates.map(t => ({
        title: `${t.display} - ${t.description}`,
        value: t.name
      }))
    },
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      validate: validateProjectName
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Browserpod API key (optional):',
      hint: 'You can add this later in the .env file'
    }
  ]);

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
