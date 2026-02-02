#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parseSVG } from './parser.js';
import { compareSVGs } from './diff.js';
import type { Change } from './types.js';

program
  .name('dg')
  .description('Design Guardian CLI - Semantic Vector Versioning for SVG')
  .version('1.0.0');

program
  .command('compare <file1> <file2>')
  .description('Compare two SVG files and detect geometric changes')
  .option('-j, --json', 'Output as JSON')
  .option('-q, --quiet', 'Only show summary')
  .action(async (file1: string, file2: string, options: { json?: boolean; quiet?: boolean }) => {
    // Validate files exist
    if (!existsSync(file1)) {
      console.error(chalk.red(`Error: File not found: ${file1}`));
      process.exit(1);
    }
    if (!existsSync(file2)) {
      console.error(chalk.red(`Error: File not found: ${file2}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing SVG files...').start();

    try {
      const [svg1, svg2] = await Promise.all([
        readFile(file1, 'utf-8'),
        readFile(file2, 'utf-8'),
      ]);

      const [parsed1, parsed2] = await Promise.all([
        parseSVG(svg1),
        parseSVG(svg2),
      ]);

      const result = compareSVGs(parsed1, parsed2);

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Header
      console.log();
      console.log(chalk.bold('Design Guardian') + chalk.gray(' — Comparison Report'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log();

      // Files
      console.log(chalk.gray('V1:'), chalk.cyan(file1));
      console.log(chalk.gray('V2:'), chalk.cyan(file2));
      console.log();

      // Summary
      if (result.total_changes === 0) {
        console.log(chalk.green('✓ No changes detected. Files are identical.'));
      } else {
        console.log(chalk.yellow(`⚠ ${result.summary}`));
      }

      // Details
      if (!options.quiet && result.changes.length > 0) {
        console.log();
        console.log(chalk.bold('Changes:'));
        console.log();

        for (const change of result.changes) {
          printChange(change);
        }
      }

      console.log();
      process.exit(result.total_changes > 0 ? 1 : 0);
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('info <file>')
  .description('Show information about an SVG file')
  .action(async (file: string) => {
    if (!existsSync(file)) {
      console.error(chalk.red(`Error: File not found: ${file}`));
      process.exit(1);
    }

    try {
      const svg = await readFile(file, 'utf-8');
      const parsed = await parseSVG(svg);

      console.log();
      console.log(chalk.bold('SVG Info:'), chalk.cyan(file));
      console.log(chalk.gray('─'.repeat(40)));
      console.log();

      if (parsed.metadata.width || parsed.metadata.height) {
        console.log(chalk.gray('Size:'), `${parsed.metadata.width || '?'} × ${parsed.metadata.height || '?'}`);
      }

      console.log(chalk.gray('Elements:'), parsed.elements.length);
      console.log();

      const types = parsed.elements.reduce((acc, el) => {
        acc[el.type] = (acc[el.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [type, count] of Object.entries(types)) {
        console.log(`  ${chalk.gray('•')} ${type}: ${count}`);
      }

      console.log();
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

function printChange(change: Change): void {
  const severityColors = {
    minor: chalk.blue,
    moderate: chalk.yellow,
    major: chalk.red,
  };

  const typeLabels: Record<string, string> = {
    added: '+ Added',
    removed: '- Removed',
    geometry_modified: '~ Geometry',
    attribute_changed: '~ Attribute',
  };

  const color = severityColors[change.severity];
  const label = typeLabels[change.type] || change.type;

  let detail = '';
  if (change.type === 'geometry_modified' && change.details.distance) {
    detail = chalk.gray(` (${change.details.distance}px)`);
  } else if (change.type === 'attribute_changed' && change.details.property) {
    detail = chalk.gray(` ${change.details.property}: ${change.details.old} → ${change.details.new}`);
  }

  console.log(`  ${color('●')} ${chalk.bold(change.element_id)} ${chalk.gray(label)}${detail}`);
}

program.parse();
