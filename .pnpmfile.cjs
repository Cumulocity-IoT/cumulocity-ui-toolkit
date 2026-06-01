/**
 * pnpm hook to force @c8y/devkit's direct typescript dependency to 5.9.3
 * so that @angular-devkit/build-angular resolves the correct TypeScript peer,
 * avoiding the "Debug Failure" in @ngtools/webpack's ivy compiler.
 */
function readPackage(pkg) {
  if (pkg.name === '@c8y/devkit' && pkg.dependencies?.typescript) {
    pkg.dependencies.typescript = '5.9.3';
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
