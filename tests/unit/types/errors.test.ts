import { describe, it, expect } from 'vitest';
import {
  ProspecError,
  ConfigNotFound,
  ConfigInvalid,
  ScanError,
  WriteError,
  PermissionError,
  YamlParseError,
  TemplateError,
  ModuleDetectionError,
  MeasurementReportInvalid,
  DriftReportInvalid,
  McpResourceNotFound,
  AlreadyExistsError,
  PrerequisiteError,
} from '../../../src/types/errors.js';

describe('ProspecError', () => {
  it('carries code and suggestion', () => {
    const err = new ProspecError('boom', 'SOME_CODE', 'do the thing');
    expect(err.code).toBe('SOME_CODE');
    expect(err.suggestion).toBe('do the thing');
    expect(err.message).toBe('boom');
  });

  it('is an instance of Error with its own name', () => {
    const err = new ProspecError('boom', 'SOME_CODE', 'fix');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProspecError');
  });

  it('forwards an underlying cause to preserve the original error', () => {
    const original = new TypeError('original failure');
    const err = new ProspecError('boom', 'SOME_CODE', 'fix', { cause: original });
    expect(err.cause).toBe(original);
  });

  it('leaves cause undefined when no options are passed', () => {
    const err = new ProspecError('boom', 'SOME_CODE', 'fix');
    expect(err.cause).toBeUndefined();
  });
});

describe('ConfigNotFound', () => {
  it('includes the path in the message when one is given', () => {
    const err = new ConfigNotFound('/repo/.prospec.yaml');
    expect(err).toBeInstanceOf(ProspecError);
    expect(err.name).toBe('ConfigNotFound');
    expect(err.code).toBe('CONFIG_NOT_FOUND');
    expect(err.message).toBe('Config file not found: /repo/.prospec.yaml');
    expect(err.suggestion).toBe('Run `prospec init` first to initialize the project');
  });

  it('falls back to the default message when no path is given', () => {
    const err = new ConfigNotFound();
    expect(err.message).toBe('Config file .prospec.yaml not found');
    expect(err.code).toBe('CONFIG_NOT_FOUND');
  });
});

describe('ConfigInvalid', () => {
  it('embeds the validation details in the message', () => {
    const err = new ConfigInvalid('missing field foo');
    expect(err.name).toBe('ConfigInvalid');
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.message).toBe('Config validation failed: missing field foo');
    expect(err.suggestion).toBe('Check that the format of .prospec.yaml is correct');
  });
});

describe('ScanError', () => {
  it('appends the cause in parentheses when provided', () => {
    const err = new ScanError('/some/dir', 'EACCES');
    expect(err).toBeInstanceOf(ProspecError);
    expect(err.name).toBe('ScanError');
    expect(err.code).toBe('SCAN_ERROR');
    expect(err.message).toBe('Scan failed: /some/dir (EACCES)');
    expect(err.suggestion).toBe('Verify the directory path is correct and readable');
  });

  it('omits the parenthetical when no cause is provided', () => {
    const err = new ScanError('/some/dir');
    expect(err.message).toBe('Scan failed: /some/dir');
  });
});

describe('WriteError', () => {
  it('appends the cause in parentheses when provided', () => {
    const err = new WriteError('/out/file', 'disk full');
    expect(err.name).toBe('WriteError');
    expect(err.code).toBe('WRITE_ERROR');
    expect(err.message).toBe('Write failed: /out/file (disk full)');
    expect(err.suggestion).toBe('Verify the target path is writable');
  });

  it('omits the parenthetical when no cause is provided', () => {
    const err = new WriteError('/out/file');
    expect(err.message).toBe('Write failed: /out/file');
  });
});

describe('PermissionError', () => {
  it('is a WriteError carrying a fixed "Permission denied" cause', () => {
    const err = new PermissionError('/locked/file');
    expect(err).toBeInstanceOf(PermissionError);
    expect(err).toBeInstanceOf(WriteError);
    expect(err).toBeInstanceOf(ProspecError);
    expect(err.name).toBe('PermissionError');
    expect(err.code).toBe('WRITE_ERROR');
    expect(err.message).toBe('Write failed: /locked/file (Permission denied)');
    expect(err.suggestion).toBe('Verify the target path is writable');
  });

  it('hardcodes the cause so callers cannot vary it', () => {
    // PermissionError takes only a path; the "Permission denied" cause is fixed
    // by the subclass, distinguishing it from a plain WriteError with no cause.
    const plain = new WriteError('/locked/file');
    const denied = new PermissionError('/locked/file');
    expect(plain.message).toBe('Write failed: /locked/file');
    expect(denied.message).toBe('Write failed: /locked/file (Permission denied)');
  });
});

