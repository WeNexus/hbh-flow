import { formatDuration } from '@/modules/format-duration.ts';
import { useEffect, useState } from 'react';

interface Props {
  startDate: string;
  endDate: string | null;
}

export function StepDuration(props: Props) {
  const [duration, setDuration] = useState<string>(
    props.endDate
      ? formatDuration(
          new Date(props.endDate).getTime() -
            new Date(props.startDate).getTime(),
        )
      : '-',
  );

  useEffect(() => {
    const end = props.endDate ? new Date(props.endDate) : null;
    const start = new Date(props.startDate);

    let interval: NodeJS.Timeout | null = null;

    if (!end) {
      interval = setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        setDuration(formatDuration(diff));
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [props.endDate, props.startDate]);

  return <>{duration}</>;
}
