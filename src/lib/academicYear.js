export function getAcademicYearFromDate(dateValue = new Date()) {
  const d =
    dateValue instanceof Date
      ? dateValue
      : new Date(`${dateValue}T00:00:00`);

  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  return month >= 9
    ? `${year}-${year + 1}`
    : `${year - 1}-${year}`;
}

export function getCurrentAcademicYear() {
  return getAcademicYearFromDate(new Date());
}