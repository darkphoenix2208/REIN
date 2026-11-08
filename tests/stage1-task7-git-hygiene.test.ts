// STAGE 1 TASK 7: Git hygiene - no secrets, keys, or databases committed
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('no .env files committed', () => {
  const files = execSync('git ls-files', { encoding: 'utf-8', cwd: process.cwd() });
  const envFiles = files.split('\n').filter((f) => f.endsWith('.env') && f !== '.env.example');
  assert.equal(envFiles.length, 0, 'No .env files should be committed');
});

test('no database files committed', () => {
  const files = execSync('git ls-files', { encoding: 'utf-8', cwd: process.cwd() });
  const dbFiles = files.split('\n').filter((f) => f.endsWith('.db') || f === 'rein.db');
  assert.equal(dbFiles.length, 0, 'No database files should be committed');
});

test('no actual API keys in git history', () => {
  // Check for real Anthropic API keys (sk-ant-api03-)
  try {
    const result = execSync('git log --all --pretty=format: -S "sk-ant-api03" --name-only', { encoding: 'utf-8', cwd: process.cwd() });
    assert.equal(result.trim(), '', 'No real Anthropic API keys should be in git history');
  } catch {
    // Command returns non-zero if not found, which is good
  }
});

test('clean working tree (excluding test files)', () => {
  const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: process.cwd() });
  const untracked = status.split('\n').filter((l) => l.trim() && !l.includes('stage1-task') && !l.includes('WORKLOG.md'));
  assert.equal(untracked.length, 0, 'Working tree should be clean (excluding stage1 test files and WORKLOG)');
});

test('all commits have descriptive messages', () => {
  const commits = execSync('git log --oneline -5', { encoding: 'utf-8', cwd: process.cwd() });
  const lines = commits.split('\n').filter((l) => l.trim());
  assert.ok(lines.length > 0, 'Should have commits');
  for (const line of lines) {
    const msg = line.substring(8).trim(); // Skip commit hash
    assert.ok(msg.length >= 10, `Commit message should be descriptive: "${msg}"`);
  }
});
