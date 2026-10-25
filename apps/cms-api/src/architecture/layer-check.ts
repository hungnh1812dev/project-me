import { basename, dirname, relative, resolve, sep } from 'node:path';

import {
  listSourceFiles,
  resolveImports,
  textMatches,
  type ResolvedImport,
  type SourceFile,
} from './import-graph';
import {
  INFRASTRUCTURE_FOLDER,
  KNOWN_LAYER_VIOLATIONS,
  LAYER_EXCEPTIONS,
  LAYER_EXEMPT_ROOTS,
  LAYER_RULES,
  PLATFORM_PORT_SUFFIX,
  PLATFORM_ROLE_FOLDERS,
  type KnownLayerViolation,
  type LayerRule,
  type PlatformRole,
} from './layer-rules.constants';
import { layerOfFile, moduleFolderOf, nodeOfFile } from './module-graph';

const FACADE_FILE = 'index.ts';

export interface LayerViolation {
  /** Path relative to `src/`. */
  file: string;
  rule: string;
  /** The package, path or text pattern the violation names. */
  to?: string;
}

interface CheckedFile {
  srcRoot: string;
  source: SourceFile;
  moduleName: string;
  rule: LayerRule;
  migratedModules: readonly string[];
}

const startsWithFolder = (file: string, folder: string) =>
  file === folder ||
  file.startsWith(folder.endsWith(sep) ? folder : folder + sep);

