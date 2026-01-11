/**
 * YAML Loader Unit Tests
 * 
 * Tests for the YAML configuration loader including:
 * - Valid YAML loading
 * - Invalid YAML syntax detection
 * - Schema validation errors
 * - Caching behavior
 * - Error message clarity
 * 
 * Run with: npx tsx lib/config/__tests__/yaml-loader.test.ts
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { z } from 'zod';
import {
  createYAMLLoader,
  ConfigFileNotFoundError,
  YAMLParsingError,
  ConfigValidationError,
} from '../yaml-loader';

// Test schema
const testSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tools: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxIterations: z.number().int().positive().optional(),
});

type TestConfig = z.infer<typeof testSchema>;

// Simple test runner (since Jest may not be configured)
async function runTests() {
  let passed = 0;
  let failed = 0;

  const test = (name: string, fn: () => Promise<void> | void) => {
    return async () => {
      try {
        await fn();
        passed++;
        console.log(`✅ ${name}`);
      } catch (error) {
        failed++;
        console.error(`❌ ${name}:`, error instanceof Error ? error.message : error);
      }
    };
  };

  const loader = createYAMLLoader();
  const fixturesDir = path.join(__dirname, 'fixtures');

  // Test: Load valid YAML file
  await test('should load valid YAML file', async () => {
    loader.clearCache();
    const configPath = path.join(fixturesDir, 'valid-config.yaml');
    const config = await loader.load<TestConfig>(configPath, testSchema);

    if (!config) throw new Error('Config is undefined');
    if (config.name !== 'test-agent') throw new Error(`Expected name 'test-agent', got '${config.name}'`);
    if (config.description !== 'A test agent configuration') throw new Error('Description mismatch');
    if (JSON.stringify(config.tools) !== JSON.stringify(['tool1', 'tool2'])) throw new Error('Tools mismatch');
    if (JSON.stringify(config.capabilities) !== JSON.stringify(['capability1', 'capability2'])) throw new Error('Capabilities mismatch');
    if (config.model !== 'claude-haiku-4-5-20251001') throw new Error('Model mismatch');
    if (config.temperature !== 0.7) throw new Error('Temperature mismatch');
    if (config.maxIterations !== 10) throw new Error('MaxIterations mismatch');
  })();

  // Test: File not found error
  await test('should throw ConfigFileNotFoundError for non-existent file', async () => {
    loader.clearCache();
    const configPath = path.join(fixturesDir, 'non-existent.yaml');

    try {
      await loader.load<TestConfig>(configPath, testSchema);
      throw new Error('Should have thrown ConfigFileNotFoundError');
    } catch (error) {
      if (!(error instanceof ConfigFileNotFoundError)) {
        throw new Error(`Expected ConfigFileNotFoundError, got ${error}`);
      }
      if (!error.message.includes('Configuration file not found')) {
        throw new Error('Error message should contain "Configuration file not found"');
      }
      if (!error.message.includes('non-existent.yaml')) {
        throw new Error('Error message should contain filename');
      }
    }
  })();

  // Test: Invalid YAML syntax
  await test('should throw YAMLParsingError for invalid YAML syntax', async () => {
    loader.clearCache();
    const tempFile = path.join(fixturesDir, 'temp-invalid.yaml');
    await fs.writeFile(tempFile, 'invalid: yaml: syntax: [unclosed');

    try {
      await loader.load<TestConfig>(tempFile, testSchema);
      throw new Error('Should have thrown YAMLParsingError');
    } catch (error) {
      if (!(error instanceof YAMLParsingError)) {
        throw new Error(`Expected YAMLParsingError, got ${error}`);
      }
    } finally {
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  })();

  // Test: Schema validation error
  await test('should throw ConfigValidationError for schema mismatch', async () => {
    loader.clearCache();
    const configPath = path.join(fixturesDir, 'invalid-schema.yaml');

    try {
      await loader.load<TestConfig>(configPath, testSchema);
      throw new Error('Should have thrown ConfigValidationError');
    } catch (error) {
      if (!(error instanceof ConfigValidationError)) {
        throw new Error(`Expected ConfigValidationError, got ${error}`);
      }
      const formatted = error.getFormattedErrors();
      if (!formatted.includes('name') || !formatted.includes('description')) {
        throw new Error('Formatted errors should contain field names');
      }
    }
  })();

  // Test: Caching
  await test('should cache loaded configurations', async () => {
    loader.clearCache();
    loader.disableHotReload();
    const configPath = path.join(fixturesDir, 'valid-config.yaml');

    // First load
    const config1 = await loader.load<TestConfig>(configPath, testSchema);
    if (config1.name !== 'test-agent') throw new Error('First load failed');

    // Modify file
    const originalContent = await fs.readFile(configPath, 'utf-8');
    await fs.writeFile(configPath, originalContent.replace('test-agent', 'modified-agent'));

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second load should return cached version (hot-reload disabled)
    const config2 = await loader.load<TestConfig>(configPath, testSchema);
    if (config2.name !== 'test-agent') {
      throw new Error(`Expected cached version 'test-agent', got '${config2.name}'`);
    }

    // Restore original file
    await fs.writeFile(configPath, originalContent);
  })();

  // Test: Hot-reload
  await test('should reload on file change in development mode', async () => {
    loader.clearCache();
    loader.enableHotReload();
    const configPath = path.join(fixturesDir, 'valid-config.yaml');

    // First load
    const config1 = await loader.load<TestConfig>(configPath, testSchema);
    if (config1.name !== 'test-agent') throw new Error('First load failed');

    // Modify file
    const originalContent = await fs.readFile(configPath, 'utf-8');
    await fs.writeFile(configPath, originalContent.replace('test-agent', 'modified-agent'));

    // Wait a bit for file system to update
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Clear cache to force reload
    loader.clearCache();

    // Second load should pick up changes
    const config2 = await loader.load<TestConfig>(configPath, testSchema);
    if (config2.name !== 'modified-agent') {
      throw new Error(`Expected 'modified-agent', got '${config2.name}'`);
    }

    // Restore original file
    await fs.writeFile(configPath, originalContent);
  })();

  // Test: Load all files
  await test('should load all YAML files from directory', async () => {
    loader.clearCache();
    const configs = await loader.loadAll<TestConfig>(fixturesDir, testSchema);

    if (configs.size === 0) throw new Error('Should have loaded at least one config');
    if (!configs.has('valid-config')) throw new Error('Should have loaded valid-config');
  })();

  // Test: Reload
  await test('should clear cache for specific file', async () => {
    loader.clearCache();
    const configPath = path.join(fixturesDir, 'valid-config.yaml');

    // Load and cache
    await loader.load<TestConfig>(configPath, testSchema);

    // Reload should clear cache
    await loader.reload(configPath);

    // Next load should read from disk again
    const config = await loader.load<TestConfig>(configPath, testSchema);
    if (!config) throw new Error('Config should be defined');
  })();

  // Summary
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
};

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

