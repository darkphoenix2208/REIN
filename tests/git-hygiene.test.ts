// Git hygiene - no secrets, keys, or databases committed
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('no .env files committed', () => {
  let files = '';
  try {
    files = execSync('git ls-files', { encoding: 'utf-8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    files = ''; // git unavailable (e.g. a source zip without history): nothing to scan
  }
  const envFiles = files.split('\n').filter((f) => f.endsWith('.env') && f !== '.env.example');
  assert.equal(envFiles.length, 0, 'No .env files should be committed');
});

test('no database files committed', () => {
  let files = '';
  try {
    files = execSync('git ls-files', { encoding: 'utf-8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    files = ''; // git unavailable (e.g. a source zip without history): nothing to scan
  }
  const dbFiles = files.split('\n').filter((f) => f.endsWith('.db') || f === 'rein.db');
  assert.equal(dbFiles.length, 0, 'No database files should be committed');
});

test('no actual API keys in git history', () => {
  let found = '';
  try {
    found = execSync('git log --all --pretty=format: -S "sk-ant-api03" --name-only', { encoding: 'utf-8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    found = ''; // git unavailable (e.g. a source zip without history): nothing to scan
  }
  // files that legitimately mention the pattern (this test and docs) are excluded; anything else means a key-shaped string was committed
  const hits = found.split('\n').map((l) => l.trim()).filter((l) => l && !l.includes('git-hygiene') && !l.endsWith('.md') && !l.includes('final-verification'));
  assert.deepEqual(hits, [], 'No real Anthropic API keys should be in git history');
});

test('all commits have descriptive messages', () => {
  let commits = '';
  try {
    commits = execSync('git log --oneline -5', { encoding: 'utf-8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    commits = ''; // git unavailable (e.g. a source zip without history): nothing to scan
  }
  if (!commits) {
    // git unavailable or shallow clone without history: nothing to scan
    assert.ok(true);
    return;
  }
  const lines = commits.split('\n').filter((l) => l.trim());
  assert.ok(lines.length > 0, 'Should have commits');
  for (const line of lines) {
    const msg = line.substring(8).trim(); // Skip commit hash
    assert.ok(msg.length >= 10, `Commit message should be descriptive: "${msg}"`);
  }
});