describe('YamlParseError', () => {
  it('appends the cause in parentheses when provided', () => {
    const err = new YamlParseError('/a.yaml', 'unexpected token');
    expect(err.name).toBe('YamlParseError');
    expect(err.code).toBe('YAML_PARSE_ERROR');
    expect(err.message).toBe('YAML parse failed: /a.yaml (unexpected token)');
  });

  it('omits the parenthetical when no cause is provided', () => {
    const err = new YamlParseError('/a.yaml');
    expect(err.message).toBe('YAML parse failed: /a.yaml');
  });
});

describe('TemplateError', () => {
  it('appends the cause in parentheses when provided', () => {
    const err = new TemplateError('readme.hbs', 'unknown helper');
    expect(err.name).toBe('TemplateError');
    expect(err.code).toBe('TEMPLATE_ERROR');
    expect(err.message).toBe('Template processing failed: readme.hbs (unknown helper)');
  });

  it('omits the parenthetical when no cause is provided', () => {
    const err = new TemplateError('readme.hbs');
    expect(err.message).toBe('Template processing failed: readme.hbs');
  });
});

describe('ModuleDetectionError', () => {
  it('forwards cause so the underlying programming error is not masked', () => {
    const original = new TypeError('pattern.replace is not a function');
    const err = new ModuleDetectionError(original.message, { cause: original });
    expect(err.code).toBe('MODULE_DETECTION_ERROR');
    expect(err.message).toContain('pattern.replace is not a function');
    expect(err.cause).toBe(original);
  });

  it('still works without a cause (backward compatible)', () => {
    const err = new ModuleDetectionError('something');
    expect(err.cause).toBeUndefined();
    expect(err.message).toBe('Module detection failed: something');
  });

  it('omits the detail suffix when no detail is given', () => {
    const err = new ModuleDetectionError();
    expect(err.message).toBe('Module detection failed');
    expect(err.code).toBe('MODULE_DETECTION_ERROR');
    expect(err.cause).toBeUndefined();
  });
});

describe('MeasurementReportInvalid', () => {
  it('combines path and details into the message', () => {
    const err = new MeasurementReportInvalid('/report.json', 'bad schema');
    expect(err.name).toBe('MeasurementReportInvalid');
    expect(err.code).toBe('MEASUREMENT_REPORT_INVALID');
    expect(err.message).toBe('Measurement report validation failed: /report.json (bad schema)');
    expect(err.suggestion).toContain('pnpm measure:tokens');
    expect(err.suggestion).not.toContain('prospec check --json');
  });
});

describe('DriftReportInvalid', () => {
  it('combines path and details into the message', () => {
    const err = new DriftReportInvalid('/drift.json', 'missing key');
    expect(err.name).toBe('DriftReportInvalid');
    expect(err.code).toBe('DRIFT_REPORT_INVALID');
    expect(err.message).toBe('Drift report validation failed: /drift.json (missing key)');
    expect(err.suggestion).toContain('prospec check --json');
    expect(err.suggestion).not.toContain('pnpm measure:tokens');
  });
});

describe('McpResourceNotFound', () => {
  it('appends the cause in parentheses when provided', () => {
    const err = new McpResourceNotFound('prospec://module/foo', 'no such module');
    expect(err.name).toBe('McpResourceNotFound');
    expect(err.code).toBe('MCP_RESOURCE_NOT_FOUND');
    expect(err.message).toBe('MCP resource not found: prospec://module/foo (no such module)');
  });

  it('omits the parenthetical when no cause is provided', () => {
    const err = new McpResourceNotFound('prospec://module/foo');
    expect(err.message).toBe('MCP resource not found: prospec://module/foo');
  });
});

describe('AlreadyExistsError', () => {
  it('reports the target as already existing', () => {
    const err = new AlreadyExistsError('.prospec.yaml');
    expect(err.name).toBe('AlreadyExistsError');
    expect(err.code).toBe('ALREADY_EXISTS');
    expect(err.message).toBe('.prospec.yaml already exists');
    expect(err.suggestion).toBe('To reinitialize, delete the existing file first');
  });
});

describe('PrerequisiteError', () => {
  it('uses the provided suggestion when one is given', () => {
    const err = new PrerequisiteError('config file', 'run prospec init');
    expect(err.name).toBe('PrerequisiteError');
    expect(err.code).toBe('PREREQUISITE_ERROR');
    expect(err.message).toBe('Prerequisite not met: config file');
    expect(err.suggestion).toBe('run prospec init');
  });

  it('falls back to the default suggestion when none is given', () => {
    const err = new PrerequisiteError('config file');
    expect(err.message).toBe('Prerequisite not met: config file');
    expect(err.suggestion).toBe('Complete the required prerequisite steps first');
  });
});