/** The role of a platform file, or `null` when no folder in the table covers it. */
export function platformRoleOfFile(file: string): PlatformRole | null {
  if (
    startsWithFolder(file, INFRASTRUCTURE_FOLDER) &&
    file.endsWith(PLATFORM_PORT_SUFFIX)
  ) {
    return 'port';
  }
  const longestMatch = PLATFORM_ROLE_FOLDERS.filter(({ prefix }) =>
    startsWithFolder(file, prefix),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return longestMatch?.role ?? null;
}

function packageViolations(
  { rule, source }: CheckedFile,
  statement: ResolvedImport,
): LayerViolation[] {
  const { specifier, importedNames } = statement;
  const violation = (name: string): LayerViolation[] => [
    { file: source.file, rule: name, to: specifier },
  ];
  const isBanned = rule.bannedPackages.some((banned) => banned.test(specifier));
  if (isBanned) {
    const allowedNames = rule.allowedNamedImports[specifier];
    const isLimitedToAllowedNames =
      allowedNames !== undefined &&
      importedNames !== 'all' &&
      importedNames.every((name) => allowedNames.includes(name));
    return isLimitedToAllowedNames ? [] : violation('banned-package');
  }
  const allowedNames = rule.allowedPackageNames[specifier];
  const isAllowed =
    rule.allowedPackages === null ||
    rule.allowedPackages.some(
      (allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`),
    ) ||
    (allowedNames !== undefined &&
      importedNames !== 'all' &&
      importedNames.every((name) => allowedNames.includes(name)));
  return isAllowed ? [] : violation('package-not-allowed');
}

function targetViolation(
  checked: CheckedFile,
  target: string,
): LayerViolation | null {
  const { rule, source, moduleName, migratedModules } = checked;
  const violation = (name: string) => ({
    file: source.file,
    rule: name,
    to: target,
  });
  const targetModule = moduleFolderOf(target);
  if (targetModule === moduleName) {
    return rule.mayImportOwnLayers.some(
      (layer) => layer === layerOfFile(target),
    )
      ? null
      : violation('own-layer');
  }
  if (targetModule !== null) {
    // A module that has not moved yet has no layers to judge.
    const isJudged = migratedModules.includes(targetModule);
    return !isJudged ||
      rule.mayImportOtherModuleLayers.includes(layerOfFile(target))
      ? null
      : violation('other-module-layer');
  }
  if (nodeOfFile(target) !== 'platform') return violation('unknown-target');
  const role = platformRoleOfFile(target);
  return role !== null && rule.mayImportPlatform.includes(role)
    ? null
    : violation('platform-role');
}

function moduleImportViolations(
  checked: CheckedFile,
  statement: ResolvedImport,
  targets: string[],
): LayerViolation[] {
  const { rule, source, moduleName } = checked;
  const otherModuleTargets = targets.filter((target) => {
    const targetModule = moduleFolderOf(target);
    return targetModule !== null && targetModule !== moduleName;
  });
  const [specifierTarget = ''] = targets;
  const isDeepImport =
    otherModuleTargets.includes(specifierTarget) &&
    basename(specifierTarget) !== FACADE_FILE;
  const isValueOutsideAllowance =
    otherModuleTargets.length > 0 &&
    rule.otherModuleValueImports !== 'any' &&
    !statement.isTypeOnly &&
    (statement.importedNames === 'all' ||
      statement.importedNames.some(
        (name) =>
          !(rule.otherModuleValueImports as readonly string[]).includes(name),
      ));
  return [
    ...(isDeepImport
      ? [{ file: source.file, rule: 'deep-import', to: specifierTarget }]
      : []),
    ...(isValueOutsideAllowance
      ? [
          {
            file: source.file,
            rule: 'cross-module-value',
            to: statement.specifier,
          },
        ]
      : []),
    ...targets.flatMap((target) => targetViolation(checked, target) ?? []),
  ];
}

function importViolations(checked: CheckedFile): LayerViolation[] {
  const { srcRoot, source } = checked;
  return resolveImports(source.absolutePath).flatMap((statement) => {
    if (!statement.specifier.startsWith('.')) {
      return packageViolations(checked, statement);
    }
    // An unresolved relative path is judged by where it points: fail closed.
    const targets =
      statement.targets.length > 0
        ? statement.targets.map((target) => relative(srcRoot, target))
        : [
            relative(
              srcRoot,
              resolve(dirname(source.absolutePath), statement.specifier),
            ),
          ];
    return moduleImportViolations(checked, statement, targets);
  });
}

function textViolations({ rule, source }: CheckedFile): LayerViolation[] {
  return rule.bannedText
    .filter(({ pattern }) => textMatches(source.absolutePath, pattern))
    .map(({ label }) => ({
      file: source.file,
      rule: 'banned-text',
      to: label,
    }));
}

const isNamedException = ({ file, to }: LayerViolation) =>
  LAYER_EXCEPTIONS.some(
    (exception) =>
      startsWithFolder(file, exception.from) && exception.importing === to,
  );

function violationsOfFile(
  srcRoot: string,
  source: SourceFile,
  moduleName: string,
  migratedModules: readonly string[],
): LayerViolation[] {
  const layer = layerOfFile(source.file);
  if (layer === 'wiring') return [];
  if (layer === 'unlayered') {
    return [{ file: source.file, rule: 'unlayered-file' }];
  }
  const checked = {
    srcRoot,
    source,
    moduleName,
    rule: LAYER_RULES[layer],
    migratedModules,
  };
  return [...importViolations(checked), ...textViolations(checked)].filter(
    (violation) => !isNamedException(violation),
  );
}

/** Non-spec files of the migrated modules, wiring included. */
export function listCheckedFiles(
  srcRoot: string,
  migratedModules: readonly string[],
): SourceFile[] {
  return listSourceFiles(srcRoot).filter(({ file }) => {
    const moduleName = moduleFolderOf(file);
    const [top = ''] = file.split(sep);
    return (
      moduleName !== null &&
      migratedModules.includes(moduleName) &&
      !LAYER_EXEMPT_ROOTS.includes(top)
    );
  });
}

export function findLayerViolations(
  srcRoot: string,
  migratedModules: readonly string[],
): LayerViolation[] {
  return listCheckedFiles(srcRoot, migratedModules).flatMap((source) =>
    violationsOfFile(
      srcRoot,
      source,
      moduleFolderOf(source.file) ?? '',
      migratedModules,
    ),
  );
}

const isSameViolation = (
  known: KnownLayerViolation,
  violation: LayerViolation,
) =>
  known.from === violation.file &&
  known.rule === violation.rule &&
  (known.to === undefined || known.to === violation.to);

export function unlistedViolations(
  violations: readonly LayerViolation[],
  known: readonly KnownLayerViolation[] = KNOWN_LAYER_VIOLATIONS,
): LayerViolation[] {
  return violations.filter(
    (violation) => !known.some((entry) => isSameViolation(entry, violation)),
  );
}

export function staleKnownViolations(
  violations: readonly LayerViolation[],
  known: readonly KnownLayerViolation[] = KNOWN_LAYER_VIOLATIONS,
): KnownLayerViolation[] {
  return known.filter(
    (entry) =>
      !violations.some((violation) => isSameViolation(entry, violation)),
  );
}
