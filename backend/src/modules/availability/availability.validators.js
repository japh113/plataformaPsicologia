const isHourSlotValue = (value) => /^\d{2}:00(:00)?$/.test(value);

const hasAllWeekdays = (entries) => {
  const weekdays = new Set(entries.map((entry) => entry.weekday));
  return weekdays.size === 7 && [...weekdays].every((weekday) => weekday >= 0 && weekday <= 6);
};

const parseTimeToMinutes = (value) => {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
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
    if (!Array.isArray(entry.blocks)) {
      errors.push(`entries[${entryIndex}].blocks must be an array`);
      return;
    }

    const sortedBlocks = [...entry.blocks].sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)));

    sortedBlocks.forEach((block, blockIndex) => {
      if (!block.startTime || !isHourSlotValue(block.startTime)) {
        errors.push(`entries[${entryIndex}].blocks[${blockIndex}].startTime must be in HH:00 or HH:00:00 format`);
      }

      if (!block.endTime || !isHourSlotValue(block.endTime)) {
        errors.push(`entries[${entryIndex}].blocks[${blockIndex}].endTime must be in HH:00 or HH:00:00 format`);
      }

      if (block.startTime && block.endTime && parseTimeToMinutes(block.endTime) - parseTimeToMinutes(block.startTime) < 60) {
        errors.push(`entries[${entryIndex}].blocks[${blockIndex}] must provide at least one hour of availability`);
      }
    });

    for (let index = 1; index < sortedBlocks.length; index += 1) {
      const previousBlock = sortedBlocks[index - 1];
      const currentBlock = sortedBlocks[index];

      if (parseTimeToMinutes(currentBlock.startTime) < parseTimeToMinutes(previousBlock.endTime)) {
        errors.push(`entries[${entryIndex}].blocks contain overlapping ranges`);
        break;
      }
    }
  });

  return errors;
};
