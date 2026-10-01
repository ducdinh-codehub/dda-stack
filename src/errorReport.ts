import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { formatCommandError, type PackageManager } from './packageManager.js';
import type { AnswerSet } from './prompts.js';
import { cliVersion } from './version.js';

/**
 * When something fails, write a local report and print a link to a pre-filled
 * GitHub "new issue" page. Nothing is sent anywhere — the user reviews the
 * issue in their browser and decides whether to submit it.
 *
 * For testing: DDA_FORCE_ERROR=1 throws a fake error right after the prompts,
 * and DDA_ISSUE_REPO=owner/repo points the link at a throwaway repo.
 */

const ISSUE_REPO = process.env.DDA_ISSUE_REPO || 'ducdinh-codehub/dda-stack';
const LOG_FILE = 'create-dda-stack-error.log';
// GitHub rejects issue URLs much past ~8KB; stay well under it.
const MAX_URL_LENGTH = 7000;
// Install errors put the real cause at the end of the output.
const MAX_LOG_LINES_IN_ISSUE = 40;

let answers: AnswerSet | undefined;
let logWritten = false;

/** Records the user's choices so a later failure can include them. */
export function setReportAnswers(value: AnswerSet) {
  answers = value;
}

export function throwIfForcedError() {
  if (process.env.DDA_FORCE_ERROR) {
    throw new Error('Forced error from DDA_FORCE_ERROR — testing the error report.');
  }
}

/** Replaces the home directory with ~ so reports don't leak the username. */
function redactHome(text: string): string {
  const home = os.homedir();
  return home ? text.split(home).join('~') : text;
}

/** The flags that would reproduce this run — the project name is left out. */
function formatOptions(a: AnswerSet): string {
  const flags = [`--stack ${a.framework}`, `--pm ${a.packageManager}`, `--state ${a.stateManagement}`];
  if (a.expoRouter) flags.push(`--router ${a.expoRouter}`);
  if (a.expoSdk) flags.push(`--expo-sdk ${a.expoSdk}`);
  if (a.framework === 'rn-cli' && a.reactNativeVersion) flags.push(`--rn ${a.reactNativeVersion}`);
  if (a.repackVersion) flags.push(`--repack ${a.repackVersion}`);
  if (a.useNativewind) flags.push('--nativewind');
  if (a.useReactotron) flags.push('--reactotron');
  return flags.join(' ');
}

async function packageManagerVersion(pm: PackageManager): Promise<string> {
  try {
    const { stdout } = await execa(pm, ['--version'], { timeout: 5000 });
    return `${pm} ${stdout.trim()}`;
  } catch {
    return `${pm} (version unknown)`;
  }
}

function errorDetails(err: unknown): string {
  // execa errors already carry their output; plain errors are more useful with a stack.
  if (err instanceof Error && err.stack && !('shortMessage' in err)) return err.stack;
  return formatCommandError(err);
}

function firstLine(text: string): string {
  return text.split('\n').find(line => line.trim())?.trim().slice(0, 120) ?? 'Unknown error';
}

function tail(text: string, lines: number): string {
  const all = text.split('\n');
  return all.length <= lines ? text : ['…', ...all.slice(-lines)].join('\n');
}

function buildIssueUrl(title: string, body: string): string {
  const make = (b: string) =>
    `https://github.com/${ISSUE_REPO}/issues/new?` + new URLSearchParams({ title, body: b, labels: 'bug' });
  let url = make(body);
  // Shrink from the middle of the body until it fits, keeping head (environment) and tail (cause).
  let keep = body.length;
  while (url.length > MAX_URL_LENGTH && keep > 200) {
    keep = Math.floor(keep * 0.8);
    const half = Math.floor(keep / 2);
    url = make(`${body.slice(0, half)}\n\n…(truncated — see ${LOG_FILE})…\n\n${body.slice(-half)}`);
  }
  return url;
}

/**
 * Whether the terminal turns OSC 8 escape codes into clickable text. Ones that
 * don't would show the label with nothing to click, so they get the raw URL.
 */
function supportsHyperlinks(): boolean {
  if (!process.stdout.isTTY || process.env.CI) return false;
  const { TERM_PROGRAM, VTE_VERSION } = process.env;
  if (['iTerm.app', 'vscode', 'WezTerm', 'ghostty', 'WarpTerminal', 'Hyper'].includes(TERM_PROGRAM ?? '')) {
    return true;
  }
  if (process.env.WT_SESSION || process.env.KITTY_WINDOW_ID || process.env.KONSOLE_VERSION) return true;
  return Number(VTE_VERSION) >= 5000; // GNOME Terminal, Tilix
}

/** Short clickable text where the terminal supports it, the full URL otherwise. */
function link(label: string, url: string): string {
  return supportsHyperlinks() ? `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007` : url;
}

/**
 * Writes the report file and prints the issue link. `stage` says what was
 * running, e.g. "install in my-app". Never throws — reporting must not hide
 * the original error.
 */
export async function reportError(err: unknown, stage: string) {
  try {
    const details = redactHome(errorDetails(err));
    const environment = [
      `- create-dda-stack: ${cliVersion}`,
      `- OS: ${process.platform} ${os.release()} (${process.arch})`,
      `- Node: ${process.version}`,
      ...(answers ? [`- Package manager: ${await packageManagerVersion(answers.packageManager)}`] : []),
    ].join('\n');
    const options = answers ? formatOptions(answers) : '(failed before options were chosen)';

    const logPath = path.resolve(process.cwd(), LOG_FILE);
    const log = [
      `create-dda-stack error report — ${new Date().toISOString()}`,
      `Stage: ${stage}`,
      '',
      'Environment',
      environment,
      '',
      `Options: ${options}`,
      '',
      'Error',
      details,
      '',
    ].join('\n');
    // Superapp installs two projects; keep both failures in one file.
    if (logWritten) fs.appendFileSync(logPath, `\n${'='.repeat(60)}\n\n${log}`);
    else fs.writeFileSync(logPath, log);
    logWritten = true;

    const title = `[bug] ${stage} failed: ${firstLine(details)}`;
    const body = [
      `**Stage:** ${stage}`,
      '',
      '**Environment**',
      environment,
      '',
      '**Options**',
      `\`${options}\``,
      '',
      '**Error**',
      '```',
      tail(details, MAX_LOG_LINES_IN_ISSUE),
      '```',
      '',
      `<!-- The full report is in ${LOG_FILE} — drag it here to attach it. -->`,
      '**What were you doing?**',
      '',
    ].join('\n');

    p.log.info(
      [
        `A report was saved to: ${pc.bold(path.relative(process.cwd(), logPath))}`,
        '',
        'Help us fix this — you can review the issue before submitting:',
        pc.cyan(pc.underline(link('Report this issue on GitHub', buildIssueUrl(title, body)))),
      ].join('\n'),
    );
  } catch {
    // Best effort only.
  }
}
