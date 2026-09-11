// Timezone and localized date calculations for HabitTracker

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getUserTimeZone(req, user) {
  const headerTz = req?.headers?.['x-timezone'];
  if (isValidTimeZone(headerTz)) return headerTz;

  const userTz = user?.user_metadata?.timezone;
  if (isValidTimeZone(userTz)) return userTz;

  return 'UTC';
}

export function getDateInTimeZone(date = new Date(), timeZone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

export function getDateDaysAgoInTimeZone(days, timeZone = 'UTC') {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getDateInTimeZone(d, timeZone);
}

export function addDaysInTimeZone(dateString, days, timeZone = 'UTC') {
  const [year, month, day] = dateString.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return getDateInTimeZone(value, timeZone);
}
