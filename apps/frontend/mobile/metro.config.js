const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { configureWorkspaceMetro } = require('../../../config/metro/workspace-tsconfig-aliases.cjs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');
const config = getDefaultConfig(projectRoot);

module.exports = configureWorkspaceMetro(config, { projectRoot, workspaceRoot });
