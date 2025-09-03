import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useForkRef } from '@mui/material/utils';
import Button from '@mui/material/Button';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo } from 'react';

import {
  type DatePickerFieldProps,
  DatePicker,
} from '@mui/x-date-pickers/DatePicker';

import {
  type DatePickerSlotProps,
  useSplitFieldProps,
  usePickerContext,
  useParsedFormat,
} from '@mui/x-date-pickers';

type ButtonFieldProps = DatePickerFieldProps;

function ButtonField(props: ButtonFieldProps) {
  const { forwardedProps } = useSplitFieldProps(props, 'date');
  const pickerContext = usePickerContext();
  const handleRef = useForkRef(pickerContext.triggerRef, pickerContext.rootRef);
  const parsedFormat = useParsedFormat();
  const valueStr =
    pickerContext.value == null
      ? parsedFormat
      : pickerContext.value.format(pickerContext.fieldFormat);

  return (
    <Button
      onClick={() => pickerContext.setOpen((prev) => !prev)}
      startIcon={<CalendarTodayRoundedIcon fontSize="small" />}
      sx={{ minWidth: 'fit-content' }}
      {...forwardedProps}
      variant="outlined"
      ref={handleRef}
      size="small"
    >
      {pickerContext.label ?? valueStr}
    </Button>
  );
}

const slotProps: DatePickerSlotProps<true> = {
  nextIconButton: { size: 'small' },
  previousIconButton: { size: 'small' },
};
const views = ['year', 'month', 'day'] as const;
const slots = { field: ButtonField };

export default function CustomDatePicker({
  value: _value,
  onChange,
}: {
  value?: Dayjs | null;
  onChange?: (date: Dayjs | null) => void;
}) {
  const value = useMemo(() => {
    if (!_value) {
      return dayjs(new Date());
    }

    return _value;
  }, [_value]);

  const label = useMemo(() => {
    if (!value) {
      return null;
    }

    return value.format('MMM DD, YYYY');
  }, [value]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        showDaysOutsideCurrentMonth={false}
        slotProps={slotProps}
        onAccept={onChange}
        closeOnSelect
        disableFuture
        slots={slots}
        views={views}
        label={label}
        value={value}
      />
    </LocalizationProvider>
  );
}
