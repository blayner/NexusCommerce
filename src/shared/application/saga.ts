import { Logger } from '@nestjs/common';
import { DomainError } from '../domain/domain-error';
import { err, okVoid, Result } from '../domain/result';

export interface SagaStep<TContext> {
  readonly name: string;
  invoke(context: TContext): Promise<Result<void>>;
  /** Undo the effects of `invoke`. Must be idempotent and should not throw. */
  compensate?(context: TContext): Promise<void>;
}

export interface SagaExecution {
  completedSteps: string[];
  failedStep?: string;
  compensatedSteps: string[];
  compensationFailures: string[];
}

/**
 * Minimal orchestration-based saga: runs steps sequentially and, when one fails,
 * compensates the already completed steps in reverse order.
 */
export class SagaOrchestrator<TContext> {
  private readonly logger: Logger;

  constructor(
    private readonly sagaName: string,
    private readonly steps: readonly SagaStep<TContext>[],
  ) {
    this.logger = new Logger(`Saga:${sagaName}`);
  }

  async run(context: TContext): Promise<{ result: Result<void>; execution: SagaExecution }> {
    const execution: SagaExecution = {
      completedSteps: [],
      compensatedSteps: [],
      compensationFailures: [],
    };
    const completed: SagaStep<TContext>[] = [];

    for (const step of this.steps) {
      let outcome: Result<void>;
      try {
        outcome = await step.invoke(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Step "${step.name}" threw: ${message}`);
        outcome = err(
          DomainError.businessRule(`Step "${step.name}" failed unexpectedly`, { cause: message }),
        );
      }

      if (!outcome.ok) {
        execution.failedStep = step.name;
        this.logger.warn(`Step "${step.name}" failed (${outcome.error.message}); compensating`);
        await this.compensate(completed, context, execution);
        return { result: outcome, execution };
      }

      completed.push(step);
      execution.completedSteps.push(step.name);
    }

    return { result: okVoid(), execution };
  }

  private async compensate(
    completed: SagaStep<TContext>[],
    context: TContext,
    execution: SagaExecution,
  ): Promise<void> {
    for (const step of [...completed].reverse()) {
      if (!step.compensate) continue;
      try {
        await step.compensate(context);
        execution.compensatedSteps.push(step.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A failed compensation needs manual intervention; surface it loudly.
        this.logger.error(
          `Compensation of "${step.name}" in saga "${this.sagaName}" failed: ${message}`,
        );
        execution.compensationFailures.push(step.name);
      }
    }
  }
}
