import type { JobDetailSchema } from '@/types/schema.ts';
import ReactJsonView from '@microlink/react-json-view';
import { isObject } from 'lodash-es';
import { useMemo } from 'react';

interface Props {
  step: string;
  job: JobDetailSchema;
}

export function StepDetails(props: Props) {
  const step = useMemo(() => {
    return props.job.Steps.find((s) => s.name === props.step) || null;
  }, [props.job.Steps, props.step]);

  const result = useMemo(() => {
    if (!step || !step.result) {
      return { result: null };
    }

    if (!isObject(step.result)) {
      return { result: step.result };
    }

    return { result: step.result };
  }, [step]);

  return (
    <ReactJsonView
      displayDataTypes={false}
      src={result}
      name={props.step}
      shouldCollapse={() => true}
    />
  );
}
