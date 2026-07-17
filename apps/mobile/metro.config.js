const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch workspace packages
config.watchFolders = [workspaceRoot];

// Resolve modules from workspace root first, then app
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Map workspace package names to their source
config.resolver.extraNodeModules = {
  '@gayi/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
  '@gayi/domain': path.resolve(workspaceRoot, 'packages/domain/src'),
  '@gayi/providers': path.resolve(workspaceRoot, 'packages/providers/src'),
};

// Allow .js extensions to resolve .ts files (for domain package imports)
config.resolver.sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'cjs', 'mjs'];

module.exports = config;
