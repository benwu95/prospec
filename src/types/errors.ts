/**
 * Prospec Error hierarchy
 *
 * All custom errors extend ProspecError and carry:
 * - message: user-readable error description
 * - code: machine-readable error code (UPPER_SNAKE_CASE)
 * - suggestion: actionable fix recommendation
 */

export class ProspecError extends Error {
  readonly code: string;
  readonly suggestion: string;

  constructor(message: string, code: string, suggestion: string) {
    super(message);
    this.name = 'ProspecError';
    this.code = code;
    this.suggestion = suggestion;
  }
}

// --- Config errors ---

export class ConfigNotFound extends ProspecError {
  constructor(path?: string) {
    super(
      path
        ? `Config file not found: ${path}`
        : 'Config file .prospec.yaml not found',
      'CONFIG_NOT_FOUND',
      'Run `prospec init` first to initialize the project',
    );
    this.name = 'ConfigNotFound';
  }
}

export class ConfigInvalid extends ProspecError {
  constructor(details: string) {
    super(
      `Config validation failed: ${details}`,
      'CONFIG_INVALID',
      'Check that the format of .prospec.yaml is correct',
    );
    this.name = 'ConfigInvalid';
  }
}

// --- File system errors ---

export class ScanError extends ProspecError {
  constructor(path: string, cause?: string) {
    super(
      `Scan failed: ${path}${cause ? ` (${cause})` : ''}`,
      'SCAN_ERROR',
      'Verify the directory path is correct and readable',
    );
    this.name = 'ScanError';
  }
}

export class WriteError extends ProspecError {
  constructor(path: string, cause?: string) {
    super(
      `Write failed: ${path}${cause ? ` (${cause})` : ''}`,
      'WRITE_ERROR',
      'Verify the target path is writable',
    );
    this.name = 'WriteError';
  }
}

export class PermissionError extends WriteError {
  constructor(path: string) {
    super(path, 'Permission denied');
    this.name = 'PermissionError';
  }
}

// --- Parse errors ---

export class YamlParseError extends ProspecError {
  constructor(path: string, cause?: string) {
    super(
      `YAML parse failed: ${path}${cause ? ` (${cause})` : ''}`,
      'YAML_PARSE_ERROR',
      'Check that the YAML file syntax is correct',
    );
    this.name = 'YamlParseError';
  }
}

// --- Template errors ---

export class TemplateError extends ProspecError {
  constructor(templateName: string, cause?: string) {
    super(
      `Template processing failed: ${templateName}${cause ? ` (${cause})` : ''}`,
      'TEMPLATE_ERROR',
      'Verify the template file exists and is correctly formatted',
    );
    this.name = 'TemplateError';
  }
}

// --- Detection errors ---

export class ModuleDetectionError extends ProspecError {
  constructor(cause?: string) {
    super(
      `Module detection failed${cause ? `: ${cause}` : ''}`,
      'MODULE_DETECTION_ERROR',
      'Verify the project structure is as expected, or create module-map.yaml manually',
    );
    this.name = 'ModuleDetectionError';
  }
}

// --- Measurement errors ---

export class MeasurementReportInvalid extends ProspecError {
  constructor(path: string, details: string) {
    super(
      `Measurement report validation failed: ${path} (${details})`,
      'MEASUREMENT_REPORT_INVALID',
      'Regenerate the report with `pnpm measure:tokens` — do not edit it by hand',
    );
    this.name = 'MeasurementReportInvalid';
  }
}

// --- State errors ---

export class AlreadyExistsError extends ProspecError {
  constructor(target: string) {
    super(
      `${target} already exists`,
      'ALREADY_EXISTS',
      'To reinitialize, delete the existing file first',
    );
    this.name = 'AlreadyExistsError';
  }
}

export class PrerequisiteError extends ProspecError {
  constructor(missing: string, suggestion?: string) {
    super(
      `Prerequisite not met: ${missing}`,
      'PREREQUISITE_ERROR',
      suggestion ?? 'Complete the required prerequisite steps first',
    );
    this.name = 'PrerequisiteError';
  }
}
