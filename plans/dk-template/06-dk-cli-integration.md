# dk-cli Integration: `dk init` Command

## Context
The `dk init` command is the primary interface for creating new product repos. It wraps dk-template — cloning, running init.sh, and guiding the developer through next steps. This plan describes the dk-cli side of the integration.

## Scope
- `dk init` command implementation in dk-cli
- Interactive prompts for product/team/services
- Template cloning and init.sh execution
- Post-init guidance and next steps
- Integration with `dk onboard` for the full checklist

## Dependencies
- dk-template populated with all files (Plans 01-05)
- dk-cli repo exists (data-kinetic/dk-cli)

## Implementation Steps

### Step 1: Implement `dk init` command

```typescript
// src/commands/init.ts
import { Command } from 'commander';
import inquirer from 'inquirer';
import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';

export const initCommand = new Command('init')
  .description('Scaffold a new product repo from dk-template')
  .option('--product <name>', 'Product name')
  .option('--team <name>', 'Team name')
  .option('--service <name...>', 'Service name(s)')
  .option('--dir <path>', 'Output directory (default: ./<product>)')
  .action(async (options) => {
    // 1. Interactive prompts for missing options
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'product',
        message: 'Product name (lowercase, hyphens ok):',
        when: !options.product,
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || 'Must be lowercase alphanumeric with hyphens',
      },
      {
        type: 'input',
        name: 'team',
        message: 'Team name:',
        when: !options.team,
      },
      {
        type: 'input',
        name: 'services',
        message: 'Service name(s) (comma-separated):',
        when: !options.service,
        filter: (v) => v.split(',').map((s) => s.trim()),
      },
    ]);

    const product = options.product || answers.product;
    const team = options.team || answers.team;
    const services = options.service || answers.services;
    const dir = options.dir || `./${product}`;

    // 2. Clone dk-template
    const spinner = ora('Cloning dk-template...').start();
    await execa('gh', ['repo', 'create', `data-kinetic/${product}`,
      '--template', 'data-kinetic/dk-template', '--public', '--clone', dir]);
    spinner.succeed('Repository created');

    // 3. Run init.sh
    spinner.start('Running init.sh...');
    const serviceArgs = services.flatMap((s) => ['--service', s]);
    await execa('./scripts/init.sh', ['--product', product, '--team', team, ...serviceArgs],
      { cwd: dir, stdio: 'inherit' });
    spinner.succeed('Scaffold complete');

    // 4. Initial commit
    await execa('git', ['add', '-A'], { cwd: dir });
    await execa('git', ['commit', '-m', `Initialize ${product} from dk-template`], { cwd: dir });

    // 5. Print next steps
    console.log(chalk.green('\n✓ Repository scaffolded successfully!\n'));
    console.log(chalk.bold('Next steps:'));
    console.log(`  1. cd ${dir}`);
    console.log(`  2. Review generated files`);
    console.log(`  3. Create Doppler project: ${product}-applications`);
    console.log(`  4. Create Slack channel: #${product}-alerts`);
    console.log(`  5. Submit dk-alchemy PR (see _dk-alchemy-pr/README.md)`);
    console.log(`  6. Run: dk onboard  (for full checklist)\n`);
  });
```

### Step 2: Register command in CLI entry point

Add to `src/index.ts`:
```typescript
import { initCommand } from './commands/init';
program.addCommand(initCommand);
```

### Step 3: Add to dk-cli package.json dependencies

Ensure these are in dependencies:
- `inquirer` (interactive prompts)
- `execa` (shell execution)
- `chalk` (terminal colors)
- `ora` (spinners)

## dk-cli Files Created/Modified
- CREATE: `src/commands/init.ts`
- MODIFY: `src/index.ts` (register command)

## Verification
- `dk init --product test-app --team test-team --service api` creates a complete repo
- Interactive mode (no flags) prompts for all required inputs
- Generated repo has no remaining {{placeholders}}
- `_dk-alchemy-pr/` directory contains valid bootstrap files
- `dk onboard` can be run after `dk init` to continue the checklist
