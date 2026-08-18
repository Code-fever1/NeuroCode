import { TestCase, TestResult } from '../shared/types';

export interface ExecutionContext {
  workspaceRoot: string;
  appUrl: string;
  headless: boolean;
  onProgress?: (result: TestResult, index: number, total: number) => void;
}

export interface ExecutionEngine {
  readonly kind: 'http' | 'browser' | 'process';
  execute(test: TestCase, context: ExecutionContext): Promise<TestResult>;
}
