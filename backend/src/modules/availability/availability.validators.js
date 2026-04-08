const isHourSlotValue = (value) => /^\d{2}:00(:00)?$/.test(value);
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const hasAllWeekdays = (entries) => {
  const weekdays = new Set(entries.map((entry) => entry.weekday));
  return weekdays.size === 7 && [...weekdays].every((weekday) => weekday >= 0 && weekday <= 6);
};

const parseTimeToMinutes = (value) => {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
};

const validateBlocks = (blocks, path, { allowEmpty = true } = {}) => {
  const errors = [];

  if (!Array.isArray(blocks)) {
    return [`${path} must be an array`];
  }

  if (!allowEmpty && blocks.length === 0) {
    errors.push(`${path} must include at least one block`);
    return errors;
  }

  const sortedBlocks = [...blocks].sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)));

  sortedBlocks.forEach((block, blockIndex) => {
    if (!block.startTime || !isHourSlotValue(block.startTime)) {
      errors.push(`${path}[${blockIndex}].startTime must be in HH:00 or HH:00:00 format`);
    }

    if (!block.endTime || !isHourSlotValue(block.endTime)) {
      errors.push(`${path}[${blockIndex}].endTime must be in HH:00 or HH:00:00 format`);
    }

    if (block.startTime && block.endTime && parseTimeToMinutes(block.endTime) - parseTimeToMinutes(block.startTime) < 60) {
      errors.push(`${path}[${blockIndex}] must provide at least one hour of availability`);
    }
  });

  for (let index = 1; index < sortedBlocks.length; index += 1) {
    const previousBlock = sortedBlocks[index - 1];
    const currentBlock = sortedBlocks[index];

    if (parseTimeToMinutes(currentBlock.startTime) < parseTimeToMinutes(previousBlock.endTime)) {
      errors.push(`${path} contain overlapping ranges`);
      break;
    }
  }

  return errors;
};

export const validateAvailabilityPayload = (payload) => {
  const errors = [];

  if (!Array.isArray(payload?.entries) || payload.entries.length !== 7) {
    return ['entries must contain the 7 weekdays'];
  }

  if (!hasAllWeekdays(payload.entries)) {
    errors.push('entries must include each weekday from 0 to 6 exactly once');
  }

  payload.entries.forEach((entry, entryIndex) => {
    errors.push(...validateBlocks(entry.blocks, `entries[${entryIndex}].blocks`));
  });

  return errors;
};

export const validateAvailabilityExceptionPayload = (payload) => {
  const errors = [];

  if (typeof payload?.isUnavailable !== 'boolean') {
    errors.push('isUnavailable must be a boolean');
  }

  if (!Array.isArray(payload?.blocks)) {
    errors.push('blocks must be an array');
  }

  if (Array.isArray(payload?.blocks)) {
    errors.push(...validateBlocks(payload.blocks, 'blocks', { allowEmpty: Boolean(payload?.isUnavailable) }));
  }

  return errors;
};

export const validateAvailabilityExceptionDate = (value) => {
  const errors = [];

  if (!value || !isIsoDate(value)) {
    errors.push('date must be in YYYY-MM-DD format');
  }

  return errors;
};

export const validateAvailabilityExceptionRangePayload = (payload) => {
  const errors = [];

  if (!payload?.startDate || !isIsoDate(payload.startDate)) {
    errors.push('startDate must be in YYYY-MM-DD format');
  }

  if (!payload?.endDate || !isIsoDate(payload.endDate)) {
    errors.push('endDate must be in YYYY-MM-DD format');
  }

  if (
    payload?.startDate &&
    payload?.endDate &&
    isIsoDate(payload.startDate) &&
    isIsoDate(payload.endDate) &&
    payload.endDate < payload.startDate
  ) {
    errors.push('endDate must be equal to or after startDate');
  }

  return errors;
};

export const validateAvailabilityExceptionRangeUpdatePayload = (payload) => {
  const errors = validateAvailabilityExceptionRangePayload(payload);

  if (!payload?.currentStartDate || !isIsoDate(payload.currentStartDate)) {
    errors.push('currentStartDate must be in YYYY-MM-DD format');
  }

  if (!payload?.currentEndDate || !isIsoDate(payload.currentEndDate)) {
    errors.push('currentEndDate must be in YYYY-MM-DD format');
  }

  if (
    payload?.currentStartDate &&
    payload?.currentEndDate &&
    isIsoDate(payload.currentStartDate) &&
    isIsoDate(payload.currentEndDate) &&
    payload.currentEndDate < payload.currentStartDate
  ) {
    errors.push('currentEndDate must be equal to or after currentStartDate');
  }

  return errors;
};
